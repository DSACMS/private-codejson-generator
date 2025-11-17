# Initialization
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0.0"
}

provider "aws" {
  region = "us-gov-west-1"
}

data "aws_region" "current" {}
data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  tags = {
    Environment = var.env
    Project = "static-github-oauth"
  }
}


# Roles and Policies
resource "aws_iam_role" "lambda_role" {
  name                 = "${var.name}-${var.env}-role"
  path                 = "/delegatedadmin/developer/"
  permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/cms-cloud-admin/developer-boundary-policy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_dynamodb_policy" {
  name = "${var.name}-${var.env}-dynamodb_policy"

  policy =  jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",      
          "dynamodb:PutItem",      
          "dynamodb:DeleteItem",   
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.oauth_states.arn,
          aws_dynamodb_table.sessions.arn
        ]
      }
    ]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_attach" {
  role = aws_iam_role.lambda_role.id
  policy_arn = aws_iam_policy.lambda_dynamodb_policy.id
}


#DyanmoDB Tables
resource "aws_dynamodb_table" "oauth_states" {
  name = "${var.name}-oauth-states-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "state"

  attribute {
    name = "state"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled = true
  }

  tags = local.tags
}

resource "aws_dynamodb_table" "sessions" {
  name = "${var.name}-sessions-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "sessionToken"

  attribute {
    name = "sessionToken"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled = true
  }

  tags = local.tags
}


# Lambda Functions
module "lambda_initiate_oauth" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "6.0.1"

  function_name = "${var.name}-initiate_oauth-${var.env}"
  description = "Initiates Github OAuth flow by generating a state token"
  timeout       = 30
  memory_size   = 1024
  runtime       = "python3.13"
  handler       = "initiate_oauth.lambda_handler"
  source_path   = "${path.module}/lambda/initiate_oauth"
  create_role = false
  lambda_role   = aws_iam_role.lambda_role.arn
  publish       = true

  environment_variables = {
    OAUTH_STATES_TABLE = aws_dynamodb_table.oauth_states.name
    GITHUB_CLIENT_ID = var.github_client_id
    CALLBACK_URL = "${module.apigw.api_endpoint}/auth/callback"
    FRONTEND_URL = var.frontend_url
  }

  allowed_triggers = {
    APIGatewayInitiate = {
      service = "apigateway"
      source_arn = "${module.apigw.api_execution_arn}/*/*/auth/initiate"
    }
  }

  tags = local.tags
}

module "lambda_oauth_callback" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "6.0.1"

  function_name = "${var.name}-oauth_callback-${var.env}"
  description = "Handles OAuth callback and exhanges code for required token"
  timeout       = 30
  memory_size   = 1024
  runtime       = "python3.13"
  handler       = "oauth_callback.lambda_handler"
  source_path   = [
    {
      path = "${path.module}/lambda/oauth_callback"
      pip_requirements = "${path.module}/lambda/oauth_callback/requirements.txt"
    }
  ]
  create_role = false
  lambda_role   = aws_iam_role.lambda_role.arn
  publish       = true

  environment_variables = {
    OAUTH_STATES_TABLE = aws_dynamodb_table.oauth_states.name
    SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    GITHUB_CLIENT_ID = var.github_client_id
    GITHUB_CLIENT_SECRET = var.github_client_secret  
    ENCRYPTION_KEY = var.encryption_key
    FRONTEND_URL = var.frontend_url
  }

  allowed_triggers = {
    APIGatewayCallback = {
      service = "apigateway"
      source_arn = "${module.apigw.api_execution_arn}/*/*/auth/callback"
    }
  }

  tags = local.tags
}

module "lambda_get_repos" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "6.0.1"

  function_name = "${var.name}-get-repos-${var.env}"
  description   = "Fetches user repositories from GitHub"
  runtime       = "python3.13"
  handler       = "get_repos.lambda_handler"
  timeout       = 30
  memory_size   = 512

  source_path = [
    {
      path             = "${path.module}/lambda/get_repos"
      pip_requirements = "${path.module}/lambda/get_repos/requirements.txt"
    }
  ]

  create_role = false
  lambda_role = aws_iam_role.lambda_role.arn
  publish     = true

  environment_variables = {
    SESSIONS_TABLE = aws_dynamodb_table.sessions.name
    ENCRYPTION_KEY = var.encryption_key
  }

  allowed_triggers = {
    APIGatewayGetRepos = {
      service    = "apigateway"
      source_arn = "${module.apigw.api_execution_arn}/*/*/repos"
    }
  }

  tags = local.tags
}


# API Gateway
module "apigw" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "5.3.0"

  name          = "${var.name}-${var.env}"
  description = "API Gateway for Static Github Oauth"
  protocol_type = "HTTP"

  cors_configuration = {
    allow_headers = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods = ["*"]
    allow_origins = ["*"]
  }

  create_domain_name = false
  create_stage       = true
  stage_name         = "$default"

  routes = {
    "GET /auth/initiate" = {
      integration = {
        uri                    = module.lambda_initiate_oauth.lambda_function_arn
        payload_format_version = "2.0" 
        timeout_milliseconds   = 30000
      }
    }

    "GET /auth/callback" = {
      integration = {
        uri                    = module.lambda_oauth_callback.lambda_function_arn
        payload_format_version = "2.0"
        timeout_milliseconds   = 30000
      }
    }

    "GET /repos" = {
      integration = {
        uri                    = module.lambda_get_repos.lambda_function_arn
        payload_format_version = "2.0"
        timeout_milliseconds   = 30000
      }
    }
  }

  tags = local.tags
}

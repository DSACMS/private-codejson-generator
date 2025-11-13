output "api_gateway_endpoint" {
  value = module.apigw.api_endpoint
}

output "oauth_callback_url" {
  description = "Use this URL as your GitHub OAuth callback URL"
  value       = "${module.apigw.api_endpoint}/auth/callback"
}

output "dynamodb_tables" {
  description = "DynamoDB table names"
  value = {
    oauth_states = aws_dynamodb_table.oauth_states.name
    sessions     = aws_dynamodb_table.sessions.name
  }
}
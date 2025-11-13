variable "name" { default = "private-codejson-generator" }
variable "env" { default = "dev" }
variable "frontend_url" {
  description = "Your GitHub Pages URL"
  type        = string
}
variable "github_client_id" {
  description = "GitHub OAuth App Client ID"
  type        = string
}

variable "github_client_secret" {
  description = "GitHub OAuth App Client Secret"
  type        = string
  sensitive   = true 
}

variable "encryption_key" {
  description = "Fernet encryption key for storing GitHub tokens"
  type        = string
  sensitive   = true
}

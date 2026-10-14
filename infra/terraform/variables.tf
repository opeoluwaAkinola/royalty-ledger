variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name, used in resource names (e.g. dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 lowercase letters, digits or dashes."
  }
}

variable "lambda_source_dir" {
  description = "Built pipeline bundle (run `npm run build` in services/pipeline first)."
  type        = string
  default     = "../../services/pipeline/dist"
}

variable "ingest_rate_limit" {
  description = "API Gateway steady-state requests/second across all partners."
  type        = number
  default     = 200
}

variable "ingest_burst_limit" {
  type    = number
  default = 400
}

variable "aggregator_max_concurrency" {
  description = "Caps concurrent aggregator Lambdas so DynamoDB write throughput stays predictable."
  type        = number
  default     = 20
}

variable "log_retention_days" {
  type    = number
  default = 14
}

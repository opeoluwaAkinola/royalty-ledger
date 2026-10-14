terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.6"
    }
  }

  # Uncomment and point at your own state bucket for team use.
  # backend "s3" {
  #   bucket       = "my-terraform-state"
  #   key          = "royalty-ledger/terraform.tfstate"
  #   region       = "us-west-2"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "royalty-ledger"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

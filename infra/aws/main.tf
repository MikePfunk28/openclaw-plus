# AWS Terraform Configuration for AI Applications
# Includes: Bedrock, SageMaker, Lambda, S3, EC2, ECS, EKS, RDS, DynamoDB

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "ai-infra/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "OpenClaw-AI"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# LocalStack provider (for local development)
provider "aws" {
  alias                       = "localstack"
  region                      = "us-east-1"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    s3             = "http://localhost:4566"
    lambda         = "http://localhost:4566"
    apigateway     = "http://localhost:4566"
    dynamodb       = "http://localhost:4566"
    sqs            = "http://localhost:4566"
    sns            = "http://localhost:4566"
    cloudwatch     = "http://localhost:4566"
    cloudwatchlogs = "http://localhost:4566"
    ec2            = "http://localhost:4566"
    ecs            = "http://localhost:4566"
    ecr            = "http://localhost:4566"
    iam            = "http://localhost:4566"
    kms            = "http://localhost:4566"
    secretsmanager = "http://localhost:4566"
    stepfunctions  = "http://localhost:4566"
  }
}

# =============================================================================
# Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  default     = "development"
}

variable "project_name" {
  description = "Project name"
  default     = "openclaw-ai"
}

# =============================================================================
# VPC Configuration
# =============================================================================

module "vpc" {
  source = "./modules/vpc"

  name               = "${var.project_name}-vpc"
  cidr               = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# S3 Buckets
# =============================================================================

resource "aws_s3_bucket" "data_bucket" {
  bucket = "${var.project_name}-data-${var.environment}"

  tags = {
    Name = "${var.project_name}-data"
  }
}

resource "aws_s3_bucket_versioning" "data_bucket" {
  bucket = aws_s3_bucket.data_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_bucket" {
  bucket = aws_s3_bucket.data_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket" "model_bucket" {
  bucket = "${var.project_name}-models-${var.environment}"

  tags = {
    Name = "${var.project_name}-models"
  }
}

# =============================================================================
# DynamoDB
# =============================================================================

resource "aws_dynamodb_table" "sessions" {
  name         = "${var.project_name}-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_id"
  range_key    = "created_at"

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "N"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-sessions"
  }
}

resource "aws_dynamodb_table" "conversations" {
  name         = "${var.project_name}-conversations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "conversation_id"
  range_key    = "message_id"

  attribute {
    name = "conversation_id"
    type = "S"
  }

  attribute {
    name = "message_id"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-conversations"
  }
}

# =============================================================================
# Lambda Functions
# =============================================================================

resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachments" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "ai_processor" {
  filename      = "lambda/ai_processor.zip"
  function_name = "${var.project_name}-ai-processor"
  role          = aws_iam_role.lambda_execution.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 300
  memory_size   = 1024

  environment {
    variables = {
      DATA_BUCKET    = aws_s3_bucket.data_bucket.id
      SESSIONS_TABLE = aws_dynamodb_table.sessions.id
      LOG_LEVEL      = "INFO"
    }
  }

  tags = {
    Name = "${var.project_name}-ai-processor"
  }
}

# =============================================================================
# API Gateway
# =============================================================================

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
  }
}

resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = var.environment
  auto_deploy = true
}

# =============================================================================
# SageMaker (for custom ML models)
# =============================================================================

resource "aws_iam_role" "sagemaker_execution" {
  name = "${var.project_name}-sagemaker-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "sagemaker.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "sagemaker_full" {
  role       = aws_iam_role.sagemaker_execution.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
}

# Note: Bedrock doesn't require infrastructure provisioning - it's a managed service
# Just ensure IAM permissions for bedrock:InvokeModel

# =============================================================================
# ECS Cluster (for containerized AI services)
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE_SPOT"
  }

  default_capacity_provider_strategy {
    weight            = 0
    capacity_provider = "FARGATE"
  }
}

# =============================================================================
# ECR Repository
# =============================================================================

resource "aws_ecr_repository" "main" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# =============================================================================
# Secrets Manager
# =============================================================================

resource "aws_secretsmanager_secret" "api_keys" {
  name = "${var.project_name}-api-keys"

  tags = {
    Name = "${var.project_name}-api-keys"
  }
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 14
}

# =============================================================================
# Outputs
# =============================================================================

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "data_bucket_name" {
  value = aws_s3_bucket.data_bucket.id
}

output "model_bucket_name" {
  value = aws_s3_bucket.model_bucket.id
}

output "api_endpoint" {
  value = "${aws_apigatewayv2_api.main.api_endpoint}/${aws_apigatewayv2_stage.main.name}"
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.main.repository_url
}

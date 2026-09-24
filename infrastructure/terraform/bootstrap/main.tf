# One-time, run locally with admin credentials. Creates what CI needs before
# CI can exist: the Terraform state bucket and an IAM role GitHub Actions
# assumes through OIDC (no long-lived AWS keys in GitHub).

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "wkc"
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy."
  type        = string
}

variable "github_branch" {
  description = "Branch allowed to deploy."
  type        = string
  default     = "main"
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-terraform-state-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.project}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_assume.json
}

# Deploy needs to manage every resource in ../ plus sync the site. Scoped to
# the services used rather than AdministratorAccess.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid = "Infra"
    actions = [
      "s3:*",
      "cloudfront:*",
      "acm:*",
      "route53:*",
      "lambda:*",
      "apigateway:*",
      "dynamodb:*",
      "logs:*",
      "cloudwatch:*",
      "ssm:GetParameter*",
      "ssm:PutParameter",
      "ssm:AddTagsToResource",
      "ssm:ListTagsForResource",
      "ssm:DescribeParameters",
      "ssm:DeleteParameter",
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:PassRole",
      "iam:TagRole",
      "iam:ListRolePolicies",
      "iam:GetRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.project}-github-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "deploy_role_arn" {
  description = "Store as the AWS_DEPLOY_ROLE_ARN GitHub secret."
  value       = aws_iam_role.deploy.arn
}

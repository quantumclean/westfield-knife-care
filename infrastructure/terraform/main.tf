data "aws_caller_identity" "current" {}

locals {
  name        = "${var.project}-${var.stage}"
  site_url    = "https://${var.domain_name}"
  bucket_name = var.site_bucket_name != "" ? var.site_bucket_name : "${local.name}-site-${data.aws_caller_identity.current.account_id}"
  ssm_prefix  = "/${var.project}/${var.stage}"
  tags = {
    Project   = var.project
    Stage     = var.stage
    ManagedBy = "terraform"
  }
}

module "s3" {
  source      = "../s3"
  bucket_name = local.bucket_name
  tags        = local.tags
}

module "lambda" {
  source               = "../lambda"
  name                 = local.name
  stage                = var.stage
  source_dir           = var.api_source_dir
  site_url             = local.site_url
  cors_origins         = local.site_url
  ssm_parameter_prefix = local.ssm_prefix
  tags                 = local.tags
}

module "cloudfront" {
  source = "../cloudfront"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name                           = local.name
  domain_name                    = var.domain_name
  hosted_zone_id                 = var.hosted_zone_id
  s3_bucket_id                   = module.s3.bucket_id
  s3_bucket_regional_domain_name = module.s3.bucket_regional_domain_name
  api_origin_domain              = module.lambda.api_domain
  tags                           = local.tags
}

# The bucket policy references the distribution and the distribution
# references the bucket, so the policy lives here rather than in a module.
data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${module.s3.bucket_arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [module.cloudfront.distribution_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = module.s3.bucket_id
  policy = data.aws_iam_policy_document.site_bucket.json
}

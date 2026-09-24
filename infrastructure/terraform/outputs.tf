output "site_url" {
  value = local.site_url
}

output "site_bucket" {
  description = "Sync apps/web/dist here."
  value       = module.s3.bucket_id
}

output "cloudfront_distribution_id" {
  description = "Invalidate after each web deploy."
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "CNAME target when DNS is managed outside Route53."
  value       = module.cloudfront.distribution_domain_name
}

output "acm_validation_records" {
  description = "Create these CNAMEs to validate the certificate (external DNS only)."
  value       = module.cloudfront.acm_validation_records
}

output "api_endpoint" {
  description = "Direct API Gateway URL (the site uses /api on its own domain)."
  value       = module.lambda.api_endpoint
}

output "stripe_webhook_url" {
  value = "${local.site_url}/api/webhooks/stripe"
}

output "ssm_parameter_names" {
  description = "Set these with `aws ssm put-parameter --overwrite --type SecureString`."
  value       = module.lambda.ssm_parameter_names
}

output "lambda_function_name" {
  value = module.lambda.function_name
}

output "dynamodb_table_name" {
  value = module.lambda.table_name
}

output "log_group_name" {
  value = module.lambda.log_group_name
}

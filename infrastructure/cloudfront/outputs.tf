output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "distribution_domain_name" {
  description = "Point a CNAME at this when DNS is managed outside Route53."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "acm_validation_records" {
  description = "DNS records that prove domain ownership to ACM (external DNS only)."
  value = [
    for dvo in aws_acm_certificate.site.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
}

# CloudFront in front of the static site (S3) and the API (API Gateway).
# Serving /api/* from the same hostname keeps the browser same-origin, so no
# CORS in production and one certificate.

locals {
  use_route53 = var.hosted_zone_id != ""
}

# ---- Certificate (CloudFront requires us-east-1) ----

resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = local.use_route53 ? {
    for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

# Waits until the certificate is issued. With external DNS, create the CNAME
# from the `acm_validation_records` output first (see README).
resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = local.use_route53 ? [for r in aws_route53_record.validation : r.fqdn] : null
}

# ---- Origin access and edge function ----

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Maps pretty URLs onto the static files Vite emits: /thanks -> /thanks.html.
resource "aws_cloudfront_function" "pretty_urls" {
  name    = "${var.name}-pretty-urls"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/pretty-urls.js")
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.name}-security-headers"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

# AWS managed policy ids (stable, documented by AWS).
locals {
  cache_optimized_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  cache_disabled_id             = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  origin_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = var.name
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = var.price_class
  http_version        = "http2and3"
  tags                = var.tags

  origin {
    origin_id                = "s3-site"
    domain_name              = var.s3_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_origin_domain
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "s3-site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_optimized_id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.pretty_urls.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.origin_all_viewer_except_host
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/index.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ---- DNS (optional) ----

resource "aws_route53_record" "alias" {
  for_each = local.use_route53 ? toset(["A", "AAAA"]) : toset([])

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

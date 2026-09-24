variable "name" {
  description = "Prefix for named resources, e.g. wkc-prod."
  type        = string
}

variable "domain_name" {
  description = "Public hostname for the site, e.g. sharp.example.com."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 zone for domain_name. Leave empty when DNS lives elsewhere; validation and alias records are then created manually from the outputs."
  type        = string
  default     = ""
}

variable "s3_bucket_id" {
  type = string
}

variable "s3_bucket_regional_domain_name" {
  type = string
}

variable "api_origin_domain" {
  description = "Hostname of the API Gateway HTTP API, e.g. abc123.execute-api.us-east-1.amazonaws.com."
  type        = string
}

variable "price_class" {
  type    = string
  default = "PriceClass_100"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "project" {
  description = "Short project slug used in resource names."
  type        = string
  default     = "wkc"
}

variable "stage" {
  description = "Deployment stage, e.g. prod or staging."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "Region for the API, table and bucket."
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Public hostname for the site, e.g. sharp.example.com. A subdomain keeps the main site untouched."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone id for domain_name. Empty when DNS is managed elsewhere."
  type        = string
  default     = ""
}

variable "site_bucket_name" {
  description = "Override for the site bucket name (defaults to <project>-<stage>-site-<account id>)."
  type        = string
  default     = ""
}

variable "api_source_dir" {
  description = "Bundled API directory. Build it first: pnpm --filter @wkc/api build."
  type        = string
  default     = "../../apps/api/dist"
}

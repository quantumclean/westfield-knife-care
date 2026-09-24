variable "name" {
  description = "Prefix for named resources, e.g. wkc-prod."
  type        = string
}

variable "stage" {
  description = "Environment label passed to the API (prod, staging)."
  type        = string
}

variable "source_dir" {
  description = "Directory containing the bundled handler (apps/api/dist)."
  type        = string
}

variable "site_url" {
  description = "Public site origin used for Stripe redirects."
  type        = string
}

variable "cors_origins" {
  description = "Comma-separated origins allowed cross-origin (usually just site_url)."
  type        = string
}

variable "ssm_parameter_prefix" {
  description = "SSM path under which secrets live, e.g. /wkc/prod."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "memory_size" {
  type    = number
  default = 512
}

variable "throttle_rate_limit" {
  description = "Steady-state requests per second allowed at the API stage."
  type        = number
  default     = 50
}

variable "throttle_burst_limit" {
  type    = number
  default = 100
}

variable "tags" {
  type    = map(string)
  default = {}
}

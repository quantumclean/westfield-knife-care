variable "bucket_name" {
  description = "Globally unique bucket name for the static site."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

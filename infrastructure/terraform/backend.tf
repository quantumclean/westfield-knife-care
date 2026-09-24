# State lives in the bucket created by ./bootstrap. Settings are passed at
# init time so nothing account-specific is committed:
#   terraform init -backend-config=backend.hcl
terraform {
  backend "s3" {}
}

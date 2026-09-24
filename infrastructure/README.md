# Infrastructure

Terraform for AWS. Nothing here needs to be run by hand after the first
bootstrap; `.github/workflows/deploy.yml` applies it on every push to `main`.

| Directory     | What it is                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| `terraform/`  | Root module: composes the three modules below and holds outputs             |
| `s3/`         | Private bucket for the static site                                          |
| `cloudfront/` | Distribution, certificate, edge function, `/api/*` routing to the API       |
| `lambda/`     | Lambda + HTTP API Gateway + DynamoDB table + SSM secret parameters + alarms |

`terraform/bootstrap/` is a separate, one-time module that creates the state
bucket and the GitHub OIDC deploy role. See the root README for the sequence.

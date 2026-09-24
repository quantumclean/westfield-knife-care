# Infrastructure

Terraform for AWS. Nothing here needs to be run by hand after the first
bootstrap: `.github/workflows/deploy-staging.yml` applies it on demand
(`stage=staging`), `.github/workflows/deploy.yml` applies it on every push to
`main` (`stage=prod`). The two stages are fully separate stacks — every
resource name is prefixed `<project>-<stage>` and secrets live under their
own SSM path (`/wkc/staging/...`, `/wkc/prod/...`) — so a staging apply can
never touch production.

| Directory     | What it is                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| `terraform/`  | Root module: composes the three modules below and holds outputs             |
| `s3/`         | Private bucket for the static site                                          |
| `cloudfront/` | Distribution, certificate, edge function, `/api/*` routing to the API       |
| `lambda/`     | Lambda + HTTP API Gateway + DynamoDB table + SSM secret parameters + alarms |

`terraform/environments/` holds example `.tfvars` for each stage (copy to a
gitignored `.tfvars` and fill in before a manual apply). `terraform/bootstrap/`
is a separate, one-time module that creates the state bucket and the GitHub
OIDC deploy role. See the root README and `docs/go-live.md` for the full
sequence.

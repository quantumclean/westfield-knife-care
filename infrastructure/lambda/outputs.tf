output "api_endpoint" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "api_domain" {
  description = "Hostname used as the CloudFront origin."
  value       = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "ssm_parameter_names" {
  value = [for p in aws_ssm_parameter.secret : p.name]
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.api.name
}

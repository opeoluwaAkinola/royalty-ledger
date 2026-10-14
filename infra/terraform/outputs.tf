output "ingest_url" {
  description = "Partners POST play events to this URL + /v1/plays."
  value       = aws_apigatewayv2_api.ingest.api_endpoint
}

output "table_name" {
  value = aws_dynamodb_table.ledger.name
}

output "queue_url" {
  value = aws_sqs_queue.plays.url
}

output "dlq_url" {
  value = aws_sqs_queue.plays_dlq.url
}

output "alerts_topic_arn" {
  description = "Subscribe an email or pager to receive alarms."
  value       = aws_sns_topic.alerts.arn
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

output "royalty_service_read_policy_arn" {
  description = "Attach to the royalty-service's runtime role (ECS task role or EKS pod identity)."
  value       = aws_iam_policy.royalty_service_read.arn
}

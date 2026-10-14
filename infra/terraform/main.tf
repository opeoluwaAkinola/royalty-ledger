locals {
  name               = "royalty-ledger-${var.environment}"
  aggregator_timeout = 60
}

# ---------------------------------------------------------------------------
# DynamoDB: single table for dedupe records, sharded aggregates and totals.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "ledger" {
  name         = local.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = var.environment == "prod"
}

# ---------------------------------------------------------------------------
# SQS: plays queue with a dead-letter queue after 5 failed receives.
# ---------------------------------------------------------------------------
resource "aws_sqs_queue" "plays_dlq" {
  name                      = "${local.name}-plays-dlq"
  message_retention_seconds = 14 * 86400
  sqs_managed_sse_enabled   = true
}

# Visibility timeout follows the AWS guidance of at least 6x the consumer Lambda's timeout.
resource "aws_sqs_queue" "plays" {
  name                       = "${local.name}-plays"
  visibility_timeout_seconds = 6 * local.aggregator_timeout
  message_retention_seconds  = 4 * 86400
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.plays_dlq.arn
    maxReceiveCount     = 5
  })
}

# ---------------------------------------------------------------------------
# Lambdas: one bundle, two handlers.
# ---------------------------------------------------------------------------
data "archive_file" "pipeline" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = "${path.module}/.build/pipeline.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = toset(["ingest", "aggregator"])
  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

# Ingest may only send to the plays queue.
data "aws_iam_policy_document" "ingest" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.plays.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.fn["ingest"].arn}:*"]
  }
  statement {
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

# The aggregator may only consume the queue and write (never read or delete) ledger items.
data "aws_iam_policy_document" "aggregator" {
  statement {
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.plays.arn]
  }
  statement {
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem"]
    resources = [aws_dynamodb_table.ledger.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.fn["aggregator"].arn}:*"]
  }
  statement {
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "fn" {
  for_each           = toset(["ingest", "aggregator"])
  name               = "${local.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "ingest" {
  role   = aws_iam_role.fn["ingest"].id
  policy = data.aws_iam_policy_document.ingest.json
}

resource "aws_iam_role_policy" "aggregator" {
  role   = aws_iam_role.fn["aggregator"].id
  policy = data.aws_iam_policy_document.aggregator.json
}

resource "aws_lambda_function" "ingest" {
  function_name    = "${local.name}-ingest"
  role             = aws_iam_role.fn["ingest"].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "src/ingest.handler"
  filename         = data.archive_file.pipeline.output_path
  source_code_hash = data.archive_file.pipeline.output_base64sha256
  memory_size      = 512
  timeout          = 10

  environment {
    variables = { QUEUE_URL = aws_sqs_queue.plays.url }
  }
  tracing_config {
    mode = "Active"
  }
  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.ingest]
}

resource "aws_lambda_function" "aggregator" {
  function_name    = "${local.name}-aggregator"
  role             = aws_iam_role.fn["aggregator"].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "src/aggregate.handler"
  filename         = data.archive_file.pipeline.output_path
  source_code_hash = data.archive_file.pipeline.output_base64sha256
  memory_size      = 512
  timeout          = local.aggregator_timeout

  environment {
    variables = { TABLE_NAME = aws_dynamodb_table.ledger.name }
  }
  tracing_config {
    mode = "Active"
  }
  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.aggregator]
}

# Partial batch responses: only failed messages are retried, and they reach the DLQ after 5 receives.
resource "aws_lambda_event_source_mapping" "plays" {
  event_source_arn                   = aws_sqs_queue.plays.arn
  function_name                      = aws_lambda_function.aggregator.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 1
  function_response_types            = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.aggregator_max_concurrency
  }
}

# ---------------------------------------------------------------------------
# HTTP API for partners: POST /v1/plays, throttled at the edge.
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "ingest" {
  name          = "${local.name}-ingest"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "ingest" {
  api_id                 = aws_apigatewayv2_api.ingest.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ingest.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "plays" {
  api_id             = aws_apigatewayv2_api.ingest.id
  route_key          = "POST /v1/plays"
  target             = "integrations/${aws_apigatewayv2_integration.ingest.id}"
  authorization_type = "AWS_IAM" # partners sign requests with SigV4
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.ingest.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.ingest_rate_limit
    throttling_burst_limit = var.ingest_burst_limit
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ingest.execution_arn}/*/*/v1/plays"
}

# ---------------------------------------------------------------------------
# Alarms: anything in the DLQ, a growing backlog, or a failing aggregator.
# ---------------------------------------------------------------------------
resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${local.name}-dlq-not-empty"
  alarm_description   = "Play events failed processing 5 times. Inspect, fix, then run the redrive script."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.plays_dlq.name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "backlog_age" {
  alarm_name          = "${local.name}-backlog-age"
  alarm_description   = "Oldest play event has waited more than 5 minutes. The aggregator is falling behind."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = aws_sqs_queue.plays.name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 300
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "aggregator_errors" {
  alarm_name          = "${local.name}-aggregator-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.aggregator.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------
# Containers (royalty-service, web) and the royalty-service's read-only access to the table.
# ---------------------------------------------------------------------------
resource "aws_ecr_repository" "service" {
  for_each             = toset(["royalty-service", "web"])
  name                 = "royalty-ledger/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.environment != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }
}

data "aws_iam_policy_document" "royalty_service_read" {
  statement {
    actions   = ["dynamodb:Query"]
    resources = [aws_dynamodb_table.ledger.arn]
  }
}

resource "aws_iam_policy" "royalty_service_read" {
  name   = "${local.name}-royalty-service-read"
  policy = data.aws_iam_policy_document.royalty_service_read.json
}

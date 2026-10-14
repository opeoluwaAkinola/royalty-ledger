import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';

// Endpoints are overridden locally (DynamoDB Local, ElasticMQ) and unset in AWS.
const local = (endpoint) => (endpoint
  ? { endpoint, region: process.env.AWS_REGION ?? 'us-west-2', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
  : {});

export const ddb = () => DynamoDBDocumentClient.from(new DynamoDBClient(local(process.env.DYNAMODB_ENDPOINT)));
export const ddbRaw = () => new DynamoDBClient(local(process.env.DYNAMODB_ENDPOINT));
export const sqs = () => new SQSClient(local(process.env.SQS_ENDPOINT));

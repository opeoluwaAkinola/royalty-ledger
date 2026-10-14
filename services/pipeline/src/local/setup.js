// Creates the DynamoDB table locally. In AWS, Terraform owns it (infra/terraform).
import { CreateTableCommand, DescribeTableCommand, UpdateTimeToLiveCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { ddbRaw } from '../clients.js';

const client = ddbRaw();
const TableName = process.env.TABLE_NAME ?? 'royalty-ledger';

try {
  await client.send(new DescribeTableCommand({ TableName }));
  console.log(`table ${TableName} already exists`);
} catch (err) {
  if (err.name !== 'ResourceNotFoundException') throw err;
  await client.send(new CreateTableCommand({
    TableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
  }));
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName });
  await client.send(new UpdateTimeToLiveCommand({ TableName, TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true } }));
  console.log(`created table ${TableName}`);
}

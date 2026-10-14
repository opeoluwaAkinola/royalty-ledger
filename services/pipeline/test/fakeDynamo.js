// In-memory DynamoDB with just enough TransactWriteItems semantics to test the aggregator:
// all-or-nothing, attribute_not_exists conditions, ADD/SET updates and CancellationReasons.
export class FakeDynamo {
  constructor() {
    this.items = new Map();
    this.calls = 0;
    this.conflictsToInject = 0;
  }

  key(k) {
    return `${k.pk}|${k.sk}`;
  }

  async send(cmd) {
    this.calls++;
    const items = cmd.input.TransactItems;
    if (this.conflictsToInject > 0) {
      this.conflictsToInject--;
      throw Object.assign(new Error('conflict'), {
        name: 'TransactionCanceledException',
        CancellationReasons: items.map(() => ({ Code: 'TransactionConflict' })),
      });
    }
    const reasons = items.map((it) => (it.Put && this.items.has(this.key(it.Put.Item)) ? { Code: 'ConditionalCheckFailed' } : { Code: 'None' }));
    if (reasons.some((r) => r.Code !== 'None')) {
      throw Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException', CancellationReasons: reasons });
    }
    for (const it of items) {
      if (it.Put) this.items.set(this.key(it.Put.Item), { ...it.Put.Item });
      if (it.Update) {
        const k = this.key(it.Update.Key);
        const row = this.items.get(k) ?? { ...it.Update.Key };
        const v = it.Update.ExpressionAttributeValues;
        const [addPart, setPart = ''] = it.Update.UpdateExpression.replace(/^ADD /, '').split(' SET ');
        for (const clause of addPart.split(',')) {
          const [attr, ph] = clause.trim().split(' ');
          row[attr] = (row[attr] ?? 0) + v[ph];
        }
        for (const clause of setPart.split(',').filter(Boolean)) {
          const [attr, ph] = clause.split('=').map((s) => s.trim());
          row[attr] = v[ph];
        }
        this.items.set(k, row);
      }
    }
    return {};
  }

  rows(prefix) {
    return [...this.items.values()].filter((r) => r.sk.startsWith(prefix));
  }

  sum(prefix, attr) {
    return this.rows(prefix).reduce((n, r) => n + r[attr], 0);
  }
}

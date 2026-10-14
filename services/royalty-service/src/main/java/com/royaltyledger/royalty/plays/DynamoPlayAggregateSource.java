package com.royaltyledger.royalty.plays;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

/**
 * Reads what the pipeline wrote. Each period is spread over {@value #SHARDS} partition keys
 * (PERIOD#yyyy-MM#Snn) so writes never pile onto one hot partition; reads simply query every shard.
 */
@Component
class DynamoPlayAggregateSource implements PlayAggregateSource {

    static final int SHARDS = 16;

    private final DynamoDbClient dynamo;
    private final String table;

    DynamoPlayAggregateSource(DynamoDbClient dynamo, @Value("${royalty.dynamodb.table}") String table) {
        this.dynamo = dynamo;
        this.table = table;
    }

    @Override
    public List<PlayAggregate> aggregates(String period) {
        List<PlayAggregate> out = new ArrayList<>();
        forEachItem(period, "AGG#", item -> out.add(new PlayAggregate(
                item.get("isrc").s(), item.get("territory").s(), item.get("tier").s(),
                number(item, "streams"), number(item, "plays"))));
        return out;
    }

    @Override
    public PeriodTotals totals(String period) {
        long[] sums = new long[2];
        forEachItem(period, "TOTAL", item -> {
            sums[0] += number(item, "events");
            sums[1] += number(item, "plays");
        });
        return new PeriodTotals(sums[0], sums[1]);
    }

    private void forEachItem(String period, String skPrefix, Consumer<Map<String, AttributeValue>> consumer) {
        for (int shard = 0; shard < SHARDS; shard++) {
            QueryRequest request = QueryRequest.builder()
                    .tableName(table)
                    .keyConditionExpression("pk = :pk AND begins_with(sk, :prefix)")
                    .expressionAttributeValues(Map.of(
                            ":pk", AttributeValue.fromS("PERIOD#%s#S%02d".formatted(period, shard)),
                            ":prefix", AttributeValue.fromS(skPrefix)))
                    .build();
            dynamo.queryPaginator(request).items().forEach(consumer);
        }
    }

    private static long number(Map<String, AttributeValue> item, String attr) {
        AttributeValue v = item.get(attr);
        return v == null ? 0 : Long.parseLong(v.n());
    }
}

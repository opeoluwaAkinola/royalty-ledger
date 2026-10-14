package com.royaltyledger.royalty.plays;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

@Configuration
class DynamoConfig {

    /** In AWS the default credential chain and region apply; locally we point at DynamoDB Local. */
    @Bean(destroyMethod = "close")
    DynamoDbClient dynamoDbClient(@Value("${royalty.dynamodb.endpoint:}") String endpoint,
                                  @Value("${royalty.dynamodb.region:us-west-2}") String region) {
        var builder = DynamoDbClient.builder().region(Region.of(region));
        if (StringUtils.hasText(endpoint)) {
            builder.endpointOverride(URI.create(endpoint))
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("local", "local")));
        }
        return builder.build();
    }
}

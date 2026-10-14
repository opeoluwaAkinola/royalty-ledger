package com.royaltyledger.royalty.plays;

import java.util.List;

public interface PlayAggregateSource {
    List<PlayAggregate> aggregates(String period);

    PeriodTotals totals(String period);
}

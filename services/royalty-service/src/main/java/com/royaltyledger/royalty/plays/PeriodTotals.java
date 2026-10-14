package com.royaltyledger.royalty.plays;

/** Independent running totals the aggregator keeps alongside the aggregates, used for reconciliation. */
public record PeriodTotals(long events, long plays) {
    public static final PeriodTotals EMPTY = new PeriodTotals(0, 0);
}

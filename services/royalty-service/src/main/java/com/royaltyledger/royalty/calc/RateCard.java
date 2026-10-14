package com.royaltyledger.royalty.calc;

import java.util.Map;

/** Per-play rates in micro-dollars keyed by "tier|territory", with "tier|*" as the fallback. */
public record RateCard(Map<String, Long> microsPerPlay) {

    public long rateFor(String tier, String territory) {
        Long rate = microsPerPlay.get(tier + "|" + territory);
        if (rate == null) rate = microsPerPlay.get(tier + "|*");
        if (rate == null) throw new IllegalStateException("No rate for tier " + tier);
        return rate;
    }
}

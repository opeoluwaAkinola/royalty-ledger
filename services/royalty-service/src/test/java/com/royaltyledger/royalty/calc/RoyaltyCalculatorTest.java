package com.royaltyledger.royalty.calc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.royaltyledger.royalty.plays.PlayAggregate;
import java.util.*;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

class RoyaltyCalculatorTest {

    static final RateCard RATES = new RateCard(Map.of(
            "premium|US", 4500L, "ad_supported|US", 1200L, "premium|*", 2500L, "ad_supported|*", 700L));

    static final Map<String, List<Split>> SPLITS = Map.of(
            "USRL12600001", List.of(new Split(1, 5000), new Split(2, 3500), new Split(3, 1500)),
            "USRL12600002", List.of(new Split(1, 5000), new Split(4, 5000)));

    @Test
    void paysEachHolderTheirShare() {
        // 1,000 premium US plays x $0.0045 = $4.50
        var r = RoyaltyCalculator.calculate(List.of(new PlayAggregate("USRL12600001", "US", "premium", 1100, 1000)), SPLITS, RATES);

        assertThat(r.grossMicros()).isEqualTo(4_500_000);
        assertThat(cents(r)).containsExactlyInAnyOrderEntriesOf(Map.of(1L, 225L, 2L, 158L, 3L, 67L));
        assertThat(r.allocatedCents()).isEqualTo(450);
    }

    @Test
    void usesTheFallbackRateForUnlistedTerritories() {
        var r = RoyaltyCalculator.calculate(List.of(new PlayAggregate("USRL12600002", "NG", "ad_supported", 10, 10)), SPLITS, RATES);
        assertThat(r.grossMicros()).isEqualTo(7_000);
    }

    @Test
    void holdsPlaysWithoutRightsDataInSuspense() {
        var r = RoyaltyCalculator.calculate(List.of(
                new PlayAggregate("USRL12600001", "US", "premium", 100, 100),
                new PlayAggregate("ZZXXX9900001", "US", "premium", 40, 40)), SPLITS, RATES);

        assertThat(r.totalPlays()).isEqualTo(140);
        assertThat(r.matchedPlays()).isEqualTo(100);
        assertThat(r.unmatchedPlays()).isEqualTo(40);
        assertThat(r.unmatchedMicros()).isEqualTo(180_000);
        assertThat(r.grossMicros()).isEqualTo(450_000);
    }

    @Test
    void largestRemainderNeverLosesOrInventsACent() {
        // 1 play at $0.0045 split 50/35/15 = 0.225c, 0.1575c, 0.0675c: total rounds down to 0 cents.
        var tiny = RoyaltyCalculator.calculate(List.of(new PlayAggregate("USRL12600001", "US", "premium", 1, 1)), SPLITS, RATES);
        assertThat(tiny.allocatedCents()).isZero();
        assertThat(tiny.residualNanos()).isEqualTo(45_000_000);

        // 3 plays = 1.35c -> exactly 1 cent allocated, to the holder with the biggest fraction.
        var small = RoyaltyCalculator.calculate(List.of(new PlayAggregate("USRL12600001", "US", "premium", 3, 3)), SPLITS, RATES);
        assertThat(small.allocatedCents()).isEqualTo(1);
        assertThat(cents(small)).containsEntry(1L, 1L);
    }

    @RepeatedTest(200)
    void invariantsHoldForRandomCatalogs() {
        var rnd = new Random();
        Map<String, List<Split>> splits = new HashMap<>();
        List<PlayAggregate> aggs = new ArrayList<>();
        for (int t = 0; t < 1 + rnd.nextInt(30); t++) {
            String isrc = "USRL1260%04d".formatted(t);
            splits.put(isrc, randomSplits(rnd));
            for (String territory : List.of("US", "GB", "BR")) {
                long plays = rnd.nextInt(5) == 0 ? 0 : rnd.nextInt(1_000_000);
                aggs.add(new PlayAggregate(isrc, territory, rnd.nextBoolean() ? "premium" : "ad_supported", plays, plays));
            }
        }
        var r = RoyaltyCalculator.calculate(aggs, splits, RATES);

        long grossNanos = r.grossMicros() * 10_000;
        assertThat(r.allocatedCents()).isEqualTo(grossNanos / RoyaltyCalculator.NANOS_PER_CENT);
        assertThat(r.residualNanos()).isBetween(0L, RoyaltyCalculator.NANOS_PER_CENT - 1);
        for (var st : r.statements()) {
            long exactNanos = st.lines().stream().mapToLong(RoyaltyCalculator.Line::nanos).sum();
            long diff = st.totalCents() * RoyaltyCalculator.NANOS_PER_CENT - exactNanos;
            assertThat(Math.abs(diff)).as("holder %d within a cent", st.holderId()).isLessThan(RoyaltyCalculator.NANOS_PER_CENT);
        }
    }

    @Test
    void refusesSplitsThatDoNotTotalOneHundredPercent() {
        var broken = Map.of("USRL12600001", List.of(new Split(1, 5000), new Split(2, 4000)));
        assertThatThrownBy(() -> RoyaltyCalculator.calculate(List.of(), broken, RATES))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("9000 bps");
    }

    private static List<Split> randomSplits(Random rnd) {
        int holders = 1 + rnd.nextInt(4);
        List<Split> out = new ArrayList<>();
        int remaining = 10_000;
        for (int h = 1; h < holders; h++) {
            int share = 1 + rnd.nextInt(remaining - (holders - h));
            out.add(new Split(h, share));
            remaining -= share;
        }
        out.add(new Split(holders, remaining));
        return out;
    }

    private static Map<Long, Long> cents(RoyaltyCalculator.Result r) {
        Map<Long, Long> m = new HashMap<>();
        r.statements().forEach(s -> m.put(s.holderId(), s.totalCents()));
        return m;
    }
}

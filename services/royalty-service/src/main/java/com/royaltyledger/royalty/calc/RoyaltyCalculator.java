package com.royaltyledger.royalty.calc;

import com.royaltyledger.royalty.plays.PlayAggregate;
import java.math.BigDecimal;
import java.util.*;

/**
 * Turns play counts into payouts. Pure and deterministic: same inputs, same cents.
 *
 * <p>Money is tracked in exact integer units throughout. One line's value is
 * {@code plays x rateMicros x shareBps}, in units of 10^-10 dollars ("nanos"), so nothing is
 * rounded until the very end. Cents are then allocated with the largest-remainder method, which
 * guarantees:
 * <ul>
 *   <li>the statements add up to exactly {@code floor(gross)} in cents, so no cent is invented or lost, and</li>
 *   <li>every holder is within one cent of their exact share.</li>
 * </ul>
 */
public final class RoyaltyCalculator {

    static final long NANOS_PER_CENT = 100_000_000L; // 1 cent = 10^4 micros = 10^8 nanos

    private RoyaltyCalculator() {}

    public record Line(String isrc, String territory, String tier, long plays, long rateMicros, int shareBps, long nanos) {
        public BigDecimal amountMicros() {
            return BigDecimal.valueOf(nanos, 4);
        }
    }

    public record HolderStatement(long holderId, long plays, long totalCents, List<Line> lines) {}

    public record Result(long totalPlays, long matchedPlays, long grossMicros, long allocatedCents, long residualNanos,
                         long unmatchedPlays, long unmatchedMicros, List<HolderStatement> statements) {}

    public static Result calculate(List<PlayAggregate> aggregates, Map<String, List<Split>> splitsByIsrc, RateCard rates) {
        validateSplits(splitsByIsrc);
        long totalPlays = 0, matchedPlays = 0, grossMicros = 0, unmatchedPlays = 0, unmatchedMicros = 0;
        Map<Long, List<Line>> linesByHolder = new TreeMap<>();

        for (PlayAggregate a : aggregates) {
            if (a.plays() == 0) continue;
            long rate = rates.rateFor(a.tier(), a.territory());
            long micros = Math.multiplyExact(a.plays(), rate);
            totalPlays += a.plays();
            List<Split> splits = splitsByIsrc.get(a.isrc());
            if (splits == null) {
                unmatchedPlays += a.plays();
                unmatchedMicros = Math.addExact(unmatchedMicros, micros);
                continue;
            }
            matchedPlays += a.plays();
            grossMicros = Math.addExact(grossMicros, micros);
            for (Split s : splits) {
                linesByHolder.computeIfAbsent(s.holderId(), k -> new ArrayList<>()).add(new Line(
                        a.isrc(), a.territory(), a.tier(), a.plays(), rate, s.shareBps(), Math.multiplyExact(micros, (long) s.shareBps())));
            }
        }

        // Largest remainder: floor every holder, then hand the leftover cents to the biggest fractions.
        long grossNanos = Math.multiplyExact(grossMicros, 10_000L);
        long targetCents = grossNanos / NANOS_PER_CENT;
        record Share(long holderId, long nanos, long floorCents, long remainder) {}
        List<Share> shares = new ArrayList<>();
        long floorSum = 0;
        for (var e : linesByHolder.entrySet()) {
            long nanos = e.getValue().stream().mapToLong(Line::nanos).reduce(0, Math::addExact);
            shares.add(new Share(e.getKey(), nanos, nanos / NANOS_PER_CENT, nanos % NANOS_PER_CENT));
            floorSum += nanos / NANOS_PER_CENT;
        }
        long leftover = targetCents - floorSum;
        Set<Long> bumped = new HashSet<>();
        shares.stream()
                .sorted(Comparator.comparingLong(Share::remainder).reversed().thenComparingLong(Share::holderId))
                .limit(leftover)
                .forEach(s -> bumped.add(s.holderId()));

        List<HolderStatement> statements = new ArrayList<>();
        for (Share s : shares) {
            List<Line> lines = linesByHolder.get(s.holderId());
            lines.sort(Comparator.comparingLong(Line::nanos).reversed().thenComparing(Line::isrc));
            long plays = lines.stream().mapToLong(Line::plays).sum();
            statements.add(new HolderStatement(s.holderId(), plays, s.floorCents() + (bumped.contains(s.holderId()) ? 1 : 0), lines));
        }
        statements.sort(Comparator.comparingLong(HolderStatement::totalCents).reversed().thenComparingLong(HolderStatement::holderId));

        long allocated = statements.stream().mapToLong(HolderStatement::totalCents).sum();
        return new Result(totalPlays, matchedPlays, grossMicros, allocated, grossNanos - allocated * NANOS_PER_CENT,
                unmatchedPlays, unmatchedMicros, statements);
    }

    /** A track whose splits don't total 100% would silently over- or under-pay, so refuse to run. */
    static void validateSplits(Map<String, List<Split>> splitsByIsrc) {
        splitsByIsrc.forEach((isrc, splits) -> {
            int total = splits.stream().mapToInt(Split::shareBps).sum();
            if (total != 10_000) {
                throw new IllegalStateException("Splits for %s total %d bps, expected 10000".formatted(isrc, total));
            }
        });
    }
}

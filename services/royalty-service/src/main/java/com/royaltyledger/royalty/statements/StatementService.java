package com.royaltyledger.royalty.statements;

import com.royaltyledger.royalty.calc.RoyaltyCalculator;
import com.royaltyledger.royalty.catalog.CatalogRepository;
import com.royaltyledger.royalty.plays.PlayAggregate;
import com.royaltyledger.royalty.plays.PlayAggregateSource;
import com.royaltyledger.royalty.plays.PeriodTotals;
import java.util.*;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class StatementService {

    private static final Logger log = LoggerFactory.getLogger(StatementService.class);

    public record RunOutcome(StatementRepository.Run run, boolean created) {}

    public enum Status { MATCH, LATE_PLAYS, PIPELINE_DRIFT, NOT_RUN }

    public record Reconciliation(String period, Status status, long eventsAccepted, long playsInTotals,
                                 long playsInAggregates, Long playsInStatement, List<String> findings) {}

    public record TerritoryRow(String territory, long plays, long estimatedMicros) {}

    public record TrackRow(String isrc, String title, String artistName, long plays, long estimatedMicros) {}

    public record Summary(String period, long streams, long plays, long estimatedMicros, Map<String, Long> playsByTier,
                          List<TerritoryRow> territories, List<TrackRow> topTracks, long unmatchedPlays) {}

    private final PlayAggregateSource plays;
    private final CatalogRepository catalog;
    private final StatementRepository statements;
    private final TransactionTemplate tx;

    public StatementService(PlayAggregateSource plays, CatalogRepository catalog, StatementRepository statements, TransactionTemplate tx) {
        this.plays = plays;
        this.catalog = catalog;
        this.statements = statements;
        this.tx = tx;
    }

    /**
     * Idempotent: the first call for a period computes and stores the run; later calls return the
     * stored run untouched. The unique constraint on period settles concurrent first calls.
     */
    public RunOutcome run(String period) {
        Periods.require(period);
        Optional<StatementRepository.Run> existing = statements.run(period);
        if (existing.isPresent()) return new RunOutcome(existing.get(), false);

        var result = RoyaltyCalculator.calculate(plays.aggregates(period), catalog.splitsByIsrc(), catalog.rateCard());
        try {
            tx.executeWithoutResult(status -> statements.insert(period, result));
        } catch (DuplicateKeyException race) {
            return new RunOutcome(statements.run(period).orElseThrow(), false);
        }
        log.info("statement run {}: {} plays, {} statements, {} cents allocated, {} unmatched plays",
                period, result.totalPlays(), result.statements().size(), result.allocatedCents(), result.unmatchedPlays());
        return new RunOutcome(statements.run(period).orElseThrow(), true);
    }

    /**
     * Three independent counts must agree: the aggregator's sharded running totals, the sum of the
     * aggregate rows, and what the statement run paid out on.
     */
    public Reconciliation reconcile(String period) {
        Periods.require(period);
        PeriodTotals totals = plays.totals(period);
        long aggregated = plays.aggregates(period).stream().mapToLong(PlayAggregate::plays).sum();
        Optional<StatementRepository.Run> run = statements.run(period);
        List<String> findings = new ArrayList<>();

        Status status;
        if (totals.plays() != aggregated) {
            status = Status.PIPELINE_DRIFT;
            findings.add("Running totals (%d plays) disagree with aggregate rows (%d plays). Investigate the aggregator.".formatted(totals.plays(), aggregated));
        } else if (run.isEmpty()) {
            status = Status.NOT_RUN;
            findings.add("No statement run yet for " + period + ".");
        } else if (run.get().totalPlays() != aggregated) {
            status = Status.LATE_PLAYS;
            findings.add("%d plays arrived after the statement run. Carry them into the next period's adjustments."
                    .formatted(aggregated - run.get().totalPlays()));
        } else {
            status = Status.MATCH;
            findings.add("Every accepted play is accounted for in the statement run.");
        }
        run.filter(r -> r.unmatchedPlays() > 0).ifPresent(r ->
                findings.add("%d plays had no rights data and are held in suspense.".formatted(r.unmatchedPlays())));
        return new Reconciliation(period, status, totals.events(), totals.plays(), aggregated,
                run.map(StatementRepository.Run::totalPlays).orElse(null), findings);
    }

    /** Live view straight from the pipeline, available before any statement run. */
    public Summary summary(String period) {
        Periods.require(period);
        var aggregates = plays.aggregates(period);
        var rates = catalog.rateCard();
        var tracks = catalog.tracksByIsrc();

        Map<String, long[]> byTerritory = new TreeMap<>();
        Map<String, long[]> byTrack = new HashMap<>();
        Map<String, Long> byTier = new TreeMap<>();
        long streams = 0, total = 0, micros = 0, unmatched = 0;
        for (var a : aggregates) {
            long m = a.plays() * rates.rateFor(a.tier(), a.territory());
            streams += a.streams();
            total += a.plays();
            micros += m;
            byTier.merge(a.tier(), a.plays(), Long::sum);
            accumulate(byTerritory, a.territory(), a.plays(), m);
            accumulate(byTrack, a.isrc(), a.plays(), m);
            if (!tracks.containsKey(a.isrc())) unmatched += a.plays();
        }
        var territories = byTerritory.entrySet().stream()
                .map(e -> new TerritoryRow(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .sorted(Comparator.comparingLong(TerritoryRow::plays).reversed()).toList();
        var top = byTrack.entrySet().stream()
                .map(e -> {
                    var t = tracks.get(e.getKey());
                    return new TrackRow(e.getKey(), t == null ? null : t.title(), t == null ? null : t.artistName(), e.getValue()[0], e.getValue()[1]);
                })
                .sorted(Comparator.comparingLong(TrackRow::plays).reversed().thenComparing(TrackRow::isrc))
                .limit(10).collect(Collectors.toList());
        return new Summary(period, streams, total, micros, byTier, territories, top, unmatched);
    }

    private static void accumulate(Map<String, long[]> map, String key, long plays, long micros) {
        long[] v = map.computeIfAbsent(key, k -> new long[2]);
        v[0] += plays;
        v[1] += micros;
    }

    public StatementRepository.StatementSummary statement(long id) {
        return statements.statement(id).orElseThrow(() -> new NotFoundException("Statement " + id + " not found"));
    }
}

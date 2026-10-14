package com.royaltyledger.royalty.statements;

import com.royaltyledger.royalty.calc.RoyaltyCalculator;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class StatementRepository {

    public record Run(long id, String period, long totalPlays, long matchedPlays, long grossMicros, long allocatedCents,
                      long residualNanos, long unmatchedPlays, long unmatchedMicros, int statementCount, java.time.LocalDateTime createdAt) {}

    public record StatementSummary(long id, String period, long holderId, String holderName, String holderType,
                                   long plays, long totalCents) {}

    public record LineView(String isrc, String title, String territory, String tier, long plays, long rateMicros,
                           int shareBps, java.math.BigDecimal amountMicros) {}

    private static final String RUN_SELECT = """
            SELECT r.id, r.period, r.total_plays, r.matched_plays, r.gross_micros, r.allocated_cents, r.residual_nanos,
                   r.unmatched_plays, r.unmatched_micros, (SELECT COUNT(*) FROM statement s WHERE s.run_id = r.id) AS statement_count,
                   r.created_at
            FROM statement_run r""";

    private static final String STATEMENT_SELECT = """
            SELECT s.id, r.period, s.holder_id, h.name AS holder_name, h.type AS holder_type, s.plays, s.total_cents
            FROM statement s JOIN statement_run r ON r.id = s.run_id JOIN rights_holder h ON h.id = s.holder_id""";

    private final JdbcClient jdbc;
    private final JdbcTemplate template;

    public StatementRepository(JdbcClient jdbc, JdbcTemplate template) {
        this.jdbc = jdbc;
        this.template = template;
    }

    public Optional<Run> run(String period) {
        return jdbc.sql(RUN_SELECT + " WHERE r.period = ?").param(period).query(Run.class).optional();
    }

    public List<Run> runs() {
        return jdbc.sql(RUN_SELECT + " ORDER BY r.period DESC").query(Run.class).list();
    }

    /** Persists a whole run. Called inside one transaction, so a run is either fully written or not at all. */
    public long insert(String period, RoyaltyCalculator.Result result) {
        var keys = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO statement_run (period, total_plays, matched_plays, gross_micros, allocated_cents, residual_nanos,
                                           unmatched_plays, unmatched_micros, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                .params(period, result.totalPlays(), result.matchedPlays(), result.grossMicros(), result.allocatedCents(),
                        result.residualNanos(), result.unmatchedPlays(), result.unmatchedMicros(), Timestamp.from(Instant.now()))
                .update(keys, "id");
        long runId = keys.getKey().longValue();

        for (var st : result.statements()) {
            var stKeys = new GeneratedKeyHolder();
            jdbc.sql("INSERT INTO statement (run_id, holder_id, plays, total_cents) VALUES (?, ?, ?, ?)")
                    .params(runId, st.holderId(), st.plays(), st.totalCents())
                    .update(stKeys, "id");
            long statementId = stKeys.getKey().longValue();
            template.batchUpdate("""
                    INSERT INTO statement_line (statement_id, isrc, territory, tier, plays, rate_micros, share_bps, amount_micros)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", st.lines(), 500, (ps, l) -> {
                ps.setLong(1, statementId);
                ps.setString(2, l.isrc());
                ps.setString(3, l.territory());
                ps.setString(4, l.tier());
                ps.setLong(5, l.plays());
                ps.setLong(6, l.rateMicros());
                ps.setInt(7, l.shareBps());
                ps.setBigDecimal(8, l.amountMicros());
            });
        }
        return runId;
    }

    public long countStatements(String period) {
        return jdbc.sql("SELECT COUNT(*) FROM statement s JOIN statement_run r ON r.id = s.run_id WHERE r.period = ?")
                .param(period).query(Long.class).single();
    }

    public List<StatementSummary> statements(String period, int limit, int offset) {
        return jdbc.sql(STATEMENT_SELECT + " WHERE r.period = ? ORDER BY s.total_cents DESC, s.holder_id LIMIT ? OFFSET ?")
                .params(period, limit, offset).query(StatementSummary.class).list();
    }

    public List<StatementSummary> statementsForHolder(long holderId) {
        return jdbc.sql(STATEMENT_SELECT + " WHERE s.holder_id = ? ORDER BY r.period DESC").param(holderId).query(StatementSummary.class).list();
    }

    public Optional<StatementSummary> statement(long id) {
        return jdbc.sql(STATEMENT_SELECT + " WHERE s.id = ?").param(id).query(StatementSummary.class).optional();
    }

    public long countLines(long statementId) {
        return jdbc.sql("SELECT COUNT(*) FROM statement_line WHERE statement_id = ?").param(statementId).query(Long.class).single();
    }

    public List<LineView> lines(long statementId, int limit, int offset) {
        return jdbc.sql("""
                SELECT l.isrc, t.title, l.territory, l.tier, l.plays, l.rate_micros, l.share_bps, l.amount_micros
                FROM statement_line l LEFT JOIN track t ON t.isrc = l.isrc
                WHERE l.statement_id = ?
                ORDER BY l.amount_micros DESC, l.isrc, l.territory, l.tier
                LIMIT ? OFFSET ?""")
                .params(statementId, limit, offset).query(LineView.class).list();
    }
}

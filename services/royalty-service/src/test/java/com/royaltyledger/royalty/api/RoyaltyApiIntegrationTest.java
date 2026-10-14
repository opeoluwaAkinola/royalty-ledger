package com.royaltyledger.royalty.api;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.royaltyledger.royalty.plays.PeriodTotals;
import com.royaltyledger.royalty.plays.PlayAggregate;
import com.royaltyledger.royalty.plays.PlayAggregateSource;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Real Flyway schema and seed catalog on H2; the DynamoDB side is replaced by an in-memory source. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RoyaltyApiIntegrationTest {

    static class FakeSource implements PlayAggregateSource {
        final List<PlayAggregate> aggregates = new ArrayList<>();
        PeriodTotals totals = PeriodTotals.EMPTY;

        @Override
        public List<PlayAggregate> aggregates(String period) {
            return period.equals("2026-09") ? aggregates : List.of();
        }

        @Override
        public PeriodTotals totals(String period) {
            return period.equals("2026-09") ? totals : PeriodTotals.EMPTY;
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        FakeSource fakeSource() {
            return new FakeSource();
        }
    }

    @Autowired MockMvc mvc;
    @Autowired FakeSource source;
    @Autowired JdbcClient jdbc;

    @BeforeEach
    void reset() {
        jdbc.sql("DELETE FROM statement_run").update();
        source.aggregates.clear();
        source.aggregates.addAll(List.of(
                new PlayAggregate("USRL12600002", "US", "premium", 1_200, 1_000),   // $4.50
                new PlayAggregate("USRL12600002", "GB", "ad_supported", 600, 500),  // $0.50
                new PlayAggregate("USRL12600001", "BR", "premium", 100, 100),       // featured-artist track
                new PlayAggregate("ZZXXX2600099", "US", "premium", 50, 50)));       // not in catalog
        source.totals = new PeriodTotals(1_950, 1_650);
    }

    @Test
    void servesTheSeedCatalog() throws Exception {
        mvc.perform(get("/api/tracks")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(40)));
        mvc.perform(get("/api/rights-holders")).andExpect(jsonPath("$", hasSize(14)));
    }

    @Test
    void statementRunIsIdempotent() throws Exception {
        String body = "{\"period\":\"2026-09\"}";
        mvc.perform(post("/api/statement-runs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/statement-runs/2026-09"))
                .andExpect(jsonPath("$.totalPlays").value(1_650))
                .andExpect(jsonPath("$.unmatchedPlays").value(50))
                .andExpect(jsonPath("$.grossMicros").value(5_160_000))
                .andExpect(jsonPath("$.allocatedCents").value(516));

        mvc.perform(post("/api/statement-runs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allocatedCents").value(516));

        mvc.perform(get("/api/statement-runs")).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void statementsArePagedAndSumToTheRunTotal() throws Exception {
        mvc.perform(post("/api/statement-runs").contentType(MediaType.APPLICATION_JSON).content("{\"period\":\"2026-09\"}"));
        mvc.perform(get("/api/statement-runs/2026-09/statements").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.total").value(greaterThan(2)))
                .andExpect(jsonPath("$.items[0].totalCents").value(greaterThanOrEqualTo(0)));

        long sum = jdbc.sql("SELECT SUM(total_cents) FROM statement").query(Long.class).single();
        org.assertj.core.api.Assertions.assertThat(sum).isEqualTo(516);
    }

    @Test
    void statementLinesExplainEveryCent() throws Exception {
        mvc.perform(post("/api/statement-runs").contentType(MediaType.APPLICATION_JSON).content("{\"period\":\"2026-09\"}"));
        long labelStatement = jdbc.sql("SELECT s.id FROM statement s JOIN rights_holder h ON h.id = s.holder_id WHERE h.type = 'LABEL' ORDER BY s.total_cents DESC LIMIT 1")
                .query(Long.class).single();
        mvc.perform(get("/api/statements/{id}/lines", labelStatement))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].shareBps").value(5000))
                .andExpect(jsonPath("$.items[0].title").isNotEmpty());
    }

    @Test
    void reconciliationTracksTheRunLifecycle() throws Exception {
        mvc.perform(get("/api/periods/2026-09/reconciliation")).andExpect(jsonPath("$.status").value("NOT_RUN"));

        mvc.perform(post("/api/statement-runs").contentType(MediaType.APPLICATION_JSON).content("{\"period\":\"2026-09\"}"));
        mvc.perform(get("/api/periods/2026-09/reconciliation"))
                .andExpect(jsonPath("$.status").value("MATCH"))
                .andExpect(jsonPath("$.findings[1]", containsString("suspense")));

        source.aggregates.add(new PlayAggregate("USRL12600003", "US", "premium", 10, 10));
        source.totals = new PeriodTotals(1_960, 1_660);
        mvc.perform(get("/api/periods/2026-09/reconciliation"))
                .andExpect(jsonPath("$.status").value("LATE_PLAYS"))
                .andExpect(jsonPath("$.findings[0]", startsWith("10 plays arrived after")));

        source.totals = new PeriodTotals(1_960, 1_700);
        mvc.perform(get("/api/periods/2026-09/reconciliation")).andExpect(jsonPath("$.status").value("PIPELINE_DRIFT"));
    }

    @Test
    void liveSummaryNamesTracksAndFlagsUnmatchedPlays() throws Exception {
        mvc.perform(get("/api/periods/2026-09/summary"))
                .andExpect(jsonPath("$.plays").value(1_650))
                .andExpect(jsonPath("$.streams").value(1_950))
                .andExpect(jsonPath("$.unmatchedPlays").value(50))
                .andExpect(jsonPath("$.territories[0].territory").value("US"))
                .andExpect(jsonPath("$.topTracks[0].isrc").value("USRL12600002"))
                .andExpect(jsonPath("$.topTracks[0].title").isNotEmpty());
    }

    @Test
    void validatesInput() throws Exception {
        mvc.perform(post("/api/statement-runs").contentType(MediaType.APPLICATION_JSON).content("{\"period\":\"2026-13\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        mvc.perform(get("/api/statement-runs/2026-01")).andExpect(status().isNotFound());
        mvc.perform(get("/api/statement-runs/2026-09/statements").param("size", "1000")).andExpect(status().isBadRequest());
    }
}

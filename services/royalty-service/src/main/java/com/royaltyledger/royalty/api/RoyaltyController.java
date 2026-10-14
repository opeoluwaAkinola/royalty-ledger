package com.royaltyledger.royalty.api;

import com.royaltyledger.royalty.catalog.CatalogRepository;
import com.royaltyledger.royalty.statements.NotFoundException;
import com.royaltyledger.royalty.statements.Periods;
import com.royaltyledger.royalty.statements.StatementRepository;
import com.royaltyledger.royalty.statements.StatementService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Validated
public class RoyaltyController {

    public record RunRequest(@NotBlank String period) {}

    public record Page<T>(List<T> items, long total, int page, int size) {}

    private final StatementService service;
    private final StatementRepository statements;
    private final CatalogRepository catalog;

    public RoyaltyController(StatementService service, StatementRepository statements, CatalogRepository catalog) {
        this.service = service;
        this.statements = statements;
        this.catalog = catalog;
    }

    @GetMapping("/tracks")
    public List<CatalogRepository.Track> tracks() {
        return catalog.tracks();
    }

    @GetMapping("/rights-holders")
    public List<CatalogRepository.RightsHolder> holders() {
        return catalog.holders();
    }

    @GetMapping("/rights-holders/{id}/statements")
    public List<StatementRepository.StatementSummary> holderStatements(@PathVariable long id) {
        catalog.holder(id).orElseThrow(() -> new NotFoundException("Rights holder " + id + " not found"));
        return statements.statementsForHolder(id);
    }

    @GetMapping("/periods/{period}/summary")
    public StatementService.Summary summary(@PathVariable String period) {
        return service.summary(period);
    }

    @GetMapping("/periods/{period}/reconciliation")
    public StatementService.Reconciliation reconciliation(@PathVariable String period) {
        return service.reconcile(period);
    }

    @GetMapping("/statement-runs")
    public List<StatementRepository.Run> runs() {
        return statements.runs();
    }

    /** 201 the first time a period is run, 200 with the same run on every retry. */
    @PostMapping("/statement-runs")
    public ResponseEntity<StatementRepository.Run> createRun(@Valid @RequestBody RunRequest req) {
        var outcome = service.run(req.period());
        return outcome.created()
                ? ResponseEntity.created(URI.create("/api/statement-runs/" + req.period())).body(outcome.run())
                : ResponseEntity.ok(outcome.run());
    }

    @GetMapping("/statement-runs/{period}")
    public StatementRepository.Run run(@PathVariable String period) {
        return statements.run(Periods.require(period)).orElseThrow(() -> new NotFoundException("No statement run for " + period));
    }

    @GetMapping("/statement-runs/{period}/statements")
    public Page<StatementRepository.StatementSummary> runStatements(@PathVariable String period,
                                                                    @RequestParam(defaultValue = "0") @Min(0) int page,
                                                                    @RequestParam(defaultValue = "25") @Min(1) @Max(100) int size) {
        run(period);
        return new Page<>(statements.statements(period, size, page * size), statements.countStatements(period), page, size);
    }

    @GetMapping("/statements/{id}")
    public StatementRepository.StatementSummary statement(@PathVariable long id) {
        return service.statement(id);
    }

    @GetMapping("/statements/{id}/lines")
    public Page<StatementRepository.LineView> lines(@PathVariable long id,
                                                   @RequestParam(defaultValue = "0") @Min(0) int page,
                                                   @RequestParam(defaultValue = "50") @Min(1) @Max(500) int size) {
        service.statement(id);
        return new Page<>(statements.lines(id, size, page * size), statements.countLines(id), page, size);
    }
}

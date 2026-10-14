#!/usr/bin/env bash
# End-to-end proof against a running stack (docker compose up):
#   simulator -> ingest -> SQS -> aggregator -> DynamoDB -> royalty-service -> PostgreSQL
# Sends events with deliberate duplicate retries, waits for the queue to drain, runs statements,
# and asserts that every unique event was counted exactly once and the run reconciles.
set -euo pipefail
cd "$(dirname "$0")/.."

API="${API_URL:-http://localhost:8085}"
EVENTS="${EVENTS:-20000}"
PERIOD="$(date -u +%Y-%m)"

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

for _ in $(seq 1 60); do curl -fsS "$API/actuator/health/readiness" >/dev/null 2>&1 && break; sleep 2; done
BEFORE=$(curl -fsS "$API/api/periods/$PERIOD/reconciliation" | json 'd["eventsAccepted"]')

echo "Sending $EVENTS unique events (plus ~5% duplicate retries)..."
SIM=$(node tools/simulator/src/simulate.js --events "$EVENTS" --rate 4000 --duplicates 0.05 --ingest "${INGEST_URL:-http://localhost:8090}" --catalog "$API")
echo "$SIM"
DUPES=$(echo "$SIM" | json 'd["duplicateEventsSent"]')
EXPECTED=$((BEFORE + EVENTS))

echo "Waiting for the aggregator to drain..."
for _ in $(seq 1 120); do
  ACCEPTED=$(curl -fsS "$API/api/periods/$PERIOD/reconciliation" | json 'd["eventsAccepted"]')
  [ "$ACCEPTED" -ge "$EXPECTED" ] && break
  sleep 2
done
sleep 3 # let any in-flight duplicates finish, so an over-count would show up

RECON=$(curl -fsS "$API/api/periods/$PERIOD/reconciliation")
ACCEPTED=$(echo "$RECON" | json 'd["eventsAccepted"]')
if [ "$ACCEPTED" -ne "$EXPECTED" ]; then
  echo "FAIL: expected exactly $EXPECTED events counted, got $ACCEPTED (sent $DUPES duplicates)"; exit 1
fi
echo "ok - exactly-once: $ACCEPTED events counted although $DUPES duplicate events were re-sent"

[ "$(echo "$RECON" | json 'd["playsInTotals"] == d["playsInAggregates"]')" = "True" ] || { echo "FAIL: totals and aggregates disagree"; exit 1; }
echo "ok - running totals agree with aggregate rows"

RUN=$(curl -fsS -XPOST "$API/api/statement-runs" -H 'content-type: application/json' -d "{\"period\":\"$PERIOD\"}")
echo "ok - statement run: $(echo "$RUN" | json 'str(d["statementCount"]) + " statements, " + str(d["allocatedCents"]) + " cents allocated"')"

STATUS=$(curl -fsS "$API/api/periods/$PERIOD/reconciliation" | json 'd["status"]')
# A pre-existing run for this period (from an earlier e2e run) legitimately reports LATE_PLAYS.
case "$STATUS" in MATCH|LATE_PLAYS) echo "ok - reconciliation: $STATUS" ;; *) echo "FAIL: reconciliation $STATUS"; exit 1 ;; esac

SUM=$(curl -fsS "$API/api/statement-runs/$PERIOD/statements?size=100" | json 'sum(s["totalCents"] for s in d["items"])')
ALLOC=$(curl -fsS "$API/api/statement-runs/$PERIOD" | json 'd["allocatedCents"]')
[ "$SUM" = "$ALLOC" ] || { echo "FAIL: statements sum to $SUM cents, run allocated $ALLOC"; exit 1; }
echo "ok - statements add up to the run total to the cent ($SUM cents)"
echo "All end-to-end checks passed."

# 3. Money in integers, allocated by largest remainder

**Status:** Accepted

## Context
Per-play rates are fractions of a cent ($0.0045). Rights holders get percentage splits of those fractions. Rounding each line to cents independently creates or destroys money: across thousands of lines, the statements no longer add up to what the platform owes.

## Decision
- Rates are stored as integer **micro-dollars**. Shares are integer **basis points**.
- One line's exact value is `plays x rate x bps`, an integer in units of 10^-10 dollars. Nothing is rounded until the end.
- Each holder's total is floored to cents. The leftover cents (always fewer than the number of holders) go to the holders with the largest fractional remainders, with ties broken by holder id so the result is deterministic.
- The sub-cent residual is stored on the run and carried forward rather than silently dropped.
- Tracks whose splits don't total exactly 10,000 bps stop the run instead of over- or under-paying.

## Consequences
- **Invariant:** statements always sum to exactly `floor(gross)` in cents, and every holder is within one cent of their exact share. A property test checks this on 200 random catalogs every build.
- Plays for ISRCs with no rights data are held in **suspense** (counted and valued, but not paid) instead of being dropped or paid to the wrong party.
- Statement runs are idempotent through a unique constraint on period. Re-running returns the original run, and plays that arrive later are reported by reconciliation as `LATE_PLAYS`.

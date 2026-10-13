# Marine Broker Performance: spec

**Request:** Broker performance page comparing claims, payment ratio and commission %.
**Audience:** Marine claims / distribution managers reviewing broker relationships.

## Assumptions
- Claims dated by Loss Date; page filter `Date[Year] <= 2026` (future loss dates excluded).
- Currency slicer single-select, default GBP; no FX.
- Claims = distinct claim numbers on Claim Vessels (report measure, responds to slicers).
- Payment ratio = model measure [Claim Payment Ratio (%)] (Paid ÷ Incurred); "Paid" = Total Paid (unconfirmed default).
- Commission % = Broker[Commission %], shown as a simple (unweighted) average over brokers with claims in view; for a single broker row it is that broker's rate.
- UNKNOWN broker excluded from broker counts and commission.
- No TopN filter (model blocks it): broker table sorted by claims, highest first.

## Data checks (GBP, loss years ≤ 2026)
- 1,620 claims across 779 brokers; incurred 44,463.9m, paid 10,008.5m; payment ratio 46.8%; avg commission 5.5%.
- By broker type: Coverholder 450 claims (46.4%), Wholesale 405 (47.7%), Retail 388 (47.0%), Reinsurance 377 (45.9%); commission 5.2–5.3% for all types.
- Payment ratio by loss year: ~47% 2020–2023, 32.5% 2024, 21.6% 2025, 77.7% 2026 (110 claims).
- Top broker by claims: Salazar LLC Brokers, 9 claims, 13.1% payment ratio, 9.4% commission.
- Delegated authority split (2 bars) dropped as too thin.

## Page: Broker performance
- Header + slicers: Currency (GBP), Loss year, Broker type.
- KPI card: brokers with claims, claims, incurred, paid, payment ratio, avg commission %.
- Line: payment ratio by loss year ("drops to 22% for 2025 losses").
- Bar: claims by broker type (highest first).
- Matrix: broker → claims, incurred (m), paid (m), payment ratio, commission %; sorted by claims.

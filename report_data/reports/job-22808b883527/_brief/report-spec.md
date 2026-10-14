# Marine Claims Overview — Report Spec

## Request
Claims overview showing incurred, paid and outstanding amounts, plus brokers with the most outstanding.

## Audience
Marine underwriting / claims management.

## Assumptions
1. "Outstanding" = Total Outstanding amount, not count of open claims.
2. "Paid" = Total Paid (not Total Paid to Date).
3. Currency defaults to GBP (slicer provided to change).
4. Loss years capped at ≤ 2026 via page filter; future-dated losses excluded.
5. Claims counted via DISTINCTCOUNT on Claim Vessels fact so counts respond to slicers.

## Data checks (GBP, loss years ≤ 2026)
- 1,620 claims; 386 open; payment ratio 46.8%
- Incurred £44.5bn, Paid £10.0bn, Outstanding £24.0bn
- H&M outstanding £7.9bn (largest product); Cargo War Risk £0.3bn (smallest)
- Top broker: Jensen, Craig and Connolly at £435m outstanding
- Paid drops near zero from 2024 onward (recent losses not yet settled)
- Trend covers 2020–2026 (2018–2019 have no GBP claims)

## Page 1: Claims overview
- **Title:** Hull & Machinery carries the largest share of outstanding claims
- **Slicers:** Currency (GBP default), Loss year, Product, Claim status
- **KPI card:** Claims, Open claims, Incurred, Paid, Outstanding, Payment ratio
- **Line chart:** Incurred, Paid, Outstanding by loss year
- **Bar chart:** Outstanding by product (highest first)
- **Matrix:** Brokers by outstanding — claims, incurred (m), outstanding (m), payment ratio

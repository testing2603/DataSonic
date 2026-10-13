# Marine Claims Overview: report spec

**Request:** Claims overview: incurred, paid and outstanding by loss year, and the brokers with the most outstanding.
**Audience:** Marine claims managers and underwriting leadership.

## Assumptions
- Currency defaults to GBP (single-select slicer); there is no FX, so other currencies are viewed one at a time.
- Paid = `[Total Paid]` (not Paid to Date); Outstanding = `[Total Outstanding]` (ontology defaults, unconfirmed).
- Loss year = `Date[Year]` via Loss Date; page filter Year <= 2026 drops 20 claims with 2027 loss dates.
- Claims are counted with report measures on the fact (distinct Claim Number) so slicers apply.
- Brokers are sorted by outstanding instead of a Top N filter, which the model blocks.

## Data checks (GBP, loss years <= 2026)
- 1,620 claims, 386 open; incurred £44.46bn, paid £10.01bn, outstanding £24.04bn; payment ratio 46.8%.
- Incurred by loss year (£bn): 2020 4.65, 2021 6.01, 2022 6.00, **2023 8.92 (peak)**, 2024 7.29, 2025 7.33, 2026 4.27.
- Paid falls from £1.95bn (2023) to £0.21bn (2024), £0.01bn (2025) and £0.01bn (2026).
- Top broker by outstanding: Jensen, Craig and Connolly Brokers, £435m (4 claims, 6.6% paid); then Daniels-Morgan £371m and Salazar LLC £365m.
- Note: incurred is larger than paid + outstanding in the source data (£44.5bn vs £34.0bn).

## Page 1: Claims overview
Title: "2023 losses carry the most incurred; paid is near zero for losses from 2024"
- Header slicers: Currency (single, GBP), Loss year, Product.
- KPI card: Claims, Open claims (exact), Incurred, Paid, Outstanding, Payment ratio.
- Line: Incurred, Paid and Outstanding by loss year (left, large).
- Matrix: Brokers by outstanding (highest first): Claims, Incurred (m), Outstanding (m), Payment ratio.

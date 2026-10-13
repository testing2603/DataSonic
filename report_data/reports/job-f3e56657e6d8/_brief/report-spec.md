# Marine Claims Overview: report spec

**Request:** Claims overview: incurred, paid and outstanding by loss year, and the brokers with the most outstanding.
**Audience:** Marine claims managers / leadership.

## Assumptions
- Currency defaults to GBP (single-select slicer); no FX, so other currencies are viewed one at a time.
- Paid = Total Paid (not Paid to Date); Outstanding = Total Outstanding (case reserve).
- Loss year = Date[Year] via Loss Date; page filter Year <= 2026 drops future-dated 2027 losses.
- "Brokers with the most outstanding" = all brokers sorted by outstanding descending (model blocks TopN by measure).
- Counts use report measures on Claim Vessels so they respond to the currency slicer.

## Data checks (GBP, loss years <= 2026)
- 1,620 claims, 386 open; incurred £44.46bn, paid £10.01bn, outstanding £24.04bn; payment ratio 46.8%.
- Incurred by year (£bn): 2020 4.65, 2021 6.01, 2022 6.00, 2023 8.92 (peak), 2024 7.29, 2025 7.33, 2026 4.27.
- Paid by year (£m): 2020 2,172 · 2021 2,772 · 2022 2,880 · 2023 1,946 · 2024 214 · 2025 10 · 2026 13.
- Top brokers by outstanding (£m): Jensen, Craig and Connolly 435; Daniels-Morgan 371; Salazar LLC 365; Clarke Inc 321; Phillips and Sons 287.
- Top broker holds ~1.8% of outstanding: exposure is spread across many brokers.

## Page 1: Claims overview
- Title: Payments have barely started on 2024+ losses, leaving £24.0bn outstanding
- Slicers: Currency (single, GBP), Loss year.
- KPI card: Claims, Open claims, Incurred, Paid, Outstanding, Payment ratio.
- Line: Incurred / Paid / Outstanding by loss year (2020–2026).
- Matrix: Brokers by outstanding (highest first): Claims, Incurred (m), Paid (m), Outstanding (m), Payment ratio.

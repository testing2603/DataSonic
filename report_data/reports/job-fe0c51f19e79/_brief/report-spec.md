# Marine Claims Overview — Report Spec

## Request
Claims overview: incurred, paid and outstanding by loss year, and the brokers with the most outstanding.

## Audience
Marine claims / underwriting team.

## Assumptions
- Currency defaults to GBP (single-select slicer); no FX conversion.
- "Outstanding" means Total Outstanding amount, not count of open claims.
- Loss years filtered to ≤ 2026 (claims with future loss dates excluded).
- Claims count uses DISTINCTCOUNT on Claim Vessels[Claim Number] (report measure, slicer-responsive).

## Data-check numbers (GBP, all loss years ≤ 2026)
- 5,456 claims; 1,345 open
- Incurred: £45.2bn | Paid: £10.0bn | Outstanding: £24.5bn
- Paid drops near zero from 2024 loss years onward
- Top broker: Jensen, Craig and Connolly — £435m outstanding (4 claims)

## Page: Claims overview
- **KPI strip** — Claims, Open claims, Incurred, Paid, Outstanding, Payment ratio
- **Line chart** — Incurred, Paid, Outstanding by loss year (2020–2026 trend)
- **Bar chart** — Outstanding by broker, ranked highest first
- **Matrix table** — Broker name, Claims, Incurred (m), Outstanding (m), Payment ratio
- **Slicers** — Currency (single, default GBP), Loss year

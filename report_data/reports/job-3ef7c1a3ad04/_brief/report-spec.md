# Marine Broker Performance: report spec

**Request:** Broker performance page comparing claims, payment ratio and commission %.
**Audience:** Marine claims / distribution managers reviewing broker relationships.

## Assumptions
- Claims are attributed to the broker on the claim (Claim Vessels → Broker) and dated by Loss Date; page filter Year <= 2026.
- Currency slicer is single-select and defaults to GBP (no FX).
- Commission % = Broker[Commission %] (TOBA rate, an unconfirmed term). On aggregate rows it is the simple average across brokers with claims, not a weighted average.
- Payment ratio = model measure Claim Payment Ratio (%) (paid ÷ incurred). It is never averaged.
- Paid = Total Paid (unconfirmed default).
- Tables can't use a TopN filter, so they are sorted by Incurred (m), highest first.

## Data checks (GBP, loss years <= 2026)
- 1,620 claims, 779 brokers with claims, incurred £44.46bn, paid £10.01bn, payment ratio 46.8%.
- By type: Coverholder 450 claims, Wholesale 405, Retail 388, Reinsurance 377.
- Payment ratio by type: Wholesale 47.7%, Retail 47.0%, Coverholder 46.4%, Reinsurance 45.9%.
- Avg commission by type: Coverholder 5.3%, Retail 5.4%, Wholesale 5.5%, Reinsurance 5.6%.
- Top broker by incurred: Daniels-Morgan £669.1m (4 claims, ratio 41.6%, commission 9.6%).
- Per broker: 3–9 claims each, with payment ratios from about 4% to 92%. The spread is at broker level, not broker type.

## Page: Broker performance
- Header with title and subtitle. Slicers: Currency (GBP), Loss year, Broker type.
- KPI card: Brokers with claims, Claims, Incurred, Paid, Payment ratio, Avg commission %.
- Column chart: Claims by broker type (highest first).
- Matrix: Broker types compared on claims, incurred (m), paid (m), payment ratio and commission %.
- Matrix: Brokers (name and type) by incurred (m), highest first, with claims, paid (m), payment ratio and commission %.

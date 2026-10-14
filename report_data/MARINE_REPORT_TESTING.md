# Marine LOB Report Agent — Testing Plan

Based on the actual `Marine_Gold_Model` semantic model, ontology, and agent architecture.
Prompts range from one-liner questions a non-technical user would ask to detailed
multi-page meeting-prep briefs.

---

## Modifications to the original plan

**Test 9 (Performance under data volume) — REMOVED.** The agent generates a PBIR definition file; it doesn't render the report. Power BI Desktop/Service handles rendering and aggregation. Performance is a Power BI concern, not an agent concern.

**Test 11 (Report modification after generation) — REMOVED.** Each generation creates a separate job folder (`report_data/reports/job-{id}/`). Reports are independent PBIP artifacts. No shared state to corrupt.

**Test 4 (Dynamic interactivity) — DOWNGRADED to a spot-check.** Cross-filtering is automatic if model relationships are correct. A quick smoke test after opening in Power BI is enough.

**Test 13 (Security / data scoping) — SIMPLIFIED.** The entire model IS Marine. LOB isolation is architectural (separate semantic models per LOB), not filter-based.

**Test 3 (Filter context) — MODIFIED.** Filters are expressed as DAX in the report plan. The real test is whether the agent writes correct CALCULATE filters.

**Added: Test 14 (Currency rule compliance).** Most likely source of wrong numbers — money measures return BLANK unless exactly one currency is in context.

**Added: Test 15 (Ontology "not_available" and "ask" terms).** Several terms are blocked or require clarification.

---

## Test 1 — Basic report generation accuracy

**What to verify:** Correct chart type, correct measures (not raw column SUMs), correct axis, numbers match a manual DAX query.

### Prompts

**1a. One-liner — claims by status** *(simplest possible)*
```
How many claims do we have, and what's their status?
```
*Expected:* Bar/column chart. Uses `[# Claims]` measure (not COUNTROWS). Groups by `Claim[Claim Status]` — OPEN, CLOSED, REOPENED, DENIED. Excludes UNKNOWN row.

**1b. One-liner — premium by broker**
```
Which brokers are bringing in the most premium?
```
*Expected:* Bar chart. Uses `[Total Premium]`, groups by `Broker[Broker Name]`. Agent MUST handle the currency rule — either split by currency or pick one and say so. Without a currency filter, `[Total Premium]` returns BLANK.

**1c. Natural question — claims trend**
```
Are claims going up or down year on year?
```
*Expected:* Line or bar trend. Uses claim count by `Date[Year]` via the Loss Date role (default for claims). Should NOT use Insurance Period Start.

**1d. Business question — product mix**
```
What's our book split by class of business?
```
*Expected:* "Class of business" → `Policy[Product]` (ontology synonym). Bar or pie chart using `[# Policies]`. Products: Hull & Machinery, P&I, Cargo, War Risk, etc.

**1e. Slightly specific — incurred by peril**
```
What are the biggest causes of loss by incurred amount, in GBP?
```
*Expected:* "Causes of loss" → `Claim[Cause of Loss]`. Uses `[Total Incurred]` with `Claim Vessels[Claim Currency] = "GBP"` filter. Sorted descending.

### Manual verification DAX
```dax
EVALUATE
SUMMARIZECOLUMNS(
    'Claim'[Claim Status],
    "Claims", [# Claims]
)
```

---

## Test 2 — Multi-chart prompt handling

**What to verify:** All requested visuals generated, data not mixed between charts, layout reasonable.

### Prompts

**2a. Simple bullet list** *(user who knows what they want but not Power BI)*
```
I need three things on one page:
- total number of claims as a big number
- a chart showing how much we've paid out per broker (GBP)
- a trend of how many claims we're getting each year
```
*Check:* Three visuals. KPI uses `[# Claims]`. Bar uses `[Total Paid]` with GBP filter + `Broker[Broker Name]`. Line uses claim count by `Date[Year]`.

**2b. Two-page natural language**
```
Can you build me a two-page report? First page should be all about claims —
how many, what status they're in, and what's causing the losses. Second page
should cover the policy book — what products we write and how it's split
across underwriting years.
```
*Check:* Two pages in PBIR. Page 1: Claim tables only. Page 2: Policy tables only. No cross-contamination.

**2c. Dashboard with KPIs + detail**
```
I want a quick snapshot at the top — count of claims, policies, brokers, and
vessels — and then a table underneath showing our top 10 brokers ranked by
how many policies they've placed.
```
*Check:* Four KPIs: `[# Claims]`, `[# Policies]`, `[# Brokers]`, `[# Vessels]`. Table with broker name + policy count.

**2d. Complex meeting-prep — broker & risk review** *(the kind of prompt from your example)*
```
Build a 2-page Power BI report for the Marine broker & risk review meeting.

Page 1 – Broker performance: compare brokers on number of claims, incurred,
OS reserve and payment ratio. Show whether broker type, commission % or
delegated authority makes a difference, and list the top brokers with their
FCA number and onboarding date. Let users filter by broker type and product.

Page 2 – Vessel risk & settlements: show claims and incurred by vessel type
and flag state, how many claims were reopened or had General Average declared,
settlements paid per quarter, and how long claims take to be notified.
Also include net claim cost by vessel type.
```
*Check (page 1):* Uses `[# Claims]`, `[Total Incurred]`, `[Total Outstanding]`, `[Claim Payment Ratio (%)]` grouped by `Broker[Broker Name]`. Breakdowns by `Broker[Broker Type]`, `Broker[Commission %]`, `Broker[Delegated Authority]`. Table with `Broker[FCA Registration Number]`, `Broker[Date of Onboarding]`. Slicers for broker type and product. Currency must be handled.
*Check (page 2):* Uses `Vessel[Vessel Type]`, `Policy[Flag State Country Code]`. `[# Claims (Reopened Claim)]`, `[# Claims (General Average Declared)]`. `[Total Settlements]` by quarter (via `Date[Quarter]`). `[Average Claim Reporting Lag (Days)]`.
*Trap:* "Net claim cost by vessel type" is blocked in the ontology (`KPI-NET-CLAIM-COST`). Agent should say it's not available and skip or offer an alternative — NOT silently invent numbers.

**2e. Complex — quarterly claims & underwriting review**
```
I'm preparing for a quarterly review with the underwriting team. Build a
3-page report:

Page 1 – Claims snapshot: KPI cards for total claims, open claims, reopened
claims, and General Average cases. Below that, a trend of incurred amount
by loss year (GBP) and a breakdown of claims by type (partial loss, total loss,
etc.). Add a slicer so they can pick the year of account.

Page 2 – Policy portfolio: how many policies by product, contract type
(direct vs reinsurance), and policy status. Show total insured value and
gross tonnage side by side. Include average policy duration.

Page 3 – Broker & settlement detail: for each broker, show number of policies,
claims placed, and total settlements (GBP). Show the payment ratio and
settlement ratio as gauges or KPIs. Include the reporting lag — average,
min, and max — so we can see if notifications are getting slower.
```
*Check (page 1):* KPIs: `[# Claims]`, `[# Claims (Open Claim)]`, `[# Claims (Reopened Claim)]`, `[# Claims (General Average Declared)]`. Line chart: `[Total Incurred]` by `Date[Year]` with GBP filter. Bar/column: claim count by `Claim[Claim Type]`. Slicer on `Policy[Year of Account]`.
*Check (page 2):* Breakdowns by `Policy[Product]`, `Policy[Contract Type]`, `Policy[Policy Status]`. Uses `[Total Insured Value (GBP)]` (no currency filter needed — always GBP) and `[Total Gross Tonnage]`. `[Average Policy Duration (Days)]`.
*Check (page 3):* Per-broker table with `[# Policies]`, `[# Claims]`, `[Total Settlements]` (GBP filter on `Settlement Currency`). KPIs: `[Claim Payment Ratio (%)]`, `[Claim Settlement Ratio (%)]`. `[Average / Minimum / Maximum Claim Reporting Lag (Days)]`.

**2f. Complex — loss analysis deep-dive**
```
The claims manager wants a deep-dive on marine losses. Two pages:

Page 1 – Loss overview: total incurred, paid, outstanding, and salvage
recoveries as KPI cards (GBP). Below that, show incurred by cause of loss
as a bar chart, and a trend of how incurred has moved quarterly over the
last 3 years. Also show the split between partial loss and total loss.

Page 2 – Notification & settlement efficiency: how quickly are claims being
reported (average lag in days), and is it getting better or worse over time?
Show settlement amounts by quarter, the payment ratio, and flag any claims
where General Average was declared. Let users filter by product and vessel type.
```
*Check (page 1):* KPIs: `[Total Incurred]`, `[Total Paid]`, `[Total Outstanding]`, `[Total Salvage]` — all with GBP filter. Bar: incurred by `Claim[Cause of Loss]`. Quarterly trend using `Date[Year]` + `Date[Quarter]`. Split by `Claim[Claim Type]`.
*Check (page 2):* `[Average Claim Reporting Lag (Days)]` as KPI and as trend by year. `[Total Settlements]` by quarter (settlement currency = GBP). `[Claim Payment Ratio (%)]`. `[# Claims (General Average Declared)]`. Slicers for `Policy[Product]` and vessel type.

---

## Test 3 — Filter context in DAX

**What to verify:** The agent writes correct DAX CALCULATE filters in the report plan, not just the visual title.

### Prompts

**3a. Simple single filter — status**
```
Just show me the open claims — how many and how much is outstanding, in GBP
```
*Check:* Filters `Claim[Is Open Claim] = TRUE` (or `Claim[Claim Status] = "OPEN"`). Also filters `Claim Vessels[Claim Currency] = "GBP"`. Uses `[# Claims (Open Claim)]` and `[Total Outstanding]`.

**3b. Single filter — date**
```
What policies did we write in 2024?
```
*Check:* Filters `Date[Year] = 2024` using Insurance Period Start role (default for policies). Groups by `Policy[Product]` or shows count.

**3c. Two filters — product + currency**
```
How much have we paid out on hull claims in USD?
```
*Check:* "Hull" → `Policy[Product] = "Hull & Machinery"` (ontology synonym). Currency filter on `Claim Vessels[Claim Currency] = "USD"`. Uses `[Total Paid]`.

**3d. Three filters — product + peril + currency**
```
Show me collision claims on H&M policies — what's the incurred in USD?
```
*Check:* Three filters: `Policy[Product] = "Hull & Machinery"` (H&M is a synonym), `Claim[Cause of Loss] = "Collision"`, `Claim Vessels[Claim Currency] = "USD"`.

**3e. Four filters — natural language**
```
I want to see the cargo book losses for 2023 — only open claims, in GBP.
Show incurred and outstanding.
```
*Check:* Four filters: `Policy[Product] = "Cargo"`, `Claim[Is Open Claim] = TRUE`, `Date[Year] = 2023` (Loss Date role), `Claim Vessels[Claim Currency] = "GBP"`. Uses `[Total Incurred]` and `[Total Outstanding]`.
Verification DAX:
```dax
EVALUATE
ROW(
    "Incurred", CALCULATE([Total Incurred],
        'Policy'[Product] = "Cargo",
        'Claim'[Is Open Claim] = TRUE(),
        'Date'[Year] = 2023,
        'Claim Vessels'[Claim Currency] = "GBP"),
    "Outstanding", CALCULATE([Total Outstanding],
        'Policy'[Product] = "Cargo",
        'Claim'[Is Open Claim] = TRUE(),
        'Date'[Year] = 2023,
        'Claim Vessels'[Claim Currency] = "GBP")
)
```

**3f. Five filters — meeting-style specificity**
```
For the wholesale broker review: total premium placed by wholesale brokers
on direct insurance contracts covering tankers, underwriting years 2022
through 2024, in USD.
```
*Check:* Five filters: `Broker[Broker Type] = "Wholesale"`, `Policy[Contract Type] = "Insurance"`, `Policy[Policy Vessel Type] = "Tanker"`, `Policy[Year of Account] IN {2022, 2023, 2024}`, `Policy Exposures[Currency] = "USD"`. Uses `[Total Premium]`.

**3g. Cross-fact-table filters — same broker, two money measures**
```
Pick our biggest broker and show me their total premium alongside total
incurred on their claims, both in GBP, by year of account.
```
*Check:* Filters `Broker[Broker Name]` to a specific broker. Premium from `Policy Exposures` (filter `Currency = "GBP"`), incurred from `Claim Vessels` (filter `Claim Currency = "GBP"`). Tests that the agent applies the currency filter to the RIGHT column on each fact table.

**3h. Negation filter — natural phrasing**
```
Show me all claims that haven't been closed yet, broken down by what
caused the loss — in EUR
```
*Check:* `Claim[Claim Status] <> "CLOSED"` (or uses open + reopened + denied). Currency = EUR. Groups by `Claim[Cause of Loss]`.

**3i. Date range — not just a year**
```
I want to see the monthly claims trend from the start of 2022 through
mid-2024 — just the count, no money.
```
*Check:* Date range filter (not just `Year = X`). X-axis at year-month granularity. Uses Loss Date role. No money measures.

**3j. Slicer vs hardcoded — user knows what they want**
```
Build a report showing incurred by cause of loss in GBP. I want a dropdown
where users can pick the year of account, but always exclude everything
except partial loss and total loss claim types — don't let them change that.
```
*Check:* Interactive slicer for `Policy[Year of Account]`. Hardcoded visual-level filter for `Claim[Claim Type] IN {"PARTIAL_LOSS", "TOTAL_LOSS"}`. Currency = GBP.

**3k. Filters with ontology caveats**
```
Show me the reserves on reopened claims placed through coverholders, in GBP
```
*Check:* Filters: `Claim[Is Reopened Claim] = TRUE`, `Broker[Broker Type] = "Coverholder"`, `Claim Vessels[Claim Currency] = "GBP"`. Uses `[Total Outstanding]`. Agent should note "reserve = outstanding" is an unconfirmed assumption (ontology status).

**3l. Complex multi-filter meeting report**
```
For the reinsurance committee: build a one-page report showing only
reinsurance contracts (not direct). I need:
- Total premium, limit, and policy count for RI business, in GBP
- Break it down by product and year of account (2021-2025)
- Show which brokers are placing the most RI business
- How many claims have come through on RI policies, and what's the
  incurred vs paid split (GBP)
- Add a slicer for vessel type so they can drill into specific fleets
```
*Check:* Page-level filter: `Policy[Contract Type] = "Reinsurance"`. Uses `[Total Premium]`, `[Total Limit]`, `[# Policies]` with GBP currency. Breakdowns by `Policy[Product]` and `Policy[Year of Account]` (range filter 2021-2025). Broker ranking by RI policy count. Claims measures filter through Policy relationship. Slicer on vessel type.

---

## Test 4 — Dynamic interactivity (spot-check only)

**What to verify:** After opening in Power BI Desktop, clicking one chart filters the others.

### Prompt

**4a. Cross-filter smoke test**
```
Put a bar chart of claims by status and a table of incurred by broker (GBP)
on the same page
```
*After generation:* Open in PBI Desktop. Click the "OPEN" bar. The broker table should filter to open-claim incurred only.

---

## Test 5 — Data type handling

**What to verify:** Dates, currencies, percentages, and nulls render correctly.

### Prompts

**5a. Date formatting — plain request**
```
Give me a table of the 20 most recent claims with their claim number,
when the loss happened, when it was reported, and what status they're in
```
*Check:* Loss Date as `yyyy/mm/dd`. Notification Date same. No raw timestamps.

**5b. Currency formatting**
```
I just need three big numbers: total incurred, total paid, and total
outstanding — all in GBP
```
*Check:* `#,##0.00` format. Not raw unformatted decimals.

**5c. Percentages — ratio cards**
```
What percentage of incurred has actually been paid out? And what's the
settlement ratio? Just give me the numbers.
```
*Check:* Uses `[Claim Payment Ratio (%)]` and `[Claim Settlement Ratio (%)]`. Displays as `72.35%`, not `0.7235`. Must filter by one currency. Measures are never summed/averaged.

**5d. Currency omission — trap**
```
Total premium by broker
```
*Check:* No currency specified. Without a currency filter, `[Total Premium]` = BLANK. Agent should split by currency or pick one and say so.

---

## Test 6 — Prompt ambiguity and edge cases

**What to verify:** Vague, wrong, or impossible requests handled gracefully.

### Prompts

**6a. Completely vague**
```
Just give me something useful about our marine book
```
*Expected:* Reasonable dashboard with KPI cards + a few breakdowns. Should NOT hallucinate measures.

**6b. Wrong terminology**
```
Show me the premium split by underwriter
```
*Check:* No "Underwriter" column. Ontology maps it as synonym for "Executive" (status: `ask`). Agent should ask which executive (policy, customer, or claim) or state its assumption.

**6c. Industry jargon / synonyms**
```
What's our GWP by intermediary for UW year 2024?
```
*Check:* "GWP" → `[Total Premium]` (unconfirmed — should note assumption). "Intermediary" → `Broker[Broker Name]`. "UW year" → `Policy[Year of Account] = 2024`. Agent should caveat the GWP assumption.

**6d. Impossible visualization**
```
Show me a pie chart of every policyholder
```
*Check:* Potentially thousands of slices. Agent should group by top N, use a table instead, or warn.

**6e. No-data filter**
```
Show me earthquake claims
```
*Check:* Likely no earthquake cause of loss in marine data. Agent should warn or handle empty results gracefully.

**6f. Ambiguous term — "outstanding"**
```
What's outstanding right now?
```
*Check:* Ontology: "outstanding claims" = count of open claims vs "outstanding amount" = money. Agent should state which interpretation. Default per ontology: "outstanding claims" = count of open claims, "outstanding amount" = `[Total Outstanding]`.

**6g. Conversational follow-up style**
```
Can you just tell me how we're doing this year?
```
*Check:* Very vague. Agent should produce a sensible 2024/2025 snapshot — claim count, policy count, maybe incurred trend. Should ask for clarification or state assumptions.

**6h. Non-insurance request**
```
Show me a weather forecast for next week
```
*Check:* Should refuse — nothing in the model relates to weather.

---

## Test 7 — Ontology adherence

**What to verify:** Correct business terminology, respect term statuses, follow global rules.

### Prompts

**7a. Business labels in visuals**
```
Claims overview: show me incurred, paid, and outstanding by loss year,
and which brokers have the most outstanding — all in GBP
```
*Check:* Visual titles use business names: "Total Incurred", "Total Paid", "Total Outstanding". NOT column names like "incurred_amount" or "SUM of Paid Amount".

**7b. Inactive date relationship — notification date**
```
How many claims are we getting notified of each quarter?
```
*Check:* MUST use `[# Claim Vessels (by Notification Date)]` — the special inactive-relationship measure. Should NOT use default Loss Date. The ontology explicitly documents this.

**7c. "Never sum" rule — reporting lag**
```
What's the average time between a loss happening and us finding out about it,
by year of account?
```
*Check:* Uses `[Average Claim Reporting Lag (Days)]`. Must NOT try to SUM or AVERAGE the raw column (ontology rule NO-SUM-RATIOS).

**7d. UNKNOWN member**
```
List all our brokers with how many policies each one has
```
*Check:* `[# Brokers]` and `[# Policies]` already exclude UNKNOWN. If agent writes custom DAX, it must also exclude the UNKNOWN row.

**7e. Default date role**
```
Show me claims by year and policies by year — side by side
```
*Check:* Claims use Loss Date role (default). Policies use Insurance Period Start (default). Same `Date[Year]` axis but different relationships. The agent should not mix the two.

---

## Test 8 — Semantic model correctness

**What to verify:** Cross-table joins through the right dimension, model relationships used correctly.

### Prompts

**8a. Broker as shared dimension**
```
For each broker, I want to see how many policies they've placed AND how much
we've paid out on their claims — both in GBP. Who's costing us the most
relative to what they bring in?
```
*Check:* Crosses `Policy Exposures` (policies) and `Claim Vessels` (paid) through `Broker` dimension. Both relationships exist. Agent should use separate measures, not try to join tables manually.

**8b. Vessel dimension**
```
Which types of vessels are giving us the most trouble? Show incurred in GBP,
and tell me which flag states are involved.
```
*Check:* Uses `Vessel[Vessel Type]` (from claims), `Policy[Flag State Country Code]`. Incurred from `Claim Vessels → Vessel` relationship.

**8c. Facility dimension**
```
How does our business look split by facility? Number of policies and
total limit, in GBP
```
*Check:* `Facility[Facility Name]`, `[# Policy Exposures]`, `[Total Limit]` with GBP filter. Tests `Policy Exposures → Facility`.

**8d. Complex — customer and policy together**
```
Who are our biggest customers by insured value, and how many claims have
they had?
```
*Check:* Uses `Customer` table. `[Total Insured Value (GBP)]` (no currency filter needed — always GBP) and `[# Claims]` through `Customer` dimension. Both `Claim Vessels → Customer` and `Policy Exposures → Customer` relationships exist.

---

## Test 10 — Regeneration consistency

**What to verify:** Same prompt produces structurally similar reports across runs.

### Prompt (run 3 times)

```
Give me a claims dashboard with the total number of claims as a big KPI,
a bar chart of claims by status, and a line showing incurred over the years
in GBP
```

*Compare across runs:*
- Same measures? (`[# Claims]`, `[Total Incurred]`)
- Same chart types? (KPI, bar, line)
- Same columns? (`Claim[Claim Status]`, `Date[Year]`)
- Same currency filter?

Minor differences (colors, positioning) = fine. Structural differences (bar vs pie, different measures) = consistency problem.

---

## Test 12 — Error handling and feedback

**What to verify:** Clear errors, no UI hangs, retry works, invalid PBIR caught before deployment.

### Prompts

**12a. Nonsense column — force build failure**
```
Build a chart using the "Profitability Score" column from claims
```
*Check:* No such column. `pbir_build.py` should catch it. UI shows "did not pass the build" with detail. Retry button available.

**12b. Non-Marine LOB rejection**
```
(Select "Automobile" tab, then type:)
How are our auto claims trending?
```
*Check:* Immediate rejection: "Automobile isn't available yet: only Marine has an ontology so far."

**12c. Massive prompt — budget/turn limit**
```
Build a 10-page report with every single measure and column in the model.
I want a separate page for each dimension table, with every possible
breakdown and every KPI.
```
*Check:* Agent has 60-turn max and $10 budget. Should either simplify or hit the limit with a clear error. UI should NOT hang.

---

## Test 13 — LOB boundary (simplified)

### Prompts

**13a. Cross-LOB prompt**
```
Can you compare our marine claims with the property book?
```
*Check:* Agent says property data isn't in this model. Does NOT make up numbers.

**13b. Tab enforcement**
```
(Select Automobile, Aviation, and Property tabs one by one, submit any prompt)
```
*Check:* All three rejected immediately.

---

## Test 14 — Currency rule compliance

**What to verify:** Money measures never shown without currency context. The #1 source of blank values.

### Prompts

**14a. No currency — simple trap**
```
What's the total premium by broker?
```
*Check:* Without currency filter → BLANK. Agent MUST split by currency or pick one.

**14b. Multi-currency comparison**
```
How does our incurred compare across GBP, USD, and EUR?
```
*Check:* Three separate bars/columns, one per currency. NOT a single total (that's BLANK by design).

**14c. GBP exception — insured value**
```
What's our total insured value across all policies?
```
*Check:* `[Total Insured Value (GBP)]` is always GBP — can be totalled without currency filtering. Agent should note it's in GBP.

**14d. Settlement vs claim currency — subtle trap**
```
How much have we settled by broker?
```
*Check:* Settlements use `Settlement Currency` (from `Claim Settlement Transactions`), NOT `Claim Currency`. Agent must filter the right column.

**14e. Mixed money and counts — only money needs currency**
```
For each product, show number of claims and total paid
```
*Check:* `[# Claims]` needs no currency. `[Total Paid]` does. Agent should filter currency for the money column but not unnecessarily restrict the count.

---

## Test 15 — Ontology "not_available" and "ask" terms

**What to verify:** Agent refuses or caveats blocked/ambiguous terms.

### Prompts

**15a. Loss ratio — not available**
```
What's our loss ratio by year of account?
```
*Check:* NOT IN MODEL (no earned premium). Agent should either say not available, or offer `Total Incurred / Total Premium` labelled as "incurred-to-written ratio, not a loss ratio" (per ontology note). Should NOT silently present made-up numbers.

**15b. Net claim cost — blocked**
```
Show me the net cost of claims by product
```
*Check:* `KPI-NET-CLAIM-COST` is blocked. Agent should say not available.

**15c. Lloyd's risk code — blocked**
```
Break down our book by Lloyd's risk code
```
*Check:* `MAR2-06` is blocked. Not available.

**15d. Executive — ambiguous (ask)**
```
Who are the busiest executives on claims?
```
*Check:* Three executive columns exist: `Policy[Policy Executive]`, `Customer[Customer Executive]`, `Claim Vessels[Executive]`. Status = `ask`. Agent should ask which one or state its default.

**15e. Unconfirmed terms — should state assumptions**
```
What's outstanding on our open claims, by broker? GBP.
```
*Check:* "Open claim" (unconfirmed): should state assumption — using `Claim[Is Open Claim] = TRUE`. "Outstanding" (unconfirmed): should note "reserve = outstanding" assumption.

**15f. Trap inside a complex prompt — one blocked, rest valid**
```
Build me a page with: total claims, incurred by year (GBP), payment ratio,
loss ratio by product, and net claim cost by broker
```
*Check:* Total claims, incurred, payment ratio → all valid. Loss ratio → not available (offer approximation). Net claim cost → blocked. Agent should build the valid parts and explain why the other two can't be included.

---

## Suggested testing order

| Phase | Tests | Why first |
|-------|-------|-----------|
| 1 | 1a-1e, 14a-14e | Basic accuracy + currency rule. If these fail, nothing else matters. |
| 2 | 5a-5d, 8a-8d | Data types + semantic model joins across tables. |
| 3 | 15a-15f, 7a-7e | Ontology compliance — blocked terms, business rules, date roles. |
| 4 | 3a-3l, 6a-6h | Filters (simple → 5-filter combos) + edge cases. |
| 5 | 2a-2f, 10 | Multi-chart/multi-page layouts + regeneration consistency. |
| 6 | 12a-12c, 13a-13b | Error handling + LOB boundary. |
| 7 | 4a | Quick interactivity spot-check in Power BI Desktop. |

---

## Prompt complexity spectrum (summary)

| Level | Example | Tests |
|-------|---------|-------|
| **One-liner** | "How many claims do we have?" | 1a, 3a, 3b, 6a, 14a |
| **One sentence + specifics** | "Show incurred by cause of loss, GBP" | 1b-1e, 3c-3d, 5a-5d, 7a-7d |
| **Bullet list** | "I need three things: KPI, bar chart, trend" | 2a, 2c |
| **Short paragraph** | "Two-page report, claims on one, policies on the other" | 2b, 3g, 3l |
| **Meeting-prep brief** | Multi-page spec with slicers, traps, and business context | 2d, 2e, 2f, 15f |

# Report Spec: Marine Underwriting Leadership

## Report identity
- Report name: Marine Underwriting Leadership
- Semantic model: Marine_Gold_Model (DataSonic 3)
- Audience: Marine underwriting leadership team
- Primary purpose: page 1 shows the size and shape of the written portfolio; page 2 shows how claims sit against it
- Delivery target: **Local PBIP only**, live-connected to the Fabric model. Nothing is published.

## Semantic model binding
- Entry mode:          Live Connected Model
- Workspace name:      DataSonic 3
- Workspace ID:        1296a62d-7e36-4481-a586-686e8d4b0ccc
- Model name:          Marine_Gold_Model
- Model ID:            dcd787e0-dd7d-47fd-bb3d-af3669727011
- connectionString:    Data Source=powerbi://api.powerbi.com/v1.0/myorg/DataSonic 3;Initial Catalog=Marine_Gold_Model;Integrated Security=ClaimsToken;semanticModelId=dcd787e0-dd7d-47fd-bb3d-af3669727011

## User decisions and constraints
- Page count: 2 (Portfolio; Claims vs portfolio)
- Interactivity: page tabs only. Each page has a Currency slicer (single-select, required, default GBP) and a Broker type slicer. The user asked for Broker type on page 1; it's also on page 2 for consistency. Charts cross-filter each other.
- Design direction: clean corporate ("Corporate Cool")
- Publishing: none (the user said "don't publish anything")
- Model edit permissions: none. All extra logic is in report-level measures.
- Decisions made with the user (2026-09-30):
  - "Executive" = **Policy executive** (`Policy[Policy Executive]`, filled for every claim; the claim executive is blank on 50% of claims).
  - "Loss ratio" = **incurred-to-written ratio**, labelled "not an earned loss ratio", because earned premium isn't in the model.
- Unconfirmed ontology defaults used (stated in subtitles): GWP = Total Premium; OS reserve = Total Outstanding; LOB = Product.
- Data caveats:
  - Money never totals across currencies (single-select Currency slicer, default GBP).
  - Insured value is always GBP, but it's shown for the policies written in the selected currency.
  - Policy status also has **Lapsed** (105 policies); it's shown next to Active, Expired and Cancelled.
  - 1 policy has no year of account; it's excluded from the two year-of-account visuals only.
  - Counts on page 2 (claims, notified) are for claims in the selected currency, like the money.
  - The data is synthetic: incurred is about 40× premium, so the incurred-to-written ratio is about 4,000%.

## Narrative
- Page 1: Hull & Machinery writes almost 40% of GWP (GBP £439m of £1,133m), and fewer than 1 in 10 policies are active (GBP: 139 of 1,637).
- Page 2: Hull & Machinery holds a third of the OS reserve (GBP £8.0bn of £24.5bn); 2025 notifications peaked in Q3 (GBP: 66 / 58 / 87 / 74); reporting lag is flat at 21–24 days across causes.
- Key questions answered:
  1. How much GWP, limit and insured value by product and by year of account?
  2. How many policies are active, expired, cancelled (and lapsed)?
  3. Where is the OS reserve and paid by LOB?
  4. How many claims were notified each quarter of 2025?
  5. Which causes of loss are reported slowest?
  6. What is incurred relative to written premium by year of account?
  7. How are claims spread across policy executives?

## Design identity
- Tone: Corporate Cool (cool grey `#F1F5F9` surface, white cards, slate text `#334155`, Segoe UI)
- Signature: teal `#0E7490` marks GWP on page 1; cyan `#0891B2` marks OS reserve on page 2.

## Page plan
1. **Portfolio**: "Hull & Machinery writes almost 40% of GWP, and fewer than 1 in 10 policies are still active"
   - Layout variant B (KPI strip), 5 KPIs: Policies, Active policies, GWP, Total limit, Insured value (GBP)
   - Ranked bar GWP by product; column GWP by year of account; bar Policies by status
   - Matrix by product (policies, GWP, limit, insured value in millions); matrix by year of account (same)
2. **Claims vs portfolio**: "Hull & Machinery holds a third of the OS reserve, and notifications peaked in Q3 2025"
   - Layout variant B, 6 KPIs: Claims, Open claims, OS reserve, Paid, Avg reporting lag, Incurred-to-written
   - Clustered column OS reserve + paid by LOB; column incurred-to-written by year of account
   - Column claims notified per quarter 2025 (notification date); bar avg reporting lag by cause; matrix claims by policy executive

## Model requirements
- Existing measures: `[Total Premium]`, `[Total Limit]`, `[Total Insured Value (GBP)]`, `[Total Outstanding]`, `[Total Paid]`, `[Total Incurred]`, `[Average Claim Reporting Lag (Days)]`
- Report-level measures (report file only):
  - `Policies` = `DISTINCTCOUNT('Policy Exposures'[Policy Number])`; `Active Policies` = same with `'Policy'[Policy Status] = "Active"`
  - `Claims`, `Open Claims` (as in the claims overview report)
  - `Claims Notified` = `CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), USERELATIONSHIP('Claim Vessels'[Notification Date Key], 'Date'[Date Key]))`
  - `Incurred to Written` = `VAR ccy = SELECTEDVALUE('Claim Vessels'[Claim Currency]) RETURN IF(NOT ISBLANK(ccy), DIVIDE([Total Incurred], CALCULATE([Total Premium], 'Policy Exposures'[Currency] = ccy)))`
  - `Reporting Lag (days)` (1 decimal), and `(m)` versions of GWP, limit, insured value, OS reserve and paid for the tables
- New calculated columns / relationships: none

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "Corporate Cool: cool grey #F1F5F9 surface, white cards with 1px #E2E8F0 border and 8px radius, slate #334155 type, Segoe UI"
    signature: "Teal #0E7490 marks GWP on Portfolio; cyan #0891B2 marks OS reserve on Claims vs portfolio; other measures slate"
  archetype: Executive
  navigation_model: tabs
  color_map:
    - {measure: "Policy Exposures[Total Premium]", color: "#0E7490", tint: "#CFFAFE"}
    - {measure: "Policy Exposures[Total Limit]", color: "#475569", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Total Outstanding]", color: "#0891B2", tint: "#CFFAFE"}
    - {measure: "Claim Vessels[Total Paid]", color: "#64748B", tint: "#F1F5F9"}
    - {measure: "Claim Vessels[Incurred to Written]", color: "#1E293B", tint: "#E2E8F0"}
    - {measure: "Policy Exposures[Policies]", color: "#334155", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Claims Notified]", color: "#334155", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Reporting Lag (days)]", color: "#334155", tint: "#E2E8F0"}
  report_measures: "see report.yaml report_measures (12 measures, report file only)"
  page_filters: []
  pages:
    - name: "Portfolio"
      role: landing
      archetype: Executive
      layout_variant: B
      variant_rationale: "Five portfolio KPIs of equal weight, then three small charts (product, year, status) and two detail tables that carry limit and insured value next to GWP."
      navigation: []
      page_background: "#F1F5F9"
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:        [1, 1, 9, 2]
            filters:       [9, 1, 13, 2]
            kpis:          [1, 2, 13, 4]
            products:      [1, 4, 5, 8]
            years:         [5, 4, 9, 8]
            status:        [9, 4, 13, 8]
            product_table: [1, 8, 7, 13]
            year_table:    [7, 8, 13, 13]
        placements:
          - {id: page_title, region: header, kind: textbox}
          - {id: currency_slicer, region: filters, kind: slicer, field_bindings: "Policy Exposures[Currency]", selection: single_required, default: "GBP", slot: 1, of: 2}
          - {id: broker_type_slicer, region: filters, kind: slicer, field_bindings: "Broker[Broker Type]", slot: 2, of: 2}
          - {id: kpis, region: kpis, kind: cardVisual, field_bindings: ["Policy Exposures[Policies]", "Policy Exposures[Active Policies]", "Policy Exposures[Total Premium]", "Policy Exposures[Total Limit]", "Policy Exposures[Total Insured Value (GBP)]"]}
          - {id: gwp_by_product, region: products, kind: barChart, field_bindings: {Category: "Policy[Product]", Y: "Policy Exposures[Total Premium]"}, sort_policy: value_desc}
          - {id: gwp_by_yoa, region: years, kind: columnChart, field_bindings: {Category: "Policy[Year of Account]", Y: "Policy Exposures[Total Premium]"}, sort_policy: category_asc, visual_filter: "Year of Account >= 2019"}
          - {id: status, region: status, kind: barChart, field_bindings: {Category: "Policy[Policy Status]", Y: "Policy Exposures[Policies]"}, sort_policy: value_desc}
          - {id: product_table, region: product_table, kind: pivotTable, sort_policy: "GWP (m) desc"}
          - {id: year_table, region: year_table, kind: pivotTable, sort_policy: category_asc, visual_filter: "Year of Account >= 2019"}
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: product_table, pct_of_content: 23 }
          balance_rationale: "2-row KPI strip, a row of three 4x4 charts, then two 6x5 tables; no dead bands."
    - name: "Claims vs portfolio"
      role: detail
      archetype: Executive
      layout_variant: B
      variant_rationale: "Six claims KPIs, then two wide charts (LOB, year of account) and three narrower analyses (quarterly notifications, lag by cause, executive table)."
      navigation: []
      page_background: "#F1F5F9"
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:   [1, 1, 9, 2]
            filters:  [9, 1, 13, 2]
            kpis:     [1, 2, 13, 4]
            lob:      [1, 4, 7, 8]
            ratio:    [7, 4, 13, 8]
            notified: [1, 8, 4, 13]
            lag:      [4, 8, 8, 13]
            execs:    [8, 8, 13, 13]
        placements:
          - {id: page_title, region: header, kind: textbox}
          - {id: currency_slicer, region: filters, kind: slicer, field_bindings: "Claim Vessels[Claim Currency]", selection: single_required, default: "GBP", slot: 1, of: 2}
          - {id: broker_type_slicer, region: filters, kind: slicer, field_bindings: "Broker[Broker Type]", slot: 2, of: 2}
          - {id: kpis, region: kpis, kind: cardVisual, field_bindings: ["Claim Vessels[Claims]", "Claim Vessels[Open Claims]", "Claim Vessels[Total Outstanding]", "Claim Vessels[Total Paid]", "Claim Vessels[Reporting Lag (days)]", "Claim Vessels[Incurred to Written]"]}
          - {id: os_paid_by_lob, region: lob, kind: clusteredColumnChart, field_bindings: {Category: "Policy[Product]", Y: ["Claim Vessels[Total Outstanding]", "Claim Vessels[Total Paid]"]}, sort_policy: "OS desc"}
          - {id: ratio_by_yoa, region: ratio, kind: columnChart, field_bindings: {Category: "Policy[Year of Account]", Y: "Claim Vessels[Incurred to Written]"}, sort_policy: category_asc, visual_filter: "Year of Account >= 2019"}
          - {id: notified_2025, region: notified, kind: columnChart, field_bindings: {Category: "Date[Quarter]", Y: "Claim Vessels[Claims Notified]"}, sort_policy: category_asc, visual_filter: "Date[Year] = 2025 (notification date via USERELATIONSHIP)"}
          - {id: lag_by_cause, region: lag, kind: barChart, field_bindings: {Category: "Claim[Cause of Loss]", Y: "Claim Vessels[Reporting Lag (days)]"}, sort_policy: value_desc, visual_filter: "Cause of Loss not blank"}
          - {id: execs, region: execs, kind: pivotTable, field_bindings: ["Policy[Policy Executive]", "Claim Vessels[Claims]", "Claim Vessels[Open Claims]", "Claim Vessels[OS Reserve (m)]", "Claim Vessels[Paid (m)]"], sort_policy: "Claims desc"}
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: lob, pct_of_content: 18 }
          balance_rationale: "2-row KPI strip, two 6x4 charts, then 3+4+5 columns x 5 rows; no dead bands."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Slicers filter their page; charts and tables cross-filter each other."
  accessibility:
    alt_text_strategy: "Each alt text states what the visual shows and the leading item."
    contrast_notes: "Slate #334155 on white 10.4:1; teal/cyan used for graphics only."
  theme:
    base: "references/design/assets/base.json adapted to Corporate Cool (scripts/pbir_build.py)"
    user_overrides: "none"
```

## Implementation notes
- Build: `python scripts/pbir_build.py reports/marine-underwriting-leadership/report.yaml`, then validate and check in Desktop.
- Risks: the `Cause of Loss <> ""` visual filter must drop the 5 blank-cause claims (check in Desktop); the quarter axis shows 1–4.
- Publishing boundary: not published.

## Changes after the Desktop review (2026-09-30)
- The model formats `Policy[Year of Account]` as `#,##0`, so years showed as "2,020". Year-of-account axes now use `Date[Year]`, and the numbers are unchanged:
  - Page 1 uses `Date[Year]` through the active Insurance Period Start relationship. Year of account basis is INCEPTION, and it matches the inception year for every policy (checked with DAX).
  - Page 2 uses the report measure `Incurred to Written by YoA`, which maps `Date[Year]` onto `Policy[Year of Account]` with `TREATAS`.
- OS reserve and paid by LOB is now a clustered column chart (it was stacked). The generator gained the `clustered_column` and `clustered_bar` kinds.
- Page 1: charts are 5 rows tall and tables 4 rows, to reduce empty table space.
- Validate: 0 errors, 0 warnings. Desktop screenshots reviewed; the numbers match the DAX checks.

# Report Spec: Marine Broker and Vessel Risk Review

## Report identity
- Report name: Marine Broker and Vessel Risk Review
- Semantic model: Marine_Gold_Model (DataSonic 3)
- Audience: Broker & risk review meeting attendees (managers / leadership)
- Primary purpose: compare broker performance on claims, reserves and commercial terms, then review vessel risk profile and settlement trends
- Delivery target: **Local PBIP only**, live-connected to the Fabric model. Nothing is published to Fabric in this build.

## Semantic model binding
- Entry mode:          Live Connected Model
- Workspace name:      DataSonic 3
- Workspace ID:        1296a62d-7e36-4481-a586-686e8d4b0ccc
- Model name:          Marine_Gold_Model
- Model ID:            dcd787e0-dd7d-47fd-bb3d-af3669727011
- connectionString:    Data Source=powerbi://api.powerbi.com/v1.0/myorg/DataSonic 3;Initial Catalog=Marine_Gold_Model;Integrated Security=ClaimsToken;semanticModelId=dcd787e0-dd7d-47fd-bb3d-af3669727011

## User decisions and constraints
- Scope: 2 pages for a broker & risk review meeting
- Page count: 2
- Interactivity: tab navigation between pages. Page 1: Currency (single-select, required), Broker type and Product slicers. Page 2: Claim currency and Settlement currency slicers (both single-select, required). Charts cross-filter each other.
- Design direction: Corporate Cool (cool grey surface, slate text, cyan accent)
- Publishing: none. The report stays local.
- Model edit permissions: **none**. The model is read-only. The report adds eight **report-level measures** (stored in the report file, not the model).
- Not available: Net claim cost is blocked in the model (KPI-NET-CLAIM-COST). Total Incurred by vessel type is shown instead.
- Accessibility: WCAG AA contrast, alt text on every chart, human-readable labels
- Data caveats:
  - Money never totals across currencies. Each page has single-select currency slicers with GBP as the default.
  - Page 2 has money from two facts (Claim Vessels and Claim Settlement Transactions), so it uses two separate currency slicers.
  - 20 claims have loss dates in 2027 (in the future). They are **excluded by a page filter (Year <= 2026)** on both pages, and the subtitle says so.
  - Claims count (DISTINCTCOUNT) does not vary across broker types or vessel types in this dataset because claims are linked to multiple brokers/vessels. The money measures differentiate effectively.
  - Odd vessel types exist in the data (Office, Solar Array, Commercial Jet, Oil Rig).

## Narrative
- Core story (Page 1): Wholesale brokers carry the highest outstanding reserve across all four broker types, with payment ratios around 46-47%. The top broker by outstanding (Salazar LLC, GBP 365M) has delegated authority and 9.4% commission.
- Core story (Page 2): Container ships and tankers together drive about half the incurred claims book. Over a quarter of claims were reopened. Settlements grew sharply from 2021 and peaked in 2024 Q2.
- Key questions answered:
  1. How do broker types compare on incurred and outstanding?
  2. Does delegated authority or commission level make a difference?
  3. Which brokers hold the most outstanding, and what are their TOBA details?
  4. Which vessel types and flag states drive incurred?
  5. How many claims were reopened or had GA declared?
  6. What is the quarterly settlement trend?
  7. How long do claims take to be notified (reporting lag)?

## Design identity
- Tone: Corporate Cool (cool grey `#F1F5F9` surface, slate text `#334155`, cyan accent, Segoe UI)
- Signature: cyan marks **Outstanding** everywhere it appears (KPI accent, chart bars, table data). Everything else is slate.

## Page plan

### Page 1: Wholesale brokers carry the highest outstanding reserve
- Archetype: Comparison
- Layout variant: B (KPI strip). Four KPIs followed by two comparison charts and a detail table.
- Purpose: Compare broker performance and highlight TOBA details for the top brokers
- Visuals:
  - 4 KPI cards: Claims, Incurred, Outstanding, Payment ratio
  - Clustered bar: Incurred & Outstanding by broker type (4 bars)
  - Clustered bar: Incurred & Outstanding by delegated authority (2 bars)
  - Matrix table: Broker Name, FCA Number, Onboarded, Commission %, DA, Claims, Outstanding (m), Payment ratio
- Slicers: Currency (single, default GBP), Broker type (dropdown, multi), Product (dropdown, multi)

### Page 2: Container ships and tankers drive half the incurred claims book
- Archetype: Risk Analysis
- Layout variant: B (KPI strip). Four KPIs, two risk breakdown bars, a settlement trend and a reporting lag chart.
- Purpose: Show where vessel risk concentrates and how settlements and notification lag behave
- Visuals:
  - 4 KPI cards: Claims, Reopened claims, GA declared, Avg reporting lag (days)
  - Bar: Incurred by vessel type
  - Bar: Incurred by flag state
  - Stacked column: Settlements by year with quarter segments
  - Bar: Average reporting lag by vessel type
- Slicers: Claim currency (single, default GBP), Settlement currency (single, default GBP)

## Design system summary
- Theme: `base.json` adapted to Corporate Cool. Page `#F1F5F9`, cards white with 1px `#E2E8F0` border, 8px radius.
- Colour semantics:
  - Outstanding = cyan `#0891B2`
  - Incurred = slate-800 `#1E293B`
  - Paid = slate-500 `#64748B`
  - Counts and ratio = slate-700 `#334155`
- Typography: Segoe UI Semibold 24pt title, Segoe UI 11pt body, 28pt card values
- Layout: FHD 1920x1080, 12x12 grid, 32px margin, 24px gutter, 8px snap
- Accessibility: all text pairs at least 4.5:1; chart colours at least 3:1 against white; alt text on every visual

## Model requirements
- Existing measures: `[Total Incurred]`, `[Total Paid]`, `[Total Outstanding]`, `[Total Settlements]`, `[Claim Payment Ratio (%)]`, `[Average Claim Reporting Lag (Days)]`, `[# Claims (Reopened Claim)]`, `[# Claims (General Average Declared)]`
- New **report-level** measures (in the report file only, not the model):
  - `Claims` = `DISTINCTCOUNT('Claim Vessels'[Claim Number])` — responds to fact-side slicers unlike the dimension count
  - `Outstanding (m)` = `DIVIDE([Total Outstanding], 1000000)` — readable table values
  - `Reopened Claims` = `CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Reopened Claim] = TRUE())` — fact-side reopened count
  - `GA Declared` = `CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[General Average Declared] = TRUE())` — fact-side GA count
  - `FCA Number` = `MAX(Broker[FCA Registration Number])` — broker attribute as a measure for the table
  - `Commission` = `MAX(Broker[Commission %])` — broker attribute as a measure for the table
  - `Onboarded` = `FORMAT(MAX(Broker[Date of Onboarding]), "YYYY-MM-DD")` — broker onboarding date for the table
  - `DA` = `IF(MAX(Broker[Delegated Authority]) = TRUE(), "Yes", "No")` — delegated authority flag for the table
- New calculated columns: none
- Relationship/sort requirements: none. Loss Date and Last Transaction Date use their active relationships to Date.

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "Corporate Cool: cool grey #F1F5F9 surface, white cards with 1px #E2E8F0 border and 8px radius, slate #334155 type, Segoe UI throughout"
    signature: "Cyan #0891B2 marks Outstanding everywhere; all other measures are slate"
  archetype: Comparison / Risk Analysis
  navigation_model: tabs
  color_map:
    - measure: "Claim Vessels[Total Outstanding]"
      color: "#0891B2"
      tint: "#CFFAFE"
    - measure: "Claim Vessels[Total Incurred]"
      color: "#1E293B"
      tint: "#E2E8F0"
    - measure: "Claim Vessels[Claims]"
      color: "#334155"
      tint: "#E2E8F0"
    - measure: "Claim Vessels[Claim Payment Ratio (%)]"
      color: "#334155"
      tint: "#E2E8F0"
    - measure: "Claim Settlement Transactions[Total Settlements]"
      color: "#0E7490"
      tint: "#CFFAFE"
    - measure: "Claim Vessels[Average Claim Reporting Lag (Days)]"
      color: "#475569"
      tint: "#E2E8F0"
  report_measures:
    - table: "Claim Vessels"
      name: "Claims"
      expression: "DISTINCTCOUNT('Claim Vessels'[Claim Number])"
      format: "#,##0"
    - table: "Claim Vessels"
      name: "Outstanding (m)"
      expression: "DIVIDE([Total Outstanding], 1000000)"
      format: "#,##0.0"
    - table: "Claim Vessels"
      name: "Reopened Claims"
      expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Reopened Claim] = TRUE())"
      format: "#,##0"
    - table: "Claim Vessels"
      name: "GA Declared"
      expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[General Average Declared] = TRUE())"
      format: "#,##0"
    - table: "Broker"
      name: "FCA Number"
      expression: "MAX(Broker[FCA Registration Number])"
      format: ""
    - table: "Broker"
      name: "Commission"
      expression: "MAX(Broker[Commission %])"
      format: "0.0%"
    - table: "Broker"
      name: "Onboarded"
      expression: "FORMAT(MAX(Broker[Date of Onboarding]), \"YYYY-MM-DD\")"
      format: ""
    - table: "Broker"
      name: "DA"
      expression: "IF(MAX(Broker[Delegated Authority]) = TRUE(), \"Yes\", \"No\")"
      format: ""
  page_filters:
    - field: "Date[Year]"
      condition: "<= 2026"
      reason: "20 claims have future (2027) loss dates; excluded and disclosed in subtitles"
  pages:
    - name: "Wholesale brokers carry the highest outstanding reserve"
      role: landing
      archetype: Comparison
      layout_variant: B
      variant_rationale: "Four KPIs of comparable weight, two comparison charts for broker type and delegated authority, and a detail table. The model has no prior-period or target measures."
      navigation: [Vessel risk & settlements]
      page_background: "#F1F5F9"
      layout_summary: "Title + 3 inline slicers; 4-card KPI strip; clustered bars for broker type (left) and delegated authority (right); full-width broker detail table."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:        [1, 1, 9, 2]
            filters:       [9, 1, 13, 2]
            kpis:          [1, 2, 13, 4]
            by_type:       [1, 4, 7, 9]
            by_da:         [7, 4, 13, 9]
            broker_detail: [1, 9, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "Wholesale brokers carry the highest outstanding reserve"
            subtitle: "Marine broker review - amounts in the selected currency (no FX) - loss years up to 2026"
            purpose: "State the page insight before any chart."
          - id: currency_slicer
            region: filters
            kind: slicer
            field_bindings: "Claim Vessels[Claim Currency]"
            slicer_type: dropdown
            selection: single_required
            default: "GBP"
            display_name: "Currency"
            slot: 1
            of: 3
          - id: broker_type_slicer
            region: filters
            kind: slicer
            field_bindings: "Broker[Broker Type]"
            slicer_type: dropdown
            display_name: "Broker type"
            slot: 2
            of: 3
          - id: product_slicer
            region: filters
            kind: slicer
            field_bindings: "Policy[Product]"
            slicer_type: dropdown
            display_name: "Product"
            slot: 3
            of: 3
          - id: kpi_claims
            region: kpis
            kind: cardVisual
            purpose: "How many claims are in scope?"
            field_bindings: "Claim Vessels[Claims]"
            display_name: "Claims"
            color_strategy: measure_match
            slot: 1
            of: 4
          - id: kpi_incurred
            region: kpis
            kind: cardVisual
            purpose: "What is the total incurred?"
            field_bindings: "Claim Vessels[Total Incurred]"
            display_name: "Incurred"
            display_units: auto
            color_strategy: measure_match
            slot: 2
            of: 4
          - id: kpi_outstanding
            region: kpis
            kind: cardVisual
            purpose: "How much is still outstanding (reserve)?"
            field_bindings: "Claim Vessels[Total Outstanding]"
            display_name: "Outstanding"
            display_units: auto
            color_strategy: measure_match
            signature_accent: true
            slot: 3
            of: 4
          - id: kpi_payment_ratio
            region: kpis
            kind: cardVisual
            purpose: "What share of incurred has been paid?"
            field_bindings: "Claim Vessels[Claim Payment Ratio (%)]"
            display_name: "Payment ratio"
            format: "0.0%"
            color_strategy: measure_match
            slot: 4
            of: 4
          - id: incurred_os_by_broker_type
            region: by_type
            kind: clusteredBarChart
            purpose: "Does broker type make a difference to incurred and outstanding?"
            field_bindings:
              Category: "Broker[Broker Type]"
              Y: ["Claim Vessels[Total Incurred]", "Claim Vessels[Total Outstanding]"]
            title: "Incurred and outstanding by broker type"
            sort_policy: value_desc
            color_strategy: measure_match
            legend: top
          - id: incurred_os_by_da
            region: by_da
            kind: clusteredBarChart
            purpose: "Does delegated authority make a difference?"
            field_bindings:
              Category: "Broker[Delegated Authority]"
              Y: ["Claim Vessels[Total Incurred]", "Claim Vessels[Total Outstanding]"]
            title: "Incurred and outstanding by delegated authority"
            sort_policy: value_desc
            color_strategy: measure_match
            legend: top
          - id: broker_detail_table
            region: broker_detail
            kind: tableEx
            purpose: "Which brokers carry the most outstanding, and what are their TOBA details?"
            field_bindings: ["Broker[Broker Name]", "Broker[FCA Number]", "Broker[Onboarded]", "Broker[Commission]", "Broker[DA]", "Claim Vessels[Claims]", "Claim Vessels[Outstanding (m)]", "Claim Vessels[Claim Payment Ratio (%)]"]
            display_names: ["Broker", "FCA number", "Onboarded", "Commission %", "DA", "Claims", "Outstanding (m)", "Payment ratio"]
            title: "Top brokers by outstanding (highest first)"
            sort_policy: value_desc
            color_strategy: measure_match
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: broker_detail, pct_of_content: 36 }
          balance_rationale: "A 2-row KPI strip, then two balanced comparison charts (5 rows, 6 cols each), then a full-width detail table (4 rows). No dead bands."
    - name: "Container ships and tankers drive half the incurred claims book"
      role: detail
      archetype: Risk Analysis
      layout_variant: B
      variant_rationale: "Four KPIs (claims, reopened, GA, lag), two risk breakdown bars, a settlement trend and a reporting lag chart. No single hero metric."
      navigation: [Broker performance]
      page_background: "#F1F5F9"
      layout_summary: "Title + 2 inline slicers; 4-card KPI strip; incurred by vessel type (left) and flag state (right); settlements by quarter (left) and reporting lag by vessel type (right)."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:          [1, 1, 9, 2]
            filters:         [9, 1, 13, 2]
            kpis:            [1, 2, 13, 4]
            by_vessel:       [1, 4, 7, 9]
            by_flag:         [7, 4, 13, 9]
            settlements_qtr: [1, 9, 7, 13]
            lag_by_vessel:   [7, 9, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "Container ships and tankers drive half the incurred claims book"
            subtitle: "Marine vessel risk & settlements - claim amounts use the claim currency slicer, settlements use the settlement currency slicer (no FX) - loss years up to 2026"
            purpose: "State the page insight before any chart."
          - id: claim_currency_slicer
            region: filters
            kind: slicer
            field_bindings: "Claim Vessels[Claim Currency]"
            slicer_type: dropdown
            selection: single_required
            default: "GBP"
            display_name: "Claim currency"
            slot: 1
            of: 2
          - id: settlement_currency_slicer
            region: filters
            kind: slicer
            field_bindings: "Claim Settlement Transactions[Settlement Currency]"
            slicer_type: dropdown
            selection: single_required
            default: "GBP"
            display_name: "Settlement currency"
            slot: 2
            of: 2
          - id: kpi_claims
            region: kpis
            kind: cardVisual
            purpose: "How many claims are in scope?"
            field_bindings: "Claim Vessels[Claims]"
            display_name: "Claims"
            color_strategy: measure_match
            slot: 1
            of: 4
          - id: kpi_reopened
            region: kpis
            kind: cardVisual
            purpose: "How many claims were reopened?"
            field_bindings: "Claim Vessels[Reopened Claims]"
            display_name: "Reopened claims"
            color_strategy: measure_match
            slot: 2
            of: 4
          - id: kpi_ga
            region: kpis
            kind: cardVisual
            purpose: "How many claims had General Average declared?"
            field_bindings: "Claim Vessels[GA Declared]"
            display_name: "GA declared"
            color_strategy: measure_match
            slot: 3
            of: 4
          - id: kpi_lag
            region: kpis
            kind: cardVisual
            purpose: "What is the average time between loss and notification?"
            field_bindings: "Claim Vessels[Average Claim Reporting Lag (Days)]"
            display_name: "Avg reporting lag (days)"
            color_strategy: measure_match
            slot: 4
            of: 4
          - id: incurred_by_vessel_type
            region: by_vessel
            kind: barChart
            purpose: "Which vessel types drive incurred?"
            field_bindings: { Category: "Vessel[Vessel Type]", Y: "Claim Vessels[Total Incurred]" }
            title: "Incurred by vessel type"
            sort_policy: value_desc
            color_strategy: measure_match
            data_labels: on
          - id: incurred_by_flag_state
            region: by_flag
            kind: barChart
            purpose: "Which flag states drive incurred?"
            field_bindings: { Category: "Policy[Flag State Country Code]", Y: "Claim Vessels[Total Incurred]" }
            title: "Incurred by flag state"
            sort_policy: value_desc
            color_strategy: measure_match
            data_labels: on
          - id: settlements_by_quarter
            region: settlements_qtr
            kind: columnChart
            purpose: "What is the quarterly settlement trend?"
            field_bindings:
              Category: "Date[Year]"
              Y: "Claim Settlement Transactions[Total Settlements]"
              Series: "Date[Quarter]"
            title: "Settlements by year and quarter"
            axis: { x_type: categorical, x_title: "Transaction year", y_title: none, display_units: auto }
            sort_policy: category_asc
            color_strategy: palette
            legend: top
          - id: lag_by_vessel_type
            region: lag_by_vessel
            kind: barChart
            purpose: "Which vessel types have the longest notification delay?"
            field_bindings: { Category: "Vessel[Vessel Type]", Y: "Claim Vessels[Average Claim Reporting Lag (Days)]" }
            title: "Average reporting lag by vessel type (days)"
            sort_policy: value_desc
            color_strategy: measure_match
            data_labels: on
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: by_vessel, pct_of_content: 23 }
          balance_rationale: "A 2-row KPI strip, then two balanced rows: risk breakdown (5 rows, 6 cols each) and trend + lag (4 rows, 6 cols each). No dead bands."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Filter between all charts and the table within each page; slicers filter the whole page."
  accessibility:
    alt_text_strategy: "headline+trend: each alt text states what the chart shows and the leading item."
    contrast_notes: "Slate #334155 on white 10.4:1; cyan #0891B2 used for graphics only (3.7:1 on white); text never cyan on grey."
  theme:
    base: "references/design/assets/base.json adapted to Corporate Cool"
    user_overrides: "none (greenfield)"
```

## Implementation notes
- Model changes: none (read-only). Eight report-level measures go in the report file.
- PBIR/report authoring: scaffold with `powerbi-report-author scaffold`, bind with byConnection to Marine_Gold_Model, author the theme, pages, visuals and filters, then run `validate`.
- Not available: Net claim cost (KPI-NET-CLAIM-COST) is blocked in the model. Total Incurred by vessel type is shown as the closest available substitute.
- Validation: `powerbi-report-author validate`, then open in Power BI Desktop, screenshot, review and fix.
- Publishing boundary: not published. Publishing is a separate approval.

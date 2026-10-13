# Report Spec: Marine Claims Overview

## Report identity
- Report name: Marine Claims Overview
- Semantic model: Marine_Gold_Model (DataSonic 3)
- Audience: Managers / leadership
- Primary purpose: in about 10 seconds, see how big the claims book is, what's still outstanding, and where it's concentrated (product, cause of loss, broker)
- Delivery target: **Local PBIP only**, live-connected to the Fabric model. Nothing is published to Fabric in this build.

## Semantic model binding
- Entry mode:          Live Connected Model
- Workspace name:      DataSonic 3
- Workspace ID:        1296a62d-7e36-4481-a586-686e8d4b0ccc
- Model name:          Marine_Gold_Model
- Model ID:            dcd787e0-dd7d-47fd-bb3d-af3669727011
- connectionString:    Data Source=powerbi://api.powerbi.com/v1.0/myorg/DataSonic 3;Initial Catalog=Marine_Gold_Model;Integrated Security=ClaimsToken;semanticModelId=dcd787e0-dd7d-47fd-bb3d-af3669727011

## User decisions and constraints
- Scope: one landing page for the first build. Broker drill-down and a portfolio/premium page are deferred.
- Page count: 1
- Interactivity: no navigation (single page). Three slicers: Currency (single-select, required), Loss year and Product. Charts cross-filter each other.
- Design direction: clean corporate ("Corporate Cool": cool grey surface, slate text, one cyan accent)
- Publishing: none. The report stays local.
- Tooling: `powerbi-report-author` CLI 0.4.0; Power BI Desktop (Microsoft Store); Node 24
- Model edit permissions: **none**. The model is read-only. The report adds two **report-level measures** (stored in the report file, not the model).
- Accessibility: WCAG AA contrast, alt text on every chart, human-readable labels
- Data caveats:
  - Money never totals across currencies. The Currency slicer is single-select with GBP as the default, so every amount on the page is in one currency.
  - 20 claims have loss dates in 2027 (in the future). They are **excluded by a page filter (Loss year ≤ 2026)**, and the page subtitle says so.
  - The data looks like test data (incurred is about 40× premium).

## Narrative
- Core story: Hull & Machinery carries the largest share of outstanding claims, and payments have barely started on losses since 2024.
- Audience promise: book size, what's still owed, and where it sits, on one screen
- Key questions answered:
  1. How many claims, and how many are open?
  2. What's incurred vs paid vs outstanding, and what's the payment ratio?
  3. How has that moved by loss year?
  4. Which products hold the outstanding?
  5. Which causes of loss drive incurred?
  6. Which brokers have the most outstanding?

## Design identity
- Tone: Corporate Cool (cool grey `#F1F5F9` surface, slate text `#334155`, cyan accent, Segoe UI)
- Signature: cyan marks **Outstanding** everywhere it appears (KPI accent, trend line, ranked bars, table data bar). Everything else is slate.

## Page plan
1. Hull & Machinery carries the largest share of outstanding claims
   - Archetype: Executive Summary
   - Layout variant: B (KPI strip). Six KPIs of similar weight and no single hero metric.
   - Purpose: headline position of the claims book and where outstanding sits
   - Visuals:
     - 6 KPI cards: Claims, Open claims, Total Incurred, Total Paid, Total Outstanding, Payment ratio
     - line chart: Incurred / Paid / Outstanding by loss year
     - ranked bar: Outstanding by product
     - ranked bar: Incurred by cause of loss
     - table: top brokers by outstanding
   - Fields/measures: listed in the YAML below
   - Slicers/interactions: Currency (single, default GBP), Loss year (dropdown, multi), Product (dropdown, multi)

## Design system summary
- Theme: `base.json` adapted to Corporate Cool. Page `#F1F5F9`, cards white with 1px `#E2E8F0` border, 8px radius.
- Colour semantics:
  - Outstanding = cyan `#0891B2`
  - Incurred = slate-800 `#1E293B`
  - Paid = slate-500 `#64748B`
  - Counts and ratio = slate-700 `#334155`
- Typography: Segoe UI Semibold 24pt title, Segoe UI 11pt body, 28pt card values
- Layout: FHD 1920×1080, 12×12 grid, 32px margin, 24px gutter, 8px snap
- Accessibility: all text pairs at least 4.5:1; chart colours at least 3:1 against white; alt text on every visual

## Model requirements
- Existing measures: `[Total Incurred]`, `[Total Paid]`, `[Total Outstanding]`, `[Claim Payment Ratio (%)]`
- New **report-level** measures (in the report file only, not the model):
  - `Claims` = `DISTINCTCOUNT('Claim Vessels'[Claim Number])`. The model's `[# Claims]` sits on the Claim dimension, so it doesn't respond to the currency or product filters.
  - `Open Claims` = `CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Open Claim] = TRUE())`, for the same reason.
- New calculated columns: none
- Relationship/sort requirements: none. Loss year uses the active Loss Date relationship.

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "Corporate Cool: cool grey #F1F5F9 surface, white cards with 1px #E2E8F0 border and 8px radius, slate #334155 type, Segoe UI throughout, solid low-opacity #E2E8F0 gridlines"
    signature: "Cyan #0891B2 marks Outstanding everywhere (KPI accent, trend line, ranked bars, table data bar); all other measures are slate"
  archetype: Executive
  navigation_model: none
  color_map:
    - measure: "Claim Vessels[Total Outstanding]"
      color: "#0891B2"
      tint: "#CFFAFE"
    - measure: "Claim Vessels[Total Incurred]"
      color: "#1E293B"
      tint: "#E2E8F0"
    - measure: "Claim Vessels[Total Paid]"
      color: "#64748B"
      tint: "#F1F5F9"
    - measure: "Claim Vessels[Claim Payment Ratio (%)]"
      color: "#334155"
      tint: "#E2E8F0"
    - measure: "Claim Vessels[Claims]"
      color: "#334155"
      tint: "#E2E8F0"
    - measure: "Claim Vessels[Open Claims]"
      color: "#334155"
      tint: "#E2E8F0"
  report_measures:
    - table: "Claim Vessels"
      name: "Claims"
      expression: "DISTINCTCOUNT('Claim Vessels'[Claim Number])"
      format: "#,##0"
    - table: "Claim Vessels"
      name: "Open Claims"
      expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Open Claim] = TRUE())"
      format: "#,##0"
  page_filters:
    - field: "Date[Year]"
      condition: "<= 2026"
      reason: "20 claims have future (2027) loss dates; excluded and disclosed in the subtitle"
  pages:
    - name: "Hull & Machinery carries the largest share of outstanding claims"
      role: landing
      archetype: Executive
      layout_variant: B
      variant_rationale: "Six KPIs of comparable weight (volume, open, incurred, paid, outstanding, payment ratio) and no single hero metric; the model has no prior-period or target measures, so the KPI strip plus two analysis rows carries the story."
      navigation: []
      page_background: "#F1F5F9"
      layout_summary: "Title + 3 inline slicers; 6-card KPI strip; trend (left) and ranked outstanding by product (right); ranked incurred by cause (left) and top-broker table (right)."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:   [1, 1, 9, 2]
            filters:  [9, 1, 13, 2]
            kpis:     [1, 2, 13, 4]
            trend:    [1, 4, 7, 9]
            products: [7, 4, 13, 9]
            causes:   [1, 9, 7, 13]
            brokers:  [7, 9, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "Hull & Machinery carries the largest share of outstanding claims"
            subtitle: "Marine claims · amounts in the selected currency (no FX) · loss years up to 2026 (20 claims with future loss dates excluded)"
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
          - id: year_slicer
            region: filters
            kind: slicer
            field_bindings: "Date[Year]"
            slicer_type: dropdown
            display_name: "Loss year"
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
            of: 6
          - id: kpi_open
            region: kpis
            kind: cardVisual
            purpose: "How many claims are still open?"
            field_bindings: "Claim Vessels[Open Claims]"
            display_name: "Open claims"
            color_strategy: measure_match
            slot: 2
            of: 6
          - id: kpi_incurred
            region: kpis
            kind: cardVisual
            purpose: "What is the total incurred?"
            field_bindings: "Claim Vessels[Total Incurred]"
            display_name: "Incurred"
            display_units: auto
            color_strategy: measure_match
            slot: 3
            of: 6
          - id: kpi_paid
            region: kpis
            kind: cardVisual
            purpose: "How much has been paid?"
            field_bindings: "Claim Vessels[Total Paid]"
            display_name: "Paid"
            display_units: auto
            color_strategy: measure_match
            slot: 4
            of: 6
          - id: kpi_outstanding
            region: kpis
            kind: cardVisual
            purpose: "How much is still outstanding (reserve)?"
            field_bindings: "Claim Vessels[Total Outstanding]"
            display_name: "Outstanding"
            display_units: auto
            color_strategy: measure_match
            signature_accent: true
            slot: 5
            of: 6
          - id: kpi_payment_ratio
            region: kpis
            kind: cardVisual
            purpose: "What share of incurred has been paid?"
            field_bindings: "Claim Vessels[Claim Payment Ratio (%)]"
            display_name: "Payment ratio"
            format: "0.0%"
            color_strategy: measure_match
            slot: 6
            of: 6
          - id: trend_by_loss_year
            region: trend
            kind: lineChart
            purpose: "How have incurred, paid and outstanding moved by loss year?"
            field_bindings:
              Category: "Date[Year]"
              Y: ["Claim Vessels[Total Incurred]", "Claim Vessels[Total Paid]", "Claim Vessels[Total Outstanding]"]
            title: "Incurred, paid and outstanding by loss year"
            axis: { x_type: categorical, x_title: "Loss year", y_title: none, display_units: auto }
            sort_policy: category_asc
            color_strategy: measure_match
            legend: top
          - id: outstanding_by_product
            region: products
            kind: barChart
            purpose: "Which products hold the outstanding?"
            field_bindings: { Category: "Policy[Product]", Y: "Claim Vessels[Total Outstanding]" }
            title: "Outstanding by product"
            sort_policy: value_desc
            color_strategy: measure_match
            data_labels: on
          - id: incurred_by_cause
            region: causes
            kind: barChart
            purpose: "Which causes of loss drive incurred?"
            field_bindings: { Category: "Claim[Cause of Loss]", Y: "Claim Vessels[Total Incurred]" }
            title: "Incurred by cause of loss"
            sort_policy: value_desc
            color_strategy: measure_match
            data_labels: on
          - id: top_brokers
            region: brokers
            kind: tableEx
            purpose: "Which brokers carry the most outstanding?"
            field_bindings: ["Broker[Broker Name]", "Claim Vessels[Claims]", "Claim Vessels[Total Incurred]", "Claim Vessels[Total Outstanding]", "Claim Vessels[Claim Payment Ratio (%)]"]
            display_names: ["Broker", "Claims", "Incurred", "Outstanding", "Payment ratio"]
            title: "Top 10 brokers by outstanding"
            top_n: { field: "Broker[Broker Name]", n: 10, by: "Claim Vessels[Total Outstanding]" }
            sort_policy: value_desc
            color_strategy: measure_match
            conditional_formatting: "data bar on Outstanding in #0891B2"
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: trend, pct_of_content: 23 }
          balance_rationale: "A 2-row KPI strip, then two balanced analysis rows (5 rows and 4 rows, 6 columns each). No region exceeds 23% of content, so every chart and the table stay readable; no dead bands."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Filter between all charts and the table; slicers filter the whole page."
  accessibility:
    alt_text_strategy: "headline+trend: each alt text states what the chart shows and the leading item, e.g. 'Bar chart of outstanding by product; Hull & Machinery is largest.'"
    contrast_notes: "Slate #334155 on white 10.4:1; cyan #0891B2 used for graphics only (3.7:1 on white); text never cyan on grey."
  theme:
    base: "references/design/assets/base.json adapted to Corporate Cool"
    user_overrides: "none (greenfield)"
```

## Implementation notes
- Model changes: none (read-only). Two report-level measures go in the report file.
- PBIR/report authoring: scaffold with `powerbi-report-author scaffold`, bind with byConnection to Marine_Gold_Model, author the theme, page, visuals and filters, then run `validate`.
- Validation: `powerbi-report-author validate`, then open in Power BI Desktop, screenshot, review and fix.
- Desktop screenshot verification: Desktop preview host, if the CLI can drive the Microsoft Store Desktop; otherwise you open it and confirm.
- Publishing boundary: not published. Publishing (to a test workspace only) is a separate approval.
- Risks: the Store edition of Desktop may not support preview automation. The currency default selection and the Top-10 table filter need Desktop checking.

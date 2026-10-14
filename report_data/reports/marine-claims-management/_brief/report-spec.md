# Report Spec: Marine Claims Management

## Report identity
- Report name: Marine Claims Management
- Semantic model: Marine_Gold_Model (DataSonic 3)
- Audience: Marine claims management team
- Primary purpose: monitor claims health (volume, open/reopened, money, payment and reporting speed) and see where OS reserve sits by vessel type, product and broker
- Delivery target: **Local PBIP only**, live-connected to the Fabric model. Nothing is published.

## Semantic model binding
- Entry mode:          Live Connected Model
- Workspace name:      DataSonic 3
- Workspace ID:        1296a62d-7e36-4481-a586-686e8d4b0ccc
- Model name:          Marine_Gold_Model
- Model ID:            dcd787e0-dd7d-47fd-bb3d-af3669727011
- connectionString:    Data Source=powerbi://api.powerbi.com/v1.0/myorg/DataSonic 3;Initial Catalog=Marine_Gold_Model;Integrated Security=ClaimsToken;semanticModelId=dcd787e0-dd7d-47fd-bb3d-af3669727011

## User decisions and constraints
- Page count: 2 (Claims health; Vessel and product exposure)
- Interactivity: page tabs. On each page: Currency (single-select, default GBP, required by the money rule), Loss year and Product dropdown slicers. Charts cross-filter each other.
- Design direction: clean corporate (Corporate Cool)
- Publishing: none
- Model edit permissions: none. Eight report-level measures live in the report file.
- Accessibility: WCAG AA contrast, alt text on every chart
- Data caveats:
  - **OS reserve = Total Outstanding** (unconfirmed ontology default MAR2-09b). Shown in the subtitles.
  - Money never totals across currencies (single-select Currency slicer, default GBP).
  - Loss dates in 2027 exist. They're excluded by a page filter `Date[Year] <= 2026`.
  - **Reopened claims (439) are more than open claims (386)** because the flag marks any claim that was ever reopened, including ones now closed.
  - **Quarterly trend** is dated by *notification* date with the years fixed to 2024 and 2025, so the Loss year slicer doesn't change it. Currency and Product do.
  - **General average** = claims with `General Average Declared` = TRUE (280 in GBP). That's not the same as Claim Type = GENERAL_AVERAGE (191).
  - 2026 is a partial loss year (16 GA claims so far).
  - Vessel type has a blank group (≈93m OS) and an odd "Solar Array" value (0.3m). Both are shown as they are.
  - Payment ratio by claim type (43–50%) and lag by cause (20–25 days) vary only a little. The charts show that the spread is narrow.
  - The "top brokers" table is sorted by OS reserve, not cut to a Top N, because the model blocks TopN on a measure.

## Narrative
- Page 1 core story: 386 claims are still open, holding £24.0bn in OS reserve against £44.5bn incurred and £10.0bn paid. Notifications peaked in Q3 2025 (87).
- Page 2 core story: Hull & Machinery (£7.9bn) and container ships (£6.9bn) carry the largest OS reserve. The largest broker holds only £0.4bn, so reserve is spread thinly across brokers.

## Page plan
1. **Claims health**: "386 claims are still open, holding £24.0bn in OS reserve"
   - Archetype: Executive Summary, layout variant B (KPI strip)
   - Visuals: 6-value KPI card (Claims, Open, Reopened, Incurred, Paid, OS reserve); line chart of claims notified per quarter (2024 vs 2025); bar chart of payment ratio by claim type; bar chart of average reporting lag by cause of loss
2. **Vessel and product exposure**: "Hull & Machinery and container ships carry the largest OS reserve"
   - Archetype: Analytical breakdown
   - Visuals: clustered bar of OS reserve and incurred by vessel type; the same by product; broker table (claims, OS reserve (m), incurred (m), payment ratio, sorted by OS reserve); column chart of GA claims by loss year

## Design system summary
- Corporate Cool: page `#F1F5F9`, white cards with a 1px `#E2E8F0` border, slate `#334155` text, Segoe UI
- Colours: OS reserve = cyan `#0891B2` everywhere; Incurred = `#1E293B`; Paid = `#64748B`; 2024 = `#94A3B8` and 2025 = `#1E293B` on the trend; counts and ratios = slate
- Layout: 1920×1080, 12×12 grid, 32px margin, 24px gutter

## Model requirements
- Existing measures: `[Total Incurred]`, `[Total Paid]`, `[Total Outstanding]`, `[Claim Payment Ratio (%)]`, `[Average Claim Reporting Lag (Days)]`
- Report-level measures (the fact-based counts respond to the Currency and Product slicers):
  - `Claims` = `DISTINCTCOUNT('Claim Vessels'[Claim Number])`
  - `Open Claims`, `Reopened Claims`, `GA Claims` = the same, filtered on `Claim[Is Open Claim]`, `Claim[Is Reopened Claim]` and `Claim[General Average Declared]` = TRUE
  - `Notified 2024`, `Notified 2025` = Claims with `USERELATIONSHIP('Claim Vessels'[Notification Date Key], 'Date'[Date Key])` and `'Date'[Year]` fixed
  - `Incurred (m)`, `OS Reserve (m)` = `DIVIDE(<measure>, 1000000)`, format `#,##0.0`
- Calculated columns and relationship changes: none

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "Corporate Cool: cool grey #F1F5F9 surface, white cards with 1px #E2E8F0 border and 8px radius, slate #334155 type, Segoe UI"
    signature: "Cyan #0891B2 marks OS reserve (Outstanding) everywhere; everything else is slate"
  archetype: Executive
  navigation_model: page_tabs
  color_map:
    - {measure: "Claim Vessels[Total Outstanding]", color: "#0891B2", tint: "#CFFAFE"}
    - {measure: "Claim Vessels[OS Reserve (m)]", color: "#0891B2", tint: "#CFFAFE"}
    - {measure: "Claim Vessels[Total Incurred]", color: "#1E293B", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Incurred (m)]", color: "#1E293B", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Total Paid]", color: "#64748B", tint: "#F1F5F9"}
    - {measure: "Claim Vessels[Notified 2024]", color: "#94A3B8", tint: "#F1F5F9"}
    - {measure: "Claim Vessels[Notified 2025]", color: "#1E293B", tint: "#E2E8F0"}
  report_measures:
    - {table: "Claim Vessels", name: "Claims", expression: "DISTINCTCOUNT('Claim Vessels'[Claim Number])", format: "#,##0"}
    - {table: "Claim Vessels", name: "Open Claims", expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Open Claim] = TRUE())", format: "#,##0"}
    - {table: "Claim Vessels", name: "Reopened Claims", expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Reopened Claim] = TRUE())", format: "#,##0"}
    - {table: "Claim Vessels", name: "GA Claims", expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[General Average Declared] = TRUE())", format: "#,##0"}
    - {table: "Claim Vessels", name: "Notified 2024", expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), USERELATIONSHIP('Claim Vessels'[Notification Date Key], 'Date'[Date Key]), 'Date'[Year] = 2024)", format: "#,##0"}
    - {table: "Claim Vessels", name: "Notified 2025", expression: "CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), USERELATIONSHIP('Claim Vessels'[Notification Date Key], 'Date'[Date Key]), 'Date'[Year] = 2025)", format: "#,##0"}
    - {table: "Claim Vessels", name: "Incurred (m)", expression: "DIVIDE([Total Incurred], 1000000)", format: "#,##0.0"}
    - {table: "Claim Vessels", name: "OS Reserve (m)", expression: "DIVIDE([Total Outstanding], 1000000)", format: "#,##0.0"}
  page_filters:
    - field: "Date[Year]"
      condition: "<= 2026"
      reason: "Future (2027) loss dates excluded on both pages; disclosed in subtitles"
  pages:
    - name: "Claims health"
      role: landing
      archetype: Executive
      layout_variant: B
      variant_rationale: "Six comparable KPIs and no hero metric; a full-width trend, then two ranked breakdowns."
      navigation: ["Vessel and product exposure"]
      page_background: "#F1F5F9"
      layout_summary: "Title + 3 slicers; 6-value KPI strip; full-width quarterly notification trend; payment ratio by claim type (left) and reporting lag by cause (right)."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:  [1, 1, 9, 2]
            filters: [9, 1, 13, 2]
            kpis:    [1, 2, 13, 4]
            trend:   [1, 4, 13, 8]
            types:   [1, 8, 7, 13]
            causes:  [7, 8, 13, 13]
        placements:
          - {id: page_title, region: header, kind: textbox, text: "386 claims are still open, holding £24.0bn in OS reserve", subtitle: "Marine claims · amounts in the selected currency (no FX) · loss years up to 2026 (future-dated losses excluded) · OS reserve = Outstanding"}
          - {id: currency_slicer, region: filters, kind: slicer, field_bindings: "Claim Vessels[Claim Currency]", slicer_type: dropdown, selection: single_required, default: "GBP", display_name: "Currency", slot: 1, of: 3}
          - {id: year_slicer, region: filters, kind: slicer, field_bindings: "Date[Year]", slicer_type: dropdown, display_name: "Loss year", slot: 2, of: 3}
          - {id: product_slicer, region: filters, kind: slicer, field_bindings: "Policy[Product]", slicer_type: dropdown, display_name: "Product", slot: 3, of: 3}
          - id: kpis
            region: kpis
            kind: cardVisual
            purpose: "Book size, open and reopened volume, and incurred / paid / OS reserve"
            field_bindings: ["Claim Vessels[Claims]", "Claim Vessels[Open Claims]", "Claim Vessels[Reopened Claims]", "Claim Vessels[Total Incurred]", "Claim Vessels[Total Paid]", "Claim Vessels[Total Outstanding]"]
            display_names: ["Claims", "Open claims", "Reopened claims", "Incurred", "Paid", "OS reserve"]
            signature_accent: "Claim Vessels[Total Outstanding]"
          - id: notified
            region: trend
            kind: lineChart
            purpose: "How many claims were notified each quarter in 2024 vs 2025?"
            field_bindings: { Category: "Date[Quarter]", Y: ["Claim Vessels[Notified 2024]", "Claim Vessels[Notified 2025]"] }
            title: "Claims notified per quarter, 2024 vs 2025 (by notification date)"
            sort_policy: category_asc
            legend: top
          - id: types
            region: types
            kind: barChart
            purpose: "Which claim types are paid out fastest?"
            field_bindings: { Category: "Claim[Claim Type]", Y: "Claim Vessels[Claim Payment Ratio (%)]" }
            title: "Payment ratio by claim type"
            sort_policy: value_desc
            data_labels: on
          - id: causes
            region: causes
            kind: barChart
            purpose: "Which causes of loss are reported slowest?"
            field_bindings: { Category: "Claim[Cause of Loss]", Y: "Claim Vessels[Average Claim Reporting Lag (Days)]" }
            title: "Average reporting lag (days) by cause of loss"
            sort_policy: value_desc
            data_labels: on
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: trend, pct_of_content: 36 }
          balance_rationale: "KPI strip (2 rows), a 4-row full-width trend (8 points across 2 series needs width), and a 5-row pair of ranked bars (6 and 12 categories). No dead bands."
    - name: "Vessel and product exposure"
      role: detail
      archetype: Analytical
      layout_variant: A
      variant_rationale: "Four breakdowns of equal weight in a 2×2; no KPI strip, because the headline figures are on page 1."
      navigation: ["Claims health"]
      page_background: "#F1F5F9"
      layout_summary: "Title + 3 slicers; OS reserve/incurred by vessel type (left) and by product (right); broker table (left, wider) and GA claims by loss year (right)."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:   [1, 1, 9, 2]
            filters:  [9, 1, 13, 2]
            vessels:  [1, 2, 7, 7]
            products: [7, 2, 13, 7]
            brokers:  [1, 7, 8, 13]
            ga:       [8, 7, 13, 13]
        placements:
          - {id: page_title, region: header, kind: textbox, text: "Hull & Machinery and container ships carry the largest OS reserve", subtitle: "Marine claims · amounts in millions of the selected currency (no FX) · loss years up to 2026 · OS reserve = Outstanding"}
          - {id: currency_slicer, region: filters, kind: slicer, field_bindings: "Claim Vessels[Claim Currency]", slicer_type: dropdown, selection: single_required, default: "GBP", display_name: "Currency", slot: 1, of: 3}
          - {id: year_slicer, region: filters, kind: slicer, field_bindings: "Date[Year]", slicer_type: dropdown, display_name: "Loss year", slot: 2, of: 3}
          - {id: product_slicer, region: filters, kind: slicer, field_bindings: "Policy[Product]", slicer_type: dropdown, display_name: "Product", slot: 3, of: 3}
          - id: vessels
            region: vessels
            kind: clusteredBarChart
            purpose: "Which vessel types hold the OS reserve and incurred?"
            field_bindings: { Category: "Vessel[Vessel Type]", Y: ["Claim Vessels[OS Reserve (m)]", "Claim Vessels[Incurred (m)]"] }
            title: "OS reserve and incurred by vessel type (m, highest first)"
            sort_policy: value_desc
          - id: products
            region: products
            kind: clusteredBarChart
            purpose: "Which products hold the OS reserve and incurred?"
            field_bindings: { Category: "Policy[Product]", Y: ["Claim Vessels[OS Reserve (m)]", "Claim Vessels[Incurred (m)]"] }
            title: "OS reserve and incurred by product (m, highest first)"
            sort_policy: value_desc
          - id: brokers
            region: brokers
            kind: pivotTable
            purpose: "Which brokers carry the most OS reserve, and how much has been paid?"
            field_bindings: ["Broker[Broker Name]", "Claim Vessels[Claims]", "Claim Vessels[OS Reserve (m)]", "Claim Vessels[Incurred (m)]", "Claim Vessels[Claim Payment Ratio (%)]"]
            display_names: ["Broker", "Claims", "OS reserve (m)", "Incurred (m)", "Payment ratio"]
            title: "Brokers by OS reserve (highest first)"
            sort_policy: value_desc
          - id: ga
            region: ga
            kind: columnChart
            purpose: "How many general average claims arise per loss year?"
            field_bindings: { Category: "Date[Year]", Y: "Claim Vessels[GA Claims]" }
            title: "General average claims by loss year"
            sort_policy: category_asc
            data_labels: on
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: brokers, pct_of_content: 32 }
          balance_rationale: "Two equal 5-row charts, then a wider broker table (7 cols) beside a GA column chart (5 cols, 7 years). No dead bands."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Charts and table cross-filter; slicers filter their page. Notified 2024/2025 fix the year, so the Loss year slicer doesn't change the trend."
  accessibility:
    alt_text_strategy: "Each alt text says what the chart shows and names the leading item."
    contrast_notes: "Slate #334155 on white 10.4:1; cyan used only for graphics (3.7:1 on white)."
  theme:
    base: "Corporate Cool (generator theme)"
    user_overrides: "none"
```

## Implementation notes
- Build: `python scripts/pbir_build.py reports/marine-claims-management/report.yaml` (scaffold, bind byConnection, theme, measures, pages, validate)
- Check: Power BI Desktop preview with screenshots of both pages, then review and fix
- Publishing: none. A separate approval and a named test workspace would be needed.

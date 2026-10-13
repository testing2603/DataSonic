# Report Spec: Marine Broker and Risk Review

## Report identity
- Report name: Marine Broker and Risk Review
- Semantic model: Marine_Gold_Model (DataSonic 3)
- Audience: broker & risk review meeting (managers)
- Primary purpose: page 1 compares brokers and tests whether broker type, commission or delegated authority changes claims outcomes; page 2 shows where vessel risk sits and how settlements and notification are running
- Delivery target: **Local PBIP only**, live-connected to the Fabric model. Nothing is published.

## Semantic model binding
- Entry mode:          Live Connected Model
- Workspace name:      DataSonic 3
- Workspace ID:        1296a62d-7e36-4481-a586-686e8d4b0ccc
- Model name:          Marine_Gold_Model
- Model ID:            dcd787e0-dd7d-47fd-bb3d-af3669727011
- connectionString:    Data Source=powerbi://api.powerbi.com/v1.0/myorg/DataSonic 3;Initial Catalog=Marine_Gold_Model;Integrated Security=ClaimsToken;semanticModelId=dcd787e0-dd7d-47fd-bb3d-af3669727011

## User decisions and constraints
- Page count: 2 (Broker performance; Vessel risk & settlements)
- Interactivity:
  - Page 1: Currency (single, default GBP), Broker type and Product slicers.
  - Page 2: Claim currency and Settlement currency slicers (both single, default GBP), because claims and settlements are separate facts with their own currency column.
- Design direction: Corporate Cool (default). Publishing: none. Model edits: none (report-level measures only).
- **Not available: net claim cost.** It's blocked in the model (KPI-NET-CLAIM-COST), and the ontology offers no approved substitute, so it isn't on the page. The subtitle says so.
- Unconfirmed ontology defaults: OS reserve = Total Outstanding; "settlements paid" = Total Settlements (by last transaction date).
- Data caveats:
  - Loss years after 2026 are excluded by a page filter. On page 2 the same filter drops settlements dated after 2026 (future-dated transactions run to 2028).
  - Commission % runs from 0.5% to 10%. Bands: under 3.5%, 3.5–7%, 7% and over (roughly thirds of brokers).
  - Brokers are spread thin: 779 brokers have GBP claims, most with 1–9 claims, so the top-broker list is driven by a few large losses.
  - Vessel type comes from claims. 13 claims have no type (excluded from the vessel table); one "Solar Array" claim is shown as recorded.
  - The data looks synthetic.

## Narrative (at default filters: GBP, loss years ≤ 2026)
- Page 1: payment ratio is 46–48% for every broker type. Coverholders **with delegated authority** have paid only **29%** of incurred, against 54% for coverholders without it. Commission band shows no consistent pattern.
- Page 2: container ships carry the most incurred (£12.9bn, 408 claims). 439 of 1,620 claims (27%) were reopened and 280 had General Average declared. Claims take 22.8 days to notify on average (max 45). Settlements have run at roughly £0.6–1.3bn a quarter since mid-2023.

## Design identity
- Tone: Corporate Cool (cool grey `#F1F5F9` surface, white cards, slate `#334155` text, Segoe UI)
- Signature: cyan `#0891B2` marks the "delegated authority" and "reopened" series, the things the meeting should look at. Comparison series are slate shades.

## Model requirements
- Existing measures: `[Total Incurred]`, `[Total Outstanding]`, `[Claim Payment Ratio (%)]`, `[Average Claim Reporting Lag (Days)]`, `[Total Settlements]`
- Report-level measures (report file only): see `report.yaml`. They are:
  - Claims, Brokers with Claims, Reopened Claims, GA Declared Claims (fact-based counts)
  - Incurred (m), OS Reserve (m), Reporting Lag (days)
  - Payment ratio for DA / non-DA brokers and for the three commission bands
  - Broker attribute measures for the table: FCA Number, Onboarded (formatted "dd mmm yyyy", because the model stores a timestamp), Type, Commission, Delegated Authority. Each is blank when the broker has no claims in context, so the table lists only brokers with claims.
- New calculated columns / relationships: none

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "Corporate Cool: cool grey #F1F5F9 surface, white cards with 1px #E2E8F0 border and 8px radius, slate #334155 type, Segoe UI"
    signature: "Cyan #0891B2 marks the series to watch (delegated authority, reopened); comparison series are slate shades"
  archetype: Executive
  navigation_model: tabs
  color_map:
    - {measure: "Claim Vessels[Payment Ratio DA]", color: "#0891B2", tint: "#CFFAFE"}
    - {measure: "Claim Vessels[Payment Ratio Non-DA]", color: "#94A3B8", tint: "#F1F5F9"}
    - {measure: "Claim Vessels[Payment Ratio Low Commission]", color: "#CBD5E1", tint: "#F1F5F9"}
    - {measure: "Claim Vessels[Payment Ratio Mid Commission]", color: "#64748B", tint: "#F1F5F9"}
    - {measure: "Claim Vessels[Payment Ratio High Commission]", color: "#1E293B", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Reopened Claims]", color: "#0891B2", tint: "#CFFAFE"}
    - {measure: "Claim Vessels[GA Declared Claims]", color: "#1E293B", tint: "#E2E8F0"}
    - {measure: "Claim Vessels[Total Incurred]", color: "#1E293B", tint: "#E2E8F0"}
  report_measures: "see report.yaml (17 measures, report file only)"
  page_filters:
    - {field: "Date[Year]", condition: "<= 2026", reason: "future-dated losses and settlements; disclosed in subtitles"}
  pages:
    - name: "Broker performance"
      role: landing
      archetype: Executive
      layout_variant: B
      variant_rationale: "Five KPIs, two segment comparisons that answer 'does it make a difference?', then a full-width broker list."
      page_background: "#F1F5F9"
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:     [1, 1, 9, 2]
            filters:    [9, 1, 13, 2]
            kpis:       [1, 2, 13, 4]
            da:         [1, 4, 7, 8]
            commission: [7, 4, 13, 8]
            brokers:    [1, 8, 13, 13]
        placements:
          - {id: page_title, region: header, kind: textbox}
          - {id: currency_slicer, region: filters, kind: slicer, field_bindings: "Claim Vessels[Claim Currency]", selection: single_required, default: "GBP", slot: 1, of: 3}
          - {id: broker_type_slicer, region: filters, kind: slicer, field_bindings: "Broker[Broker Type]", slot: 2, of: 3}
          - {id: product_slicer, region: filters, kind: slicer, field_bindings: "Policy[Product]", slot: 3, of: 3}
          - {id: kpis, region: kpis, kind: cardVisual, field_bindings: ["Claim Vessels[Brokers with Claims]", "Claim Vessels[Claims]", "Claim Vessels[Total Incurred]", "Claim Vessels[Total Outstanding]", "Claim Vessels[Claim Payment Ratio (%)]"]}
          - {id: pr_by_type_da, region: da, kind: clusteredColumnChart, field_bindings: {Category: "Broker[Broker Type]", Y: ["Claim Vessels[Payment Ratio DA]", "Claim Vessels[Payment Ratio Non-DA]"]}, sort_policy: category_asc}
          - {id: pr_by_type_commission, region: commission, kind: clusteredColumnChart, field_bindings: {Category: "Broker[Broker Type]", Y: ["Claim Vessels[Payment Ratio Low Commission]", "Claim Vessels[Payment Ratio Mid Commission]", "Claim Vessels[Payment Ratio High Commission]"]}, sort_policy: category_asc}
          - {id: brokers, region: brokers, kind: pivotTable, field_bindings: ["Broker[Broker Name]", "FCA Number", "Onboarded", "Broker Type Label", "Commission", "Delegated Authority Label", "Claims", "Incurred (m)", "OS Reserve (m)", "Claim Payment Ratio (%)"], sort_policy: "Incurred (m) desc"}
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: brokers, pct_of_content: 45 }
          balance_rationale: "The broker list is the main deliverable (10 columns), so it gets the full width and 5 rows; the two comparison charts share the row above it."
    - name: "Vessel risk & settlements"
      role: detail
      archetype: Executive
      layout_variant: B
      variant_rationale: "Six KPIs (counts, money, lag), then vessel type and flag state views, then settlements over time and reopened/GA by flag."
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
            vessels:       [1, 4, 7, 9]
            flag_incurred: [7, 4, 13, 9]
            settlements:   [1, 9, 7, 13]
            flag_claims:   [7, 9, 13, 13]
        placements:
          - {id: page_title, region: header, kind: textbox}
          - {id: claim_currency_slicer, region: filters, kind: slicer, field_bindings: "Claim Vessels[Claim Currency]", selection: single_required, default: "GBP", slot: 1, of: 2}
          - {id: settlement_currency_slicer, region: filters, kind: slicer, field_bindings: "Claim Settlement Transactions[Settlement Currency]", selection: single_required, default: "GBP", slot: 2, of: 2}
          - {id: kpis, region: kpis, kind: cardVisual, field_bindings: ["Claims", "Reopened Claims", "GA Declared Claims", "Total Incurred", "Total Settlements", "Reporting Lag (days)"]}
          - {id: vessels, region: vessels, kind: pivotTable, field_bindings: ["Vessel[Vessel Type]", "Claims", "Incurred (m)", "Reopened Claims", "GA Declared Claims", "Reporting Lag (days)"], sort_policy: "Incurred (m) desc", visual_filter: "Vessel Type not blank"}
          - {id: flag_incurred, region: flag_incurred, kind: columnChart, field_bindings: {Category: "Policy[Flag State Country Code]", Y: "Claim Vessels[Total Incurred]"}, sort_policy: value_desc}
          - {id: settlements, region: settlements, kind: clusteredColumnChart, field_bindings: {Category: "Date[Quarter]", Series: "Date[Year]", Y: "Claim Settlement Transactions[Total Settlements]"}, sort_policy: category_asc, visual_filter: "Date[Year] >= 2023"}
          - {id: flag_claims, region: flag_claims, kind: clusteredColumnChart, field_bindings: {Category: "Policy[Flag State Country Code]", Y: ["Claim Vessels[Reopened Claims]", "Claim Vessels[GA Declared Claims]"]}, sort_policy: "Reopened desc"}
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: vessels, pct_of_content: 23 }
          balance_rationale: "2-row KPI strip, two 6x5 views, two 6x4 views; no dead bands."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Slicers filter their page; visuals cross-filter. Claim and settlement visuals don't filter each other (separate facts)."
  accessibility:
    alt_text_strategy: "Each alt text states what the visual shows and the leading item."
    contrast_notes: "Slate #334155 on white 10.4:1; cyan used for graphics only."
  theme:
    base: "references/design/assets/base.json adapted to Corporate Cool (scripts/pbir_build.py)"
    user_overrides: "none"
```

## Implementation notes
- Build: `python scripts/pbir_build.py reports/marine-broker-risk-review/report.yaml`, validate, then check in Desktop.
- Risks to check in Desktop:
  - Text report measures in the matrix.
  - The `Vessel Type <> ""` filter.
  - The quarter axis shows 1–4, with the year in the legend.
- Publishing boundary: not published.

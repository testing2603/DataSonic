# Report Spec: Premium by Broker

## Report identity
- Report name: Premium by Broker
- Semantic model: Marine_Gold_Model (DataSonic 3)
- Audience: Managers / leadership
- Primary purpose: see which brokers generate the most premium, at a glance
- Delivery target: **Local PBIP only**, live-connected to the Fabric model. Nothing is published.

## Semantic model binding
- Entry mode:          Live Connected Model
- Workspace name:      DataSonic 3
- Workspace ID:        1296a62d-7e36-4481-a586-686e8d4b0ccc
- Model name:          Marine_Gold_Model
- Model ID:            dcd787e0-dd7d-47fd-bb3d-af3669727011
- connectionString:    Data Source=powerbi://api.powerbi.com/v1.0/myorg/DataSonic 3;Initial Catalog=Marine_Gold_Model;Integrated Security=ClaimsToken;semanticModelId=dcd787e0-dd7d-47fd-bb3d-af3669727011

## User decisions and constraints
- Scope: one page showing premium by broker as a bar chart.
- Page count: 1
- Interactivity: Currency slicer (single-select, required for money). Bar chart cross-filters.
- Design direction: Corporate Cool (cool grey surface, slate text, teal accent for Premium)
- Publishing: none. The report stays local.
- Model edit permissions: **none**. One report-level measure added.
- Data caveats:
  - Money never totals across currencies. The Currency slicer is single-select with GBP as the default.
  - Premium is treated as gross written premium (GWP); this is unconfirmed in the ontology.
  - Data queries could not run (token expired), so the insight title is descriptive rather than data-driven.

## Narrative
- Core story: Premium distribution across brokers, showing which intermediaries place the most business.
- Key questions answered:
  1. What is the total premium (in the selected currency)?
  2. How many policies are in scope?
  3. Which brokers generate the most premium?

## Design identity
- Tone: Corporate Cool (cool grey `#F1F5F9` surface, white cards with 1px `#E2E8F0` border and 8px radius, slate `#334155` type, Segoe UI)
- Signature: Teal `#0E7490` marks Premium on the bar chart and KPI accent.

## Page plan
1. Premium by broker (highest first)
   - Archetype: Single chart with KPI context
   - Layout variant: B (KPI strip)
   - Purpose: show premium distribution across brokers
   - Visuals:
     - 2 KPI cards: Total Premium, Policies
     - Ranked bar chart: Premium by Broker Name (sorted highest first)
   - Slicers: Currency (single, default GBP)

## Design system summary
- Theme: Corporate Cool. Page `#F1F5F9`, cards white with 1px `#E2E8F0` border, 8px radius.
- Colour semantics:
  - Premium = teal `#0E7490`
  - Counts = slate-700 `#334155`
- Typography: Segoe UI Semibold 24pt title, Segoe UI 11pt body, 28pt card values
- Layout: FHD 1920x1080, 12x12 grid, 32px margin, 24px gutter, 8px snap
- Accessibility: WCAG AA contrast, alt text on every chart

## Model requirements
- Existing measures: `[Total Premium]`
- New **report-level** measures:
  - `Policies` = `DISTINCTCOUNT('Policy Exposures'[Policy Number])`. The model's `[# Policies]` sits on the Policy dimension and doesn't respond to the currency slicer.
- New calculated columns: none
- Relationship/sort requirements: none.

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "Corporate Cool: cool grey #F1F5F9 surface, white cards with 1px #E2E8F0 border and 8px radius, slate #334155 type, Segoe UI throughout"
    signature: "Teal #0E7490 marks Premium everywhere (KPI accent, bar chart)"
  archetype: Executive
  navigation_model: none
  color_map:
    - measure: "Policy Exposures[Total Premium]"
      color: "#0E7490"
      tint: "#CFFAFE"
    - measure: "Policy Exposures[Policies]"
      color: "#334155"
      tint: "#E2E8F0"
  report_measures:
    - table: "Policy Exposures"
      name: "Policies"
      expression: "DISTINCTCOUNT('Policy Exposures'[Policy Number])"
      format: "#,##0"
  pages:
    - name: "Premium by broker (highest first)"
      role: landing
      archetype: Executive
      layout_variant: B
      variant_rationale: "Two KPIs (total premium and policy count) plus one dominant bar chart."
      navigation: []
      page_background: "#F1F5F9"
      layout_summary: "Title + currency slicer; 2-card KPI strip; full-width bar chart of premium by broker."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:  [1, 1, 10, 2]
            filters: [10, 1, 13, 2]
            kpis:    [1, 2, 13, 4]
            chart:   [1, 4, 13, 13]
          placements:
            - id: page_title
              region: header
              kind: textbox
              text: "Premium by broker (highest first)"
              subtitle: "Marine policies · amounts in the selected currency (no FX) · premium treated as GWP (unconfirmed)"
              purpose: "State the page insight."
            - id: currency_slicer
              region: filters
              kind: slicer
              field_bindings: "Policy Exposures[Currency]"
              slicer_type: dropdown
              selection: single_required
              default: "GBP"
              display_name: "Currency"
              slot: 1
              of: 1
            - id: kpi_premium
              region: kpis
              kind: cardVisual
              purpose: "What is the total premium?"
              field_bindings: "Policy Exposures[Total Premium]"
              display_name: "Total Premium"
              display_units: auto
              color_strategy: measure_match
              signature_accent: true
              slot: 1
              of: 2
            - id: kpi_policies
              region: kpis
              kind: cardVisual
              purpose: "How many policies are in scope?"
              field_bindings: "Policy Exposures[Policies]"
              display_name: "Policies"
              color_strategy: measure_match
              slot: 2
              of: 2
            - id: premium_by_broker
              region: chart
              kind: barChart
              purpose: "Which brokers generate the most premium?"
              field_bindings: { Category: "Broker[Broker Name]", Y: "Policy Exposures[Total Premium]" }
              title: "Premium by broker (highest first)"
              sort_policy: value_desc
              color_strategy: measure_match
              data_labels: on
        space_audit:
          content_cell_count: 144
          placed_cell_count: 144
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: chart, pct_of_content: 75 }
          balance_rationale: "The bar chart is the hero visual at 75% of content area, with a compact KPI strip and header. No dead bands."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Currency slicer filters the whole page."
  accessibility:
    alt_text_strategy: "Bar chart alt text states what is shown and the leading broker."
    contrast_notes: "Slate #334155 on white 10.4:1; teal #0E7490 used for graphics only."
  theme:
    base: "Corporate Cool"
    user_overrides: "none (greenfield)"
```

## Implementation notes
- Model changes: none (read-only). One report-level measure in the report file.
- Validation: `powerbi-report-author validate`, then open in Power BI Desktop.
- Publishing boundary: not published.

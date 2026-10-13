---
name: marine-report
description: Build a Power BI report from a plain-language request about Marine insurance data (claims, policies, brokers, vessels, premium, incurred, outstanding), on the Fabric semantic model Marine_Gold_Model (DataSonic 3). Plans with the ontology, gets the user's approval, generates a live-connected PBIP locally, validates it and checks it in Power BI Desktop. Use when the user asks to create, build, make or design a report, dashboard or page.
---

# Marine report agent (report mode)

A request like *"a broker performance page comparing claims, payment ratio and commission"* becomes a **local** Power BI project, live-connected to Marine_Gold_Model. The model is never changed, and nothing is published unless the user explicitly asks.

Follow Microsoft's `powerbi-authoring:powerbi-report-cli` rules (plan → approve → author → validate → preview → screenshot review). This skill supplies the Marine-specific parts and a generator, so you don't hand-write PBIR JSON.

## 1. Understand the request (ask at most 2 questions)

- Read `report_data/ontology/marine.yaml`: map every business word to terms, measures and columns, and note `unconfirmed` defaults, `ask` terms and `not_available` terms.
- Only ask what you can't infer: audience (default: managers), and anything marked `ask`. Default look: Corporate Cool. Default delivery: local only.
- If the request needs something `not_available` (loss ratio, net claim cost, Lloyd's risk code), say so up front and propose the labelled alternative from the ontology.

## 2. Look at the data (read-only)

Use the `run_dax` tool (MCP `marine-dax`) for 2–5 quick queries: totals, top categories, trend by year. You need them to:
- write an **insight title** that's true for the default filters (e.g. "Hull & Machinery carries the largest share of outstanding claims"), not a label like "Broker dashboard";
- pick sensible charts (don't chart 2 bars or a flat line);
- spot caveats (blank categories, future dates, test-looking values).

## 3. Write the plan and get approval (hard gate)

Create `report_data/reports/<kebab-name>/` with two files:
- `_brief/report-spec.md`: Microsoft's report-spec template, with the canonical `Design Brief:` YAML (`generated_by: powerbi-report-cli`, `contract_version: 1`, one `layout_contract` per page with regions, placements and `space_audit`). See `report_data/reports/marine-claims-overview/_brief/report-spec.md` as the worked example.
- `report.yaml`: the same plan in generator format. The field reference is in the docstring of `server/report_agent/scripts/pbir_build.py`; the worked example is `report_data/reports/marine-claims-overview/report.yaml`.

Then show the user a short summary plus an ASCII layout sketch and ask **one** approval question. **Don't build until they approve.**

### Marine rules the plan must follow

- **Currency.** Every money measure is BLANK unless one currency is in context. Any page with money needs a Currency slicer: `single: true`, `default: GBP`, on the fact's currency column. The columns are `Claim Vessels[Claim Currency]`, `Policy Exposures[Currency]` and `Claim Settlement Transactions[Settlement Currency]`. Don't mix money from two facts on one page unless both are filtered to one currency (use two slicers, or pick one fact per page).
- **Counts respond to slicers only through the fact.** `[# Claims]`, `[# Policies]` and similar sit on dimensions and ignore fact-side slicers. Use report measures instead:
  - `Claims` = `DISTINCTCOUNT('Claim Vessels'[Claim Number])`
  - `Open Claims` = `CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), 'Claim'[Is Open Claim] = TRUE())`
  - `Policies` = `DISTINCTCOUNT('Policy Exposures'[Policy Number])`
- **Dates.** Claims use Loss Date (`Date[Year]` via the active relationship); policies use Insurance Period Start. For other date roles, write report measures with `USERELATIONSHIP`. Loss dates in 2027 exist, so add a page filter `Date[Year] <= 2026` and say so in the subtitle.
- **Readable numbers.**
  - KPI counts: `exact: true`, so they show 1,620 and not 2K.
  - Tables: use report measures in millions (`DIVIDE([Total Incurred], 1000000)`, format `#,##0.0`) labelled "(m)".
  - Ratios come as model measures already formatted as %.
- **No ranking filter by model measure.** TopN filters need a raw column total, which this model blocks. Sort tables and bars by the measure instead, and title them "(highest first)".
- **Layout.** 12×12 grid; row 1 is the header band: title `[1,1,9,2]` and up to 3 dropdown slicers `[9,1,13,2]`. KPI strip 2 rows, charts at least 3×3, tables at least 4 rows. Every region needs a visual (the generator refuses empty regions), with no overlap and no dead bands. Use one multi-value `card` for 2–6 KPIs.
- **Charts.** Ranked bars sort `value_desc`; trends use `line` with `category: Date[Year]` and `sort: category_asc`. Every chart needs `title` and `alt`. Tables are `matrix`: dimensions in `rows`, measures in `values`.
- **Colours.** Handled by the generator (Corporate Cool, cyan for Outstanding). Override per measure with `colors:` only when the user asks.

## 4. Build and validate

```
python server/report_agent/scripts/pbir_build.py report_data/reports/<name>/report.yaml
```

It scaffolds on the first run, binds live to the model, writes the theme, report measures, pages and visuals, and runs `powerbi-report-author validate`. Fix every error (and warnings, unless clearly benign) by editing `report.yaml`, then rerun. Never hand-edit the generated `.Report` folder.

## 5. Check in Power BI Desktop (mandatory)

Microsoft's Desktop rules apply. Always `--host desktop`; status before open/reload; open or reload and screenshot are separate commands; if a Desktop command fails without a `correction` object, stop and report.

Before the first run in a session:
- The Microsoft Store Desktop needs `PBI_DESKTOP_PATH`. It's set as a user variable. In PowerShell load it with `$env:PBI_DESKTOP_PATH = [Environment]::GetEnvironmentVariable('PBI_DESKTOP_PATH','User')`. If it's missing or stale after an update, re-derive it: `(Get-AppxPackage Microsoft.MicrosoftPowerBIDesktop).InstallLocation + '\bin\PBIDesktop.exe'`.
- The user must be **signed in to Power BI Desktop** as their work account **before** the report opens. Otherwise they get "Unable to connect… unable to access the semantic model" and then "Unknown pageId". Ask them to confirm.
- Ask once for the screenshot folder. The default is `<LocalApplicationData>\Power BI Report Authoring\Screenshots`; say that screenshots show report data. Create a `validation-<name>-<utc>-<uuid>` child and delete it when done.

Loop:
1. `powerbi-report-author preview "<.Report folder>" --host desktop --status`
   - `HOST_UNAVAILABLE` → open: the same command without `--status`, then poll status until `ready`.
   - `ready` with `hasUnsavedChanges: false` → `--reload`.
   - `hasUnsavedChanges: true` → ask the user to close Desktop with **Don't save** and reopen the `.pbip`, then continue straight to the screenshot.
2. `... --host desktop --screenshot "<child>\<page>-vN.png"` (use `--all-pages` into the folder for multi-page reports).
3. Read the PNG and review it:
   - numbers match your step-2 queries
   - no blank visuals or error boxes
   - no clipped text; readable number formats
   - title and subtitle are true
   - colours follow the plan
   - no empty areas
4. Fix via `report.yaml`, rebuild, repeat. Delete the screenshot child at the end.

## 6. Hand over

Tell the user what the page shows (with the key numbers), any changes from the approved plan and why, the caveats, and where the files are. Tell them to click **Don't save** if Desktop asks when closing, because the generator is the source of truth. Offer publishing only as an option: it needs their explicit OK and a test workspace they name.

## Never

- Change the semantic model, publish, or refresh without an explicit request.
- Build before approval.
- Hand-edit generated PBIR.
- Total money across currencies.
- Invent fields: every field must be in the ontology or be a report measure you define.

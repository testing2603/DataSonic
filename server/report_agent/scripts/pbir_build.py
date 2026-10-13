"""Generic PBIR generator: builds a Power BI project (PBIP) from a report plan (report.yaml).

    python server/report_agent/scripts/pbir_build.py report_data/reports/<folder>/report.yaml

It scaffolds the project with Microsoft's CLI on the first run, binds it live (byConnection) to the
semantic model, writes the theme, report-level measures, pages and visuals, then runs
`powerbi-report-author validate`. Re-running regenerates everything from the plan (visual ids are stable).
Without the CLI it scaffolds from the worked example and runs local structural checks instead.
The semantic model is never changed: extra measures live in the report (reportExtensions.json).

report.yaml shape (see report_data/reports/marine-claims-overview/report.yaml for a full example):

    name: Marine Claims Overview          # report / .pbip name
    model: {workspace: DataSonic 3, name: Marine_Gold_Model, id: <guid>}
    report_measures:                      # optional, report-only DAX measures
      - {table: Claim Vessels, name: Claims, dax: "DISTINCTCOUNT(...)", format: "#,##0", type: Integer}
    colors: {"Total Outstanding": "#0891B2"}   # optional measure-name -> hex overrides
    pages:
      - name: Claims overview             # page tab name
        title: <insight sentence>
        subtitle: <scope / caveats>
        filters: [{field: "Date[Year]", op: "<=", value: 2026}]      # page filters; op: = <> < <= > >= in
        regions: {header: [1,1,9,2], filters: [9,1,13,2], kpis: [1,2,13,4], ...}   # 12x12 grid, end-exclusive
        visuals:
          - {kind: slicer, id: currency, region: filters, slot: 1, of: 3, field: "Claim Vessels[Claim Currency]",
             label: Currency, single: true, default: GBP}
          - {kind: card, id: kpis, region: kpis, values: [{field: "Claim Vessels[Claims]", label: Claims, exact: true}, ...],
             accent: "Claim Vessels[Total Outstanding]", alt: ...}
          - {kind: line|bar|column|clustered_bar|clustered_column, id: trend, region: trend, category: "Date[Year]", category_label: Loss year,
             values: [{field: "Claim Vessels[Total Incurred]", label: Incurred}], sort: value_desc|value_asc|category_asc,
             label_units: 1,   # optional: data-label display units (1 = none, for "(m)" measures)
             title: ..., alt: ..., filters: [...]}
          - {kind: matrix, id: brokers, region: brokers, rows: [{field: "Broker[Broker Name]", label: Broker}],
             values: [...], sort_by: "Claim Vessels[Outstanding (m)]", title: ..., alt: ...}
"""
import copy
import difflib
import hashlib
import json
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import yaml

# report_data is two levels up from this script (server/report_agent/scripts/ -> project root -> report_data/)
REPORT_DATA = Path(__file__).resolve().parent.parent.parent.parent / "report_data"

BASE_THEME = (Path.home() / ".claude/plugins/cache/fabric-collection/powerbi-authoring/0.3.18/skills/"
              "powerbi-report-cli/references/design/assets/base.json")
# Fallbacks when Microsoft's powerbi-authoring plugin / CLI isn't installed on this machine: scaffold from
# the worked example's .Report and reuse its generated theme (theme() is idempotent on its own output).
TEMPLATE_REPORT = REPORT_DATA / "reports" / "marine-claims-overview" / "Marine Claims Overview.Report"
CLI = shutil.which("powerbi-report-author")
VC_SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json"
EXT_SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/reportExtension/1.0.0/schema.json"

SURFACE, CARD, BORDER, SLATE, SLATE_MUTED = "#F1F5F9", "#FFFFFF", "#E2E8F0", "#334155", "#64748B"
FONT, FONT_BOLD = "Segoe UI", "Segoe UI Semibold"
DEFAULT_COLORS = [("Outstanding", "#0891B2"), ("Incurred", "#1E293B"), ("Paid", "#64748B"), ("Premium", "#0E7490"),
                  ("Limit", "#475569"), ("Settlement", "#0E7490"), ("Salvage", "#94A3B8")]
PALETTE = ["#0891B2", "#1E293B", "#64748B", "#0E7490", "#475569", "#94A3B8", "#334155", "#CBD5E1"]

W, H, M, G, N, HEADER_H = 1920, 1080, 32, 24, 12, 80
BODY_Y = M + HEADER_H + G
CW = (W - 2 * M - (N - 1) * G) / N
RH = (H - M - BODY_Y - (N - 2) * G) / (N - 1)
OPS = {"=": 0, ">": 1, ">=": 2, "<": 3, "<=": 4}


def snap(v):
    return int(round(v / 8) * 8)


def region_px(c0, r0, c1, r1):
    x, w = M + (c0 - 1) * (CW + G), (c1 - c0) * CW + (c1 - c0 - 1) * G
    if r0 == 1:
        y, h = M, HEADER_H if r1 == 2 else HEADER_H + G + (r1 - 2) * RH + (r1 - 3) * G
    else:
        y, h = BODY_Y + (r0 - 2) * (RH + G), (r1 - r0) * RH + (r1 - r0 - 1) * G
    x, y = snap(x), snap(y)
    return {"x": x, "y": y, "width": min(snap(w), W - M - x), "height": min(snap(h), H - M - y)}


def split(reg, slot, of, gap=16):
    if not of or of == 1:
        return dict(reg)
    horiz = reg["width"] >= reg["height"]
    total = reg["width"] if horiz else reg["height"]
    size = snap((total - (of - 1) * gap) / of)
    start = (slot - 1) * (size + gap)
    last = slot == of
    if horiz:
        return {**reg, "x": reg["x"] + start, "width": reg["width"] - start if last else size}
    return {**reg, "y": reg["y"] + start, "height": reg["height"] - start if last else size}


def lit(v):
    return {"expr": {"Literal": {"Value": v}}}


def s(text):
    return lit("'" + str(text).replace("'", "''") + "'")


def color(hex_):
    return {"solid": {"color": s(hex_)}}


def literal_value(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return f"{v}L"
    if isinstance(v, float):
        return f"{v}D"
    return "'" + str(v).replace("'", "''") + "'"


def vid(key):
    return hashlib.md5(key.encode()).hexdigest()[:20]


class Fields:
    def __init__(self, tmdl_dir, report_measures):
        self.measures, self.columns = set(), set()
        for f in (Path(tmdl_dir) / "tables").glob("*.tmdl"):
            table = None
            for ln in f.read_text(encoding="utf-8").splitlines():
                st = ln.strip()
                if ln.startswith("table "):
                    table = st[6:].strip("'")
                elif ln.startswith("\tmeasure "):
                    self.measures.add((table, st[8:].split("=")[0].strip().strip("'")))
                elif ln.startswith("\tcolumn "):
                    self.columns.add((table, st[7:].strip().strip("'")))
        self.ext = {(m["table"], m["name"]) for m in report_measures}

    def parse(self, ref):
        t, n = ref.split("[", 1)
        return t.strip().strip("'"), n.rstrip("]")

    def expr(self, ref):
        t, n = self.parse(ref)
        if (t, n) in self.ext:
            return {"Measure": {"Expression": {"SourceRef": {"Schema": "extension", "Entity": t}}, "Property": n}}
        if (t, n) in self.measures:
            return {"Measure": {"Expression": {"SourceRef": {"Entity": t}}, "Property": n}}
        if (t, n) in self.columns:
            return {"Column": {"Expression": {"SourceRef": {"Entity": t}}, "Property": n}}
        known = [f"{a}[{b}]" for a, b in self.measures | self.columns | self.ext]
        close = difflib.get_close_matches(ref, known, n=3, cutoff=0.6)
        hint = f" Did you mean: {', '.join(close)}?" if close else ""
        sys.exit(f"Unknown field {ref!r}: not a model column/measure or a report_measure.{hint}")

    def is_measure(self, ref):
        return "Measure" in self.expr(ref)

    def proj(self, ref, label=None):
        t, n = self.parse(ref)
        p = {"field": self.expr(ref), "queryRef": f"{t}.{n}", "nativeQueryRef": n}
        if label:
            p["displayName"] = label
        return p

    def qref(self, ref):
        t, n = self.parse(ref)
        return f"{t}.{n}"


def container(title=None, alt=None, border=True, background=True, pad=8):
    vco = {
        "padding": [{"properties": {k: lit(f"{pad}D") for k in ("top", "bottom", "left", "right")}}],
        "border": [{"properties": {"show": lit("true" if border else "false"), "color": color(BORDER), "radius": lit("8D")}}],
        "background": [{"properties": {"show": lit("true" if background else "false"), "color": color(CARD)}}],
        "visualHeader": [{"properties": {"show": lit("false")}}],
        "title": [{"properties": {"show": lit("true"), "text": s(title), "fontColor": color(SLATE),
                                  "fontSize": lit("12D"), "fontFamily": s(FONT_BOLD)}}] if title
        else [{"properties": {"show": lit("false")}}],
    }
    if alt:
        vco["general"] = [{"properties": {"altText": s(alt)}}]
    return vco


def filter_obj(F, spec, key):
    t, n = F.parse(spec["field"])
    col_ = {"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": n}}
    op = spec.get("op", "in")
    if op == "in":
        cond = {"In": {"Expressions": [col_], "Values": [[{"Literal": {"Value": literal_value(v)}}] for v in spec["values"]]}}
        ftype = "Categorical"
    elif op == "not in":
        cond = {"Not": {"Expression": {"In": {"Expressions": [col_], "Values": [[{"Literal": {"Value": literal_value(v)}}] for v in spec["values"]]}}}}
        ftype = "Categorical"
    elif op == "<>":
        cond = {"Not": {"Expression": {"Comparison": {"ComparisonKind": 0, "Left": col_, "Right": {"Literal": {"Value": literal_value(spec["value"])}}}}}}
        ftype = "Advanced"
    else:
        cond = {"Comparison": {"ComparisonKind": OPS[op], "Left": col_, "Right": {"Literal": {"Value": literal_value(spec["value"])}}}}
        ftype = "Advanced"
    return {"name": "Filter" + vid(key), "field": F.expr(spec["field"]), "type": ftype,
            "filter": {"Version": 2, "From": [{"Name": "f", "Entity": t, "Type": 0}], "Where": [{"Condition": cond}]},
            "howCreated": "User"}


def check_regions(page):
    """Regions must sit on the 12x12 grid (end-exclusive, so 1..13) and must not overlap."""
    regs = page["regions"]
    for k, (c0, r0, c1, r1) in regs.items():
        if not (1 <= c0 < c1 <= 13 and 1 <= r0 < r1 <= 13):
            sys.exit(f"page {page['name']!r}: region {k!r} {[c0, r0, c1, r1]} is off the 12x12 grid "
                     "(use [col0, row0, col1, row1], end-exclusive, values 1..13)")
    keys = list(regs)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            (a0, ar0, a1, ar1), (b0, br0, b1, br1) = regs[a], regs[b]
            if a0 < b1 and b0 < a1 and ar0 < br1 and br0 < ar1:
                sys.exit(f"page {page['name']!r}: regions {a!r} {regs[a]} and {b!r} {regs[b]} overlap")


def local_validate(report_dir):
    """Structural checks used when Microsoft's validator isn't available. Same result shape as its 'data'."""
    diags = {}

    def add(code, msg):
        diags.setdefault(code, {"severity": "error", "items": []})["items"].append({"message": msg})

    for f in report_dir.rglob("*.json"):
        try:
            json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            add("INVALID_JSON", f"{f.relative_to(report_dir)}: {e}")
    for pdir in (report_dir / "definition" / "pages").iterdir():
        if not pdir.is_dir():
            continue
        boxes = []
        for vf in (pdir / "visuals").glob("*/visual.json"):
            v = json.loads(vf.read_text(encoding="utf-8"))
            p = v["position"]
            if p["x"] < 0 or p["y"] < 0 or p["x"] + p["width"] > W or p["y"] + p["height"] > H:
                add("OUT_OF_PAGE", f"visual {v['name']} on page {pdir.name} extends beyond the {W}x{H} page")
            boxes.append((v["name"], p))
        if len(boxes) < 2:
            add("EMPTY_PAGE", f"page {pdir.name} has no visuals besides the title")
        for i, (na, a) in enumerate(boxes):
            for nb, b in boxes[i + 1:]:
                if (a["x"] < b["x"] + b["width"] and b["x"] < a["x"] + a["width"]
                        and a["y"] < b["y"] + b["height"] and b["y"] < a["y"] + a["height"]):
                    add("OVERLAP", f"visuals {na} and {nb} on page {pdir.name} overlap")
    n = sum(len(d["items"]) for d in diags.values())
    return {"result": "failed" if n else "passed", "errorCount": n, "warningCount": 0, "diagnostics": diags}


class Builder:
    def __init__(self, plan_path):
        self.plan_path = Path(plan_path).resolve()
        self.plan = yaml.safe_load(self.plan_path.read_text(encoding="utf-8"))
        self.dir = self.plan_path.parent
        self.name = self.plan["name"]
        self.report = self.dir / f"{self.name}.Report"
        self.defn = self.report / "definition"
        deepest = len(str(self.defn)) + len("/pages//visuals//visual.json") + 40
        if sys.platform == "win32" and deepest > 259:
            sys.exit(f"name {self.name!r} is too long for Windows paths (deepest file would be {deepest} chars, "
                     f"limit 259): shorten `name` by at least {deepest - 259} characters")
        self.F =Fields(REPORT_DATA / "model" / "Marine_Gold_Model_tmdl" / "definition", self.plan.get("report_measures", []))
        self.overrides = self.plan.get("colors", {})

    def color_for(self, ref, i=0):
        _, n = self.F.parse(ref)
        if n in self.overrides:
            return self.overrides[n]
        for key, c in DEFAULT_COLORS:
            if key.lower() in n.lower():
                return c
        return PALETTE[i % len(PALETTE)] if i else SLATE

    def scaffold(self):
        if (self.dir / f"{self.name}.pbip").exists():
            return
        if not CLI:
            return self.scaffold_from_template()
        r = subprocess.run(f'powerbi-report-author scaffold "{self.dir}" --name "{self.name}"', shell=True,
                           capture_output=True, text=True)
        if r.returncode:
            sys.exit("scaffold failed: " + r.stdout + r.stderr)

    def scaffold_from_template(self):
        if not TEMPLATE_REPORT.exists():
            sys.exit(f"powerbi-report-author isn't installed and the scaffold template {TEMPLATE_REPORT} is missing")
        shutil.rmtree(self.report, ignore_errors=True)
        shutil.copytree(TEMPLATE_REPORT, self.report)
        (self.defn / "reportExtensions.json").unlink(missing_ok=True)
        plat = self.report / ".platform"
        pj = json.loads(plat.read_text(encoding="utf-8"))
        pj["metadata"]["displayName"] = self.name
        pj["config"]["logicalId"] = str(uuid.uuid4())
        plat.write_text(json.dumps(pj, indent=2), encoding="utf-8")
        pbip = json.loads(next(TEMPLATE_REPORT.parent.glob("*.pbip")).read_text(encoding="utf-8"))
        pbip["artifacts"] = [{"report": {"path": self.report.name}}]
        (self.dir / f"{self.name}.pbip").write_text(json.dumps(pbip, indent=2), encoding="utf-8")

    def bind(self):
        m = self.plan["model"]
        p = self.report / "definition.pbir"
        schema = json.loads(p.read_text(encoding="utf-8"))["$schema"]
        p.write_text(json.dumps({"$schema": schema, "version": "4.0", "datasetReference": {"byConnection": {
            "connectionString": f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{m['workspace']};Initial Catalog={m['name']};"
                                f"Integrated Security=ClaimsToken;semanticModelId={m['id']}"}}}, indent=2), encoding="utf-8")

    def theme(self):
        base = BASE_THEME if BASE_THEME.exists() else next((TEMPLATE_REPORT / "StaticResources" / "RegisteredResources").glob("*.json"))
        t = json.loads(base.read_text(encoding="utf-8"))
        t["dataColors"] = PALETTE
        t["foreground"], t["background"], t["tableAccent"] = SLATE, CARD, PALETTE[0]
        for k, v in t["textClasses"].items():
            v["color"], v["fontFace"] = SLATE, FONT_BOLD if k == "header" else FONT
        vs = t["visualStyles"]
        vs["*"]["*"]["border"] = [{"show": True, "color": {"solid": {"color": BORDER}}, "radius": 8}]
        for ax in ("categoryAxis", "valueAxis"):
            vs["*"]["*"][ax] = [{"gridlineStyle": "solid", "gridlineColor": {"solid": {"color": BORDER}}}]
        for k in ("border", "spacing", "padding"):
            vs["cardVisual"]["*"].pop(k, None)
        vs["page"] = {"*": {"background": [{"color": {"solid": {"color": SURFACE}}, "transparency": 0}],
                            "outspace": [{"color": {"solid": {"color": SURFACE}}}]}}
        fname = f"CorporateCool-{hashlib.md5(json.dumps(t, sort_keys=True).encode()).hexdigest()[:8]}.json"
        t["name"] = fname
        reg = self.report / "StaticResources" / "RegisteredResources"
        shutil.rmtree(reg, ignore_errors=True)
        reg.mkdir(parents=True)
        (reg / fname).write_text(json.dumps(t, indent=2), encoding="utf-8")
        rp = self.defn / "report.json"
        rj = json.loads(rp.read_text(encoding="utf-8"))
        rj["themeCollection"]["customTheme"] = {"name": fname, "type": "RegisteredResources",
                                                "reportVersionAtImport": copy.deepcopy(rj["themeCollection"]["baseTheme"]["reportVersionAtImport"])}
        rj["resourcePackages"] = [p for p in rj["resourcePackages"] if p["name"] != "RegisteredResources"] + [
            {"name": "RegisteredResources", "type": "RegisteredResources", "items": [{"name": fname, "path": fname, "type": "CustomTheme"}]}]
        rp.write_text(json.dumps(rj, indent=2), encoding="utf-8")

    def extensions(self):
        rm = self.plan.get("report_measures", [])
        p = self.defn / "reportExtensions.json"
        if not rm:
            p.unlink(missing_ok=True)
            return
        by_table = {}
        for m in rm:
            by_table.setdefault(m["table"], []).append({"name": m["name"], "dataType": m.get("type", "Double"),
                                                        "expression": m["dax"], "formatString": m.get("format", "#,##0.0")})
        p.write_text(json.dumps({"$schema": EXT_SCHEMA, "name": "extension",
                                 "entities": [{"name": t, "measures": ms} for t, ms in by_table.items()]}, indent=2), encoding="utf-8")

    def v_textbox(self, page, pos):
        runs = [{"textRuns": [{"value": page["title"], "textStyle": {"fontFamily": FONT_BOLD, "fontSize": "24px", "color": SLATE}}],
                 "horizontalTextAlignment": "left"}]
        if page.get("subtitle"):
            runs.append({"textRuns": [{"value": page["subtitle"], "textStyle": {"fontFamily": FONT, "fontSize": "12px", "color": SLATE_MUTED}}],
                         "horizontalTextAlignment": "left"})
        return "textbox", None, {"general": [{"properties": {"paragraphs": runs}}]}, container(border=False, background=False, pad=0)

    def v_slicer(self, v):
        F = self.F
        objs = {"data": [{"properties": {"mode": s(v.get("mode", "Dropdown"))}}],
                "header": [{"properties": {"show": lit("true"), "text": s(v.get("label", F.parse(v["field"])[1]))}}]}
        if v.get("single"):
            objs["selection"] = [{"properties": {"strictSingleSelect": lit("true"), "selectAllCheckboxEnabled": lit("false")}}]
        if "default" in v:
            t, n = F.parse(v["field"])
            defaults = v["default"] if isinstance(v["default"], list) else [v["default"]]
            objs["general"] = [{"properties": {"filter": {"filter": {
                "Version": 2, "From": [{"Name": "c", "Entity": t, "Type": 0}],
                "Where": [{"Condition": {"In": {
                    "Expressions": [{"Column": {"Expression": {"SourceRef": {"Source": "c"}}, "Property": n}}],
                    "Values": [[{"Literal": {"Value": literal_value(d)}}] for d in defaults]}}}]}}}}]
        return "slicer", {"queryState": {"Values": {"projections": [F.proj(v["field"])]}}}, objs, container(pad=8)

    def v_card(self, v):
        F = self.F
        vals = v["values"]
        value_objs = [{"properties": {"fontSize": lit("28D"), "fontColor": color(SLATE)}, "selector": {"id": "default"}}]
        if v.get("accent"):
            value_objs.append({"properties": {"fontColor": color(self.color_for(v["accent"]))}, "selector": {"metadata": F.qref(v["accent"])}})
        value_objs += [{"properties": {"labelDisplayUnits": lit("1D")}, "selector": {"metadata": F.qref(x["field"])}}
                       for x in vals if x.get("exact")]
        objs = {"value": value_objs,
                "label": [{"properties": {"fontSize": lit("14D"), "fontColor": color(SLATE_MUTED)}, "selector": {"id": "default"}}],
                "padding": [{"properties": {"paddingUniform": lit("8D")}, "selector": {"id": "default"}}],
                "layout": [{"properties": {"paddingUniform": lit("0D")}, "selector": {"id": "default"}}]}
        vco = {**container(alt=v.get("alt")),
               "spacing": [{"properties": {"customizeSpacing": lit("true"), "verticalSpacing": lit("2D")}, "selector": {"id": "default"}}]}
        return "cardVisual", {"queryState": {"Data": {"projections": [F.proj(x["field"], x.get("label")) for x in vals]}}}, objs, vco

    def sort_def(self, v, cat_ref):
        sort = v.get("sort", "value_desc")
        if sort == "none":
            return None
        if sort.startswith("category"):
            field, d = self.F.expr(cat_ref), "Ascending" if sort == "category_asc" else "Descending"
        else:
            field, d = self.F.expr(v.get("sort_by", v["values"][0]["field"])), "Descending" if sort == "value_desc" else "Ascending"
        return {"sort": [{"field": field, "direction": d}], "isDefaultSort": True}

    def v_chart(self, v):
        F = self.F
        vtype = {"line": "lineChart", "bar": "barChart", "column": "columnChart",
                 "clustered_bar": "clusteredBarChart", "clustered_column": "clusteredColumnChart"}[v["kind"]]
        q = {"queryState": {"Category": {"projections": [F.proj(v["category"], v.get("category_label"))]},
                            "Y": {"projections": [F.proj(x["field"], x.get("label")) for x in v["values"]]}}}
        if v.get("series"):
            q["queryState"]["Series"] = {"projections": [F.proj(v["series"], v.get("series_label"))]}
        sd = self.sort_def(v, v["category"])
        if sd:
            q["sortDefinition"] = sd
        multi = len(v["values"]) > 1
        if v.get("series"):
            dp = []
        elif multi:
            dp = [{"properties": {"fill": color(x.get("color") or self.color_for(x["field"], i))}, "selector": {"metadata": F.qref(x["field"])}}
                  for i, x in enumerate(v["values"])]
        else:
            x = v["values"][0]
            dp = [{"properties": {"defaultColor": color(x.get("color") or self.color_for(x["field"]))}}]
        labels = {"show": lit("false" if vtype == "lineChart" else "true")}
        if v.get("label_units"):
            labels["labelDisplayUnits"] = lit(f"{v['label_units']}D")
        objs = {"labels": [{"properties": labels}]}
        if dp:
            objs["dataPoint"] = dp
        if vtype == "lineChart":
            objs["lineStyles"] = [{"properties": {"areaShow": lit("false")}}]
            objs["categoryAxis"] = [{"properties": {"axisType": s("Categorical"), "showAxisTitle": lit("false")}}]
        if multi or v.get("series"):
            objs["legend"] = [{"properties": {"show": lit("true"), "position": s("Top")}}]
        return vtype, q, objs, container(title=v.get("title"), alt=v.get("alt"))

    def v_matrix(self, v):
        F = self.F
        q = {"queryState": {"Rows": {"projections": [F.proj(r["field"], r.get("label")) for r in v["rows"]]},
                            "Values": {"projections": [F.proj(x["field"], x.get("label")) for x in v["values"]]}}}
        sd = self.sort_def({**v, "sort": v.get("sort", "value_desc")}, v["rows"][0]["field"])
        if sd:
            q["sortDefinition"] = sd
        objs = {"columnHeaders": [{"properties": {"autoSizeColumnWidth": lit("true"), "columnAdjustment": s("growToFit")}}],
                "subTotals": [{"properties": {"rowSubtotals": lit("false")}}]}
        vco = {**container(title=v.get("title"), alt=v.get("alt")), "stylePreset": [{"properties": {"name": s("None")}}]}
        return "pivotTable", q, objs, vco

    def page(self, page, pages_dir, index):
        pid = vid("page:" + page["name"])
        pdir = pages_dir / pid
        (pdir / "visuals").mkdir(parents=True)
        pj = {"$schema": self.page_schema, "name": pid, "displayName": page["name"], "displayOption": "FitToPage",
              "height": H, "width": W,
              "objects": {"background": [{"properties": {"color": color(SURFACE), "transparency": lit("0D")}}],
                          "outspace": [{"properties": {"color": color(SURFACE)}}]}}
        if page.get("filters"):
            pj["filterConfig"] = {"filters": [filter_obj(self.F, f, f"{pid}:pf{i}") for i, f in enumerate(page["filters"])]}
        (pdir / "page.json").write_text(json.dumps(pj, indent=2, ensure_ascii=False), encoding="utf-8")

        check_regions(page)
        regions = {k: region_px(*r) for k, r in page["regions"].items()}
        items = [{"kind": "title", "id": "page_title", "region": "header"}] + page["visuals"]
        used = set()
        for z, v in enumerate(items):
            if v["region"] not in regions:
                sys.exit(f"page {page['name']!r}: visual {v['id']!r} uses undefined region {v['region']!r}")
            used.add(v["region"])
            pos = split(regions[v["region"]], v.get("slot", 1), v.get("of", 1))
            kind = v["kind"]
            if kind == "title":
                vtype, q, objs, vco = self.v_textbox(page, pos)
            elif kind == "slicer":
                vtype, q, objs, vco = self.v_slicer(v)
            elif kind == "card":
                vtype, q, objs, vco = self.v_card(v)
            elif kind in ("line", "bar", "column", "clustered_bar", "clustered_column"):
                vtype, q, objs, vco = self.v_chart(v)
            elif kind == "matrix":
                vtype, q, objs, vco = self.v_matrix(v)
            else:
                sys.exit(f"unsupported visual kind {kind!r}")
            body = {"visualType": vtype}
            if q:
                body["query"] = q
            body["objects"] = objs
            body["visualContainerObjects"] = vco
            order = 1000 + z * 10
            out = {"$schema": VC_SCHEMA, "name": vid(f"{pid}:{v['id']}"), "position": {**pos, "z": order, "tabOrder": order}, "visual": body}
            if v.get("filters"):
                out["filterConfig"] = {"filters": [filter_obj(self.F, f, f"{pid}:{v['id']}:f{i}") for i, f in enumerate(v["filters"])]}
            vdir = pdir / "visuals" / out["name"]
            vdir.mkdir()
            (vdir / "visual.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
        unused = set(regions) - used
        if unused:
            sys.exit(f"page {page['name']!r}: regions with no visual: {sorted(unused)} (the design contract forbids empty regions)")
        return pid

    def build(self):
        self.scaffold()
        self.bind()
        self.theme()
        self.extensions()
        pages_dir = self.defn / "pages"
        pages_meta = json.loads((pages_dir / "pages.json").read_text(encoding="utf-8"))
        first = next(p for p in pages_dir.iterdir() if p.is_dir())
        self.page_schema = json.loads((first / "page.json").read_text(encoding="utf-8"))["$schema"]
        for p in pages_dir.iterdir():
            if p.is_dir():
                shutil.rmtree(p)
        ids = [self.page(pg, pages_dir, i) for i, pg in enumerate(self.plan["pages"])]
        pages_meta["pageOrder"], pages_meta["activePageName"] = ids, ids[0]
        (pages_dir / "pages.json").write_text(json.dumps(pages_meta, indent=2), encoding="utf-8")
        if CLI:
            r = subprocess.run(f'powerbi-report-author validate "{self.report}"', shell=True, capture_output=True, text=True)
            try:
                res = json.loads(r.stdout)["data"]
            except (json.JSONDecodeError, KeyError, TypeError):
                sys.exit(f"powerbi-report-author validate returned no result (exit {r.returncode}): {(r.stdout + r.stderr)[-1500:]}")
            how = ""
        else:
            res = local_validate(self.report)
            how = " [local checks only: powerbi-report-author isn't installed, so Microsoft's validator was skipped]"
        print(f"built {self.report.name}: {len(ids)} page(s); validate: {res['result']} "
              f"({res['errorCount']} errors, {res['warningCount']} warnings){how}")
        for code, d in res.get("diagnostics", {}).items():
            for it in d["items"][:5]:
                print(f"  {d['severity']} {code}: {it['message'][:400]}")
        return res["result"] != "failed"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(0 if Builder(sys.argv[1]).build() else 1)

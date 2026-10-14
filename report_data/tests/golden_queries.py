"""Golden answers for the agent's test questions, computed with read-only DAX against Marine_Gold_Model."""
import json, os, sys
import requests

W = "1296a62d-7e36-4481-a586-686e8d4b0ccc"; D = "dcd787e0-dd7d-47fd-bb3d-af3669727011"

CASES = [
 ("Q01", "How many open claims do we have?", "EVALUATE ROW(\"Open claims\", [# Claims (Open Claim)])"),
 ("Q02", "What's the total incurred on Hull & Machinery claims with a loss in 2025?",
  "EVALUATE SUMMARIZECOLUMNS('Claim Vessels'[Claim Currency], TREATAS({\"Hull & Machinery\"}, 'Policy'[Product]), TREATAS({2025}, 'Date'[Year]), \"Total Incurred\", [Total Incurred])"),
 # Q03: ties at 11 claims, so 7 brokers share places 3-5.
 ("Q03", "Top 5 brokers by number of claims",
  "EVALUATE TOPN(5, SUMMARIZECOLUMNS('Broker'[Broker Name], \"Claims\", DISTINCTCOUNT('Claim Vessels'[Claim Number])), [Claims], DESC) ORDER BY [Claims] DESC"),
 ("Q04", "Show OS reserve by product in USD",
  "EVALUATE SUMMARIZECOLUMNS('Policy'[Product], TREATAS({\"USD\"}, 'Claim Vessels'[Claim Currency]), \"Total Outstanding\", [Total Outstanding]) ORDER BY [Total Outstanding] DESC"),
 ("Q05", "Payment ratio by claim type for GBP claims",
  "EVALUATE SUMMARIZECOLUMNS('Claim'[Claim Type], TREATAS({\"GBP\"}, 'Claim Vessels'[Claim Currency]), \"Claim Payment Ratio\", [Claim Payment Ratio (%)]) ORDER BY [Claim Payment Ratio] DESC"),
 ("Q06", "Which 3 causes of loss take longest to be reported?",
  "EVALUATE TOPN(3, SUMMARIZECOLUMNS('Claim'[Cause of Loss], \"Avg reporting lag (days)\", [Average Claim Reporting Lag (Days)]), [Avg reporting lag (days)], DESC) ORDER BY [Avg reporting lag (days)] DESC"),
 ("Q07", "How many claims were notified in Q3 2025?",
  "EVALUATE ROW(\"Claims notified\", CALCULATE(DISTINCTCOUNT('Claim Vessels'[Claim Number]), USERELATIONSHIP('Claim Vessels'[Notification Date Key], 'Date'[Date Key]), 'Date'[Year] = 2025, 'Date'[Quarter] = 3))"),
 ("Q08", "GWP by year of account for EUR policies",
  "EVALUATE FILTER(SUMMARIZECOLUMNS('Policy'[Year of Account], TREATAS({\"EUR\"}, 'Policy Exposures'[Currency]), \"Total Premium\", [Total Premium]), NOT ISBLANK('Policy'[Year of Account])) ORDER BY 'Policy'[Year of Account]"),
 ("Q09", "How many active policies include war risk?",
  "EVALUATE ROW(\"Active war-risk policies\", CALCULATE([# Policies (War Risk Included)], 'Policy'[Policy Status] = \"Active\"))"),
 ("Q10", "Total incurred by broker type",
  "EVALUATE SUMMARIZECOLUMNS('Broker'[Broker Type], 'Claim Vessels'[Claim Currency], \"Total Incurred\", [Total Incurred]) ORDER BY 'Broker'[Broker Type], 'Claim Vessels'[Claim Currency]"),
]

BEHAVIOUR = [
 ("Q11", "What's our loss ratio for 2024?", "Say loss ratio is not available (no earned premium). May offer Incurred ÷ Premium per currency, clearly labelled."),
 ("Q12", "Show claims by executive", "Ask which executive: policy, customer or claim executive."),
]


def run(dax):
    r = requests.post(f"https://api.powerbi.com/v1.0/myorg/groups/{W}/datasets/{D}/executeQueries",
                      headers={"Authorization": "Bearer " + os.environ["PT"]}, json={"queries": [{"query": dax}]})
    r.raise_for_status()
    return [{k.split("[")[-1].rstrip("]"): v for k, v in row.items()} for row in r.json()["results"][0]["tables"][0]["rows"]]


if __name__ == "__main__":
    out = []
    for qid, q, dax in CASES:
        rows = run(dax)
        out.append({"id": qid, "question": q, "dax": dax, "expected": rows})
        print(f"\n{qid} {q}")
        for r in rows[:10]: print("   ", r)
    for qid, q, exp in BEHAVIOUR:
        out.append({"id": qid, "question": q, "expected_behaviour": exp})
    json.dump(out, open(os.path.join(os.path.dirname(__file__), "golden.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)

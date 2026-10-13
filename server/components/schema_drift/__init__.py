"""Schema drift stewardship (Stewardship Review > Schema Drift page).

  routes.py  /api endpoints the page calls
  store.py   local record of steward decisions (SQLite for now)
  sync.py    background worker writing decisions to the lakehouse through
             the write-back notebook (fabric/drift_decision_writeback.py)
"""

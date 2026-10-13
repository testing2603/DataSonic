"""Shared building blocks used by every component.

  auth        Microsoft sign-in (device code) and access tokens
  network     DNS fallback for the corporate network
  sql         query/execute helpers shared by both SQL connections
  fabric_sql  Fabric lakehouse SQL analytics endpoint (read-only)
  app_db      the app's own SQL Server (read/write)
  fabric_api  Fabric REST API: run notebooks/pipelines, poll jobs
  local_db    interim SQLite stores under server/local_data/
"""

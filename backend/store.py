"""One persistence contract, SQLite for explicit local demo and Supabase for live use.

All patient reads are owner-scoped. Only server code can mutate medical entities.
Clinical derivations are committed atomically after an explicit patient review.
"""

import json
import sqlite3
import threading
from pathlib import Path
from contextlib import contextmanager
import httpx

TABLES = {
    "profiles",
    "medical_records",
    "document_extractions",
    "medical_events",
    "medications",
    "allergies",
    "safety_alerts",
    "sharing_grants",
    "emergency_profiles",
    "emergency_access_grants",
    "audit_logs",
    "demo_sessions",
}


class LocalStore:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS entities (kind TEXT, id TEXT, owner_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id))"
        )
        self.db.execute(
            "CREATE INDEX IF NOT EXISTS entity_owner ON entities(kind,owner_id)"
        )

    def list(self, table, owner=None):
        assert table in TABLES
        with self.lock:
            query = "SELECT data FROM entities WHERE kind=?"
            args = [table]
            if owner is not None:
                query += " AND owner_id=?"
                args.append(owner)
            return [json.loads(r[0]) for r in self.db.execute(query, args).fetchall()]

    def get(self, table, id, owner=None):
        assert table in TABLES
        with self.lock:
            row = self.db.execute(
                "SELECT data,owner_id FROM entities WHERE kind=? AND id=?", (table, id)
            ).fetchone()
            return (
                json.loads(row[0])
                if row and (owner is None or owner == row[1])
                else None
            )

    def put(self, table, item):
        assert table in TABLES
        with self.lock:
            self.db.execute(
                "INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner_id=excluded.owner_id,data=excluded.data",
                (table, item["id"], item["owner_id"], json.dumps(item)),
            )
        return item

    def delete(self, table, id, owner):
        assert table in TABLES
        with self.lock:
            self.db.execute(
                "DELETE FROM entities WHERE kind=? AND id=? AND owner_id=?",
                (table, id, owner),
            )

    @contextmanager
    def transaction(self):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    def review(self, record, extraction, derived):
        with self.transaction():
            for table in ("medical_events", "medications", "allergies"):
                for item in self.list(table, record["owner_id"]):
                    if item["record_id"] == record["id"]:
                        self.delete(table, item["id"], record["owner_id"])
                for item in derived[table]:
                    self.put(table, item)
            self.put("document_extractions", extraction)
            self.put("medical_records", record)


class CloudStore:
    def __init__(self, settings):
        self.s = settings
        self.client = httpx.Client(
            base_url=settings.supabase_url,
            headers={
                "apikey": settings.supabase_key,
                **(
                    {"Authorization": "Bearer " + settings.supabase_key}
                    if settings.supabase_key.startswith("eyJ")
                    else {}
                ),
            },
            timeout=25,
        )

    def request(self, method, path, **kwargs):
        response = self.client.request(method, path, **kwargs)
        response.raise_for_status()
        return response

    def list(self, table, owner=None):
        assert table in TABLES and table != "demo_sessions"
        params = {"select": "data"}
        if owner is not None:
            params["owner_id"] = "eq." + owner
        rows = []
        offset = 0
        while True:
            batch = self.request(
                "GET",
                "/rest/v1/medibridge_" + table,
                params={**params, "order": "id", "offset": str(offset), "limit": "500"},
            ).json()
            rows.extend(r["data"] for r in batch)
            if len(batch) < 500:
                return rows
            offset += 500

    def get(self, table, id, owner=None):
        assert table in TABLES and table != "demo_sessions"
        params = {"id": "eq." + id, "select": "data"}
        if owner is not None:
            params["owner_id"] = "eq." + owner
        rows = self.request("GET", "/rest/v1/medibridge_" + table, params=params).json()
        return rows[0]["data"] if rows else None

    def put(self, table, item):
        assert table in TABLES and table != "demo_sessions"
        self.request(
            "POST",
            "/rest/v1/medibridge_" + table,
            json={"id": item["id"], "owner_id": item["owner_id"], "data": item},
            headers={"Prefer": "resolution=merge-duplicates"},
            params={"on_conflict": "id"},
        )
        return item

    def delete(self, table, id, owner):
        assert table in TABLES and table != "demo_sessions"
        self.request(
            "DELETE",
            "/rest/v1/medibridge_" + table,
            params={"id": "eq." + id, "owner_id": "eq." + owner},
        )

    def review(self, record, extraction, derived):
        self.request(
            "POST",
            "/rest/v1/rpc/medibridge_commit_review",
            json={"p_record": record, "p_extraction": extraction, "p_derived": derived},
        )

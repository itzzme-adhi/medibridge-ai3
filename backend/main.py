from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4
import hashlib, secrets, threading, time, shutil
import httpx
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from .config import Settings
from .store import LocalStore, CloudStore
from .schemas import Profile, Review, Share, Emergency, EmergencyGrant, Extraction
from .documents import validate_file, analyze
from .fixtures import fixtures


def now():
    return datetime.now(timezone.utc)


def stamp():
    return now().isoformat()


def uid():
    return str(uuid4())


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def expired(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) <= now()


def row(owner, **data):
    return {"id": uid(), "owner_id": owner, "created_at": stamp(), **data}


def clean(r):
    return {
        k: v for k, v in r.items() if k not in ("storage_key", "token_hash", "owner_id")
    }


def create_app(settings=None):
    s = settings or Settings()
    s.validate()
    store = (
        LocalStore(str(Path(s.data_dir) / "medibridge.db"))
        if s.mode == "demo"
        else CloudStore(s)
    )
    folder = Path(s.data_dir) / "documents"
    folder.mkdir(parents=True, exist_ok=True)
    fixture_map, samples = fixtures(s.data_dir)
    app = FastAPI(title="MediBridge AI", version="1.0.0")
    app.state.store = store
    app.state.settings = s
    origins = [s.frontend_url] + (
        ["http://localhost:5173", "http://127.0.0.1:5173"] if s.mode == "demo" else []
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(set(origins)),
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Access-Token"],
    )
    rates = {}
    rate_lock = threading.Lock()

    @app.middleware("http")
    async def protections(request: Request, call_next):
        if request.url.path.startswith("/api"):
            length = request.headers.get("content-length")
            if length and (not length.isdigit() or int(length) > s.max_upload + 100000):
                return JSONResponse({"detail": "Request too large."}, status_code=413)
            if request.method in ("POST", "PATCH") and length is None:
                return JSONResponse(
                    {"detail": "Content-Length required."}, status_code=411
                )
            key = (
                request.client.host if request.client else "local",
                int(time.time() / 60),
            )
            with rate_lock:
                for old in list(rates):
                    if old[1] < key[1]:
                        del rates[old]
                rates[key] = rates.get(key, 0) + 1
                blocked = rates[key] > 240
            if blocked:
                return JSONResponse(
                    {"detail": "Too many requests; retry in a minute."},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
        result = await call_next(request)
        result.headers.update(
            {
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
            }
        )
        return result

    @app.exception_handler(httpx.HTTPError)
    async def cloud_error(request, exc):
        return JSONResponse(
            {
                "detail": "Connected service unavailable. Retry; no demo data has been substituted."
            },
            status_code=503,
        )

    def audit(owner, action, record_id=None, actor="patient"):
        store.put(
            "audit_logs", row(owner, action=action, record_id=record_id, actor=actor)
        )

    def patient(authorization: str = Header(default="")):
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Sign in to continue.")
        token = authorization[7:]
        if s.mode == "demo":
            session = next(
                (
                    r
                    for r in store.list("demo_sessions")
                    if secrets.compare_digest(r["token_hash"], digest(token))
                ),
                None,
            )
            if not session or expired(session["expires_at"]):
                raise HTTPException(401, "Session expired. Open a new demo session.")
            return session["owner_id"]
        response = httpx.get(
            s.supabase_url + "/auth/v1/user",
            headers={"apikey": s.supabase_key, "Authorization": "Bearer " + token},
            timeout=15,
        )
        if response.status_code != 200:
            raise HTTPException(401, "Invalid or expired session.")
        return response.json()["id"]

    def owned(id, owner):
        r = store.get("medical_records", id, owner)
        if not r or r.get("deleted"):
            raise HTTPException(404, "Record not found.")
        return r

    def file_bytes(r):
        return (
            (folder / r["storage_key"]).read_bytes()
            if s.mode == "demo"
            else store.request(
                "GET", "/storage/v1/object/medibridge-medical-documents/" + r["storage_key"]
            ).content
        )

    def save_document(owner, data, filename, title=None):
        if not data or len(data) > s.max_upload:
            raise HTTPException(413, "Choose a nonempty file up to 10 MB.")
        try:
            mime = validate_file(data, filename)
        except ValueError as e:
            raise HTTPException(400, str(e))
        id = uid()
        key = owner + "/" + id + Path(filename).suffix.lower()
        if s.mode == "demo":
            path = folder / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        else:
            store.request(
                "POST",
                "/storage/v1/object/medibridge-medical-documents/" + key,
                content=data,
                headers={"Content-Type": mime},
            )
        record = row(
            owner,
            id=id,
            title=title or Path(filename).name[:200],
            filename=Path(filename).name[:200],
            type="Other",
            date=None,
            size=len(data),
            mime=mime,
            storage_key=key,
            status="uploaded",
        )
        try:
            store.put("medical_records", record)
        except Exception:
            if s.mode == "demo":
                (folder / key).unlink(missing_ok=True)
            else:
                store.request(
                    "DELETE",
                    "/storage/v1/object/medibridge-medical-documents",
                    json={"prefixes": [key]},
                )
            raise
        audit(owner, "record_uploaded", id)
        return record

    def process(record):
        try:
            ex, mode, method = analyze(
                file_bytes(record), record["mime"], s, fixture_map
            )
            result = row(
                record["owner_id"],
                id=record["id"],
                record_id=record["id"],
                extraction=ex.model_dump(mode="json"),
                mode=mode,
                method=method,
                reviewed=False,
                original_extraction=ex.model_dump(mode="json"),
            )
            store.put("document_extractions", result)
            record.update(
                status="needs_review",
                type=ex.document_type,
                date=str(ex.document_date) if ex.document_date else None,
            )
            store.put("medical_records", record)
            audit(record["owner_id"], "document_analyzed", record["id"])
            return result
        except ValueError as e:
            record.update(status="processing_error")
            store.put("medical_records", record)
            raise HTTPException(422, str(e))

    def review_record(record, body):
        prior = store.get("document_extractions", record["id"], record["owner_id"])
        if not prior:
            raise HTTPException(409, "Analyze this record first.")
        owner = record["owner_id"]
        ex = body.extraction.model_dump(mode="json")
        ex["source_text"] = prior["original_extraction"]["source_text"]
        prior.update(extraction=ex, reviewed=True, reviewed_at=stamp())
        record.update(
            status="reviewed", type=ex["document_type"], date=ex["document_date"]
        )
        derived = {
            "medical_events": [
                row(
                    owner,
                    record_id=record["id"],
                    title=record["title"],
                    type=ex["document_type"],
                    date=ex["document_date"],
                    provider=ex["provider"],
                )
            ],
            "medications": [
                row(owner, record_id=record["id"], reviewed=True, **m)
                for m in ex["medications"]
            ],
            "allergies": [
                row(owner, record_id=record["id"], reviewed=True, **a)
                for a in ex["allergies"]
            ],
        }
        store.review(record, prior, derived)
        audit(owner, "extraction_reviewed", record["id"])
        return prior

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "mode": s.mode,
            "ocr_available": bool(shutil.which("tesseract")),
            "ai_mode": (
                "configured_unverified"
                if s.llm_key and s.allow_external_ai
                else "synthetic_fixtures_and_manual_review"
            ),
        }

    @app.post("/api/demo/session")
    def demo():
        if s.mode != "demo":
            raise HTTPException(404)
        owner = uid()
        token = secrets.token_urlsafe(32)
        store.put(
            "demo_sessions",
            row(
                owner,
                token_hash=digest(token),
                expires_at=(now() + timedelta(days=1)).isoformat(),
            ),
        )
        store.put("profiles", row(owner, id=owner, display_name="Alex Morgan"))
        for index, sample in enumerate(samples):
            record = save_document(
                owner, sample["path"].read_bytes(), sample["path"].name, sample["title"]
            )
            ex = process(record)
            if index < 3:
                review_record(
                    record,
                    Review(
                        extraction=Extraction.model_validate(ex["extraction"]),
                        confirmed=True,
                    ),
                )
        return {"access_token": token, "expires_in": 86400}

    @app.delete("/api/session")
    def logout(owner=Depends(patient), authorization: str = Header(default="")):
        if s.mode == "demo":
            for item in store.list("demo_sessions", owner):
                if item["token_hash"] == digest(authorization[7:]):
                    store.delete("demo_sessions", item["id"], owner)
        return {"ok": True}

    @app.get("/api/demo/samples/{key}")
    def sample_file(key: str):
        if s.mode != "demo":
            raise HTTPException(404)
        sample = next((r for r in samples if r["key"] == key), None)
        if not sample:
            raise HTTPException(404)
        return FileResponse(
            sample["path"], media_type="application/pdf", filename=sample["path"].name
        )

    @app.get("/api/me")
    def me(owner=Depends(patient)):
        profile = store.get("profiles", owner, owner)
        if not profile:
            profile = store.put(
                "profiles", row(owner, id=owner, display_name="Patient")
            )
        return {"display_name": profile["display_name"], "mode": s.mode}

    @app.patch("/api/me")
    def update_me(body: Profile, owner=Depends(patient)):
        store.put("profiles", row(owner, id=owner, display_name=body.display_name))
        return me(owner)

    @app.get("/api/records")
    def records(owner=Depends(patient)):
        return [
            clean(r)
            for r in sorted(
                store.list("medical_records", owner),
                key=lambda r: r["created_at"],
                reverse=True,
            )
            if not r.get("deleted")
        ]

    @app.post("/api/records", status_code=201)
    async def upload(file: UploadFile = File(...), owner=Depends(patient)):
        data = await file.read(s.max_upload + 1)
        await file.close()
        return clean(save_document(owner, data, file.filename or "document"))

    @app.get("/api/records/{id}")
    def get_record(id: str, owner=Depends(patient)):
        r = owned(id, owner)
        audit(owner, "record_viewed", id)
        return clean(r)

    @app.get("/api/records/{id}/file")
    def download(id: str, owner=Depends(patient)):
        r = owned(id, owner)
        audit(owner, "document_downloaded", id)
        return Response(
            file_bytes(r),
            media_type=r["mime"],
            headers={"Content-Disposition": "inline"},
        )

    @app.get("/api/records/{id}/signed-url")
    def signed_url(id: str, owner=Depends(patient)):
        r = owned(id, owner)
        if s.mode == "demo":
            raise HTTPException(409, "Local demo uses authenticated downloads.")
        signed = store.request(
            "POST",
            "/storage/v1/object/sign/medibridge-medical-documents/" + r["storage_key"],
            json={"expiresIn": 60},
        ).json()
        audit(owner, "signed_document_url_created", id)
        return {
            "url": s.supabase_url + "/storage/v1" + signed["signedURL"],
            "expires_in": 60,
        }

    @app.delete("/api/records/{id}")
    def delete_record(id: str, owner=Depends(patient)):
        r = owned(id, owner)
        r["deleted"] = True
        store.put("medical_records", r)
        for table in (
            "document_extractions",
            "medical_events",
            "medications",
            "allergies",
        ):
            for item in store.list(table, owner):
                if item.get("record_id") == id:
                    store.delete(table, item["id"], owner)
        if s.mode == "demo":
            (folder / r["storage_key"]).unlink(missing_ok=True)
        else:
            store.request(
                "DELETE",
                "/storage/v1/object/medibridge-medical-documents",
                json={"prefixes": [r["storage_key"]]},
            )
        audit(owner, "record_deleted", id)
        return {"ok": True}

    @app.post("/api/records/{id}/analyze")
    def run_analysis(id: str, owner=Depends(patient)):
        r = owned(id, owner)
        if r["status"] == "reviewed":
            raise HTTPException(409, "Use review to correct reviewed information.")
        return process(r)

    @app.get("/api/records/{id}/analysis")
    def get_analysis(id: str, owner=Depends(patient)):
        owned(id, owner)
        result = store.get("document_extractions", id, owner)
        if not result:
            raise HTTPException(404, "This document has not been analyzed.")
        return result

    @app.patch("/api/records/{id}/analysis")
    def review(id: str, body: Review, owner=Depends(patient)):
        return review_record(owned(id, owner), body)

    def clinical(table, owner):
        visible = {
            r["id"]
            for r in store.list("medical_records", owner)
            if not r.get("deleted")
        }
        return [r for r in store.list(table, owner) if r.get("record_id") in visible]

    @app.get("/api/timeline")
    def timeline(owner=Depends(patient)):
        return sorted(
            clinical("medical_events", owner),
            key=lambda r: r.get("date") or "",
            reverse=True,
        )

    @app.get("/api/medications")
    def medications(owner=Depends(patient)):
        return clinical("medications", owner)

    @app.get("/api/allergies")
    def allergies(owner=Depends(patient)):
        return clinical("allergies", owner)

    @app.get("/api/alerts")
    def alerts(owner=Depends(patient)):
        pending = [
            r
            for r in store.list("medical_records", owner)
            if not r.get("deleted") and r["status"] != "reviewed"
        ]
        return {
            "interaction_checking": "not_configured",
            "notice": "No validated drug-interaction source is connected. This application cannot determine medication safety. Ask a healthcare professional.",
            "items": [
                {
                    "title": "Document needs your review",
                    "detail": r["title"],
                    "record_id": r["id"],
                }
                for r in pending
            ],
            "synthetic_examples": [
                {
                    "title": t,
                    "detail": "Illustrative only. Not calculated from your records.",
                }
                for t in [
                    "Potential duplicate medication",
                    "Potential medication interaction",
                    "Conflicting dosage information",
                    "Potential medication-allergy conflict",
                ]
            ],
        }

    @app.post("/api/shares", status_code=201)
    def create_share(body: Share, owner=Depends(patient)):
        for id in body.record_ids:
            owned(id, owner)
        token = secrets.token_urlsafe(32)
        grant = row(
            owner,
            label=body.label,
            record_ids=list(dict.fromkeys(body.record_ids)),
            expires_at=(now() + timedelta(hours=body.expires_hours)).isoformat(),
            revoked=False,
            token_hash=digest(token),
        )
        store.put("sharing_grants", grant)
        audit(owner, "sharing_created")
        return {**clean(grant), "token": token}

    @app.get("/api/shares")
    def shares(owner=Depends(patient)):
        return [clean(r) for r in store.list("sharing_grants", owner)]

    @app.delete("/api/shares/{id}")
    def revoke(id: str, owner=Depends(patient)):
        grant = store.get("sharing_grants", id, owner)
        if not grant:
            raise HTTPException(404)
        grant["revoked"] = True
        store.put("sharing_grants", grant)
        audit(owner, "sharing_revoked")
        return {"ok": True}

    def access(table, token):
        if len(token) < 40 or len(token) > 100:
            raise HTTPException(403, "Invalid access link.")
        grant = next(
            (
                r
                for r in store.list(table)
                if secrets.compare_digest(r["token_hash"], digest(token))
            ),
            None,
        )
        if not grant:
            raise HTTPException(403, "Invalid access link.")
        if grant["revoked"]:
            raise HTTPException(410, "This access has been revoked by the patient.")
        if expired(grant["expires_at"]):
            raise HTTPException(410, "This access link has expired.")
        return grant

    @app.get("/api/shared")
    def shared(x_access_token: str = Header(default="")):
        grant = access("sharing_grants", x_access_token)
        owner = grant["owner_id"]
        allowed = set(grant["record_ids"])
        visible = [
            r
            for r in store.list("medical_records", owner)
            if r["id"] in allowed and not r.get("deleted")
        ]
        ids = {r["id"] for r in visible}
        audit(owner, "doctor_portal_viewed", actor="guest_doctor")
        return {
            "label": grant["label"],
            "expires_at": grant["expires_at"],
            "records": [clean(r) for r in visible],
            "timeline": [
                clean(r)
                for r in clinical("medical_events", owner)
                if r["record_id"] in ids
            ],
            "medications": [
                clean(r)
                for r in clinical("medications", owner)
                if r["record_id"] in ids
            ],
            "allergies": [
                clean(r) for r in clinical("allergies", owner) if r["record_id"] in ids
            ],
            "extractions": [
                clean(r)
                for r in store.list("document_extractions", owner)
                if r["record_id"] in ids
            ],
        }

    @app.get("/api/shared/records/{id}/file")
    def shared_file(id: str, x_access_token: str = Header(default="")):
        grant = access("sharing_grants", x_access_token)
        if id not in grant["record_ids"]:
            raise HTTPException(403, "This record was not shared.")
        r = owned(id, grant["owner_id"])
        audit(grant["owner_id"], "doctor_document_viewed", id, "guest_doctor")
        return Response(file_bytes(r), media_type=r["mime"])

    @app.get("/api/emergency-profile")
    def emergency_profile(owner=Depends(patient)):
        profile = store.get("emergency_profiles", owner, owner)
        return profile["profile"] if profile else Emergency().model_dump()

    @app.patch("/api/emergency-profile")
    def save_emergency(body: Emergency, owner=Depends(patient)):
        store.put("emergency_profiles", row(owner, id=owner, profile=body.model_dump()))
        audit(owner, "emergency_profile_updated")
        return body

    @app.get("/api/emergency-access")
    def emergency_grants(owner=Depends(patient)):
        return [clean(r) for r in store.list("emergency_access_grants", owner)]

    @app.delete("/api/emergency-access")
    def emergency_revoke(owner=Depends(patient)):
        for r in store.list("emergency_access_grants", owner):
            r["revoked"] = True
            store.put("emergency_access_grants", r)
        audit(owner, "emergency_access_revoked")
        return {"ok": True}

    @app.post("/api/emergency-access", status_code=201)
    def emergency_create(body: EmergencyGrant, owner=Depends(patient)):
        if not emergency_profile(owner)["include"]:
            raise HTTPException(400, "Save a profile with at least one approved field.")
        emergency_revoke(owner)
        token = secrets.token_urlsafe(32)
        grant = row(
            owner,
            token_hash=digest(token),
            revoked=False,
            expires_at=(now() + timedelta(days=body.expires_days)).isoformat(),
        )
        store.put("emergency_access_grants", grant)
        audit(owner, "emergency_access_created")
        return {"token": token, "expires_at": grant["expires_at"]}

    @app.get("/api/emergency")
    def emergency_get(x_access_token: str = Header(default="")):
        grant = access("emergency_access_grants", x_access_token)
        profile = emergency_profile(grant["owner_id"])
        audit(
            grant["owner_id"], "emergency_profile_viewed", actor="emergency_link_holder"
        )
        return {
            "profile": {k: profile[k] for k in profile["include"]},
            "expires_at": grant["expires_at"],
            "notice": "Patient-entered information; may be incomplete or outdated.",
        }

    @app.get("/api/audit-logs")
    def logs(owner=Depends(patient)):
        return sorted(
            store.list("audit_logs", owner), key=lambda r: r["created_at"], reverse=True
        )[:300]

    dist = Path(__file__).parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            return FileResponse(dist / "index.html")

    return app


app = create_app()

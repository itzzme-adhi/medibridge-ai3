from dataclasses import replace
from datetime import datetime, timezone, timedelta
import io
import json
import pytest
import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont
from fastapi.testclient import TestClient
from backend.config import Settings
from backend.main import create_app
from backend.documents import extract_text, validate_file, analyze
from backend.schemas import Extraction
from pydantic import ValidationError


@pytest.fixture
def env(tmp_path):
    settings = replace(
        Settings(),
        mode="demo",
        data_dir=str(tmp_path),
        llm_key="",
        allow_external_ai=False,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        token = client.post("/api/demo/session", json={}).json()["access_token"]
        client.headers["Authorization"] = "Bearer " + token
        yield client, app, settings


def test_health_auth_and_owner_isolation(env):
    client, app, _ = env
    assert client.get("/api/health").json()["status"] == "ok"
    mine = client.get("/api/records").json()
    assert len(mine) == 4
    other = client.post("/api/demo/session", json={}).json()["access_token"]
    for suffix in ["", "/file", "/analysis"]:
        assert (
            client.get(
                "/api/records/" + mine[0]["id"] + suffix,
                headers={"Authorization": "Bearer " + other},
            ).status_code
            == 404
        )
    assert (
        client.delete(
            "/api/records/" + mine[0]["id"],
            headers={"Authorization": "Bearer " + other},
        ).status_code
        == 404
    )
    assert client.get("/api/records", headers={"Authorization": ""}).status_code == 401
    assert (
        client.post(
            "/api/shares",
            json={"label": "wrong", "record_ids": [mine[0]["id"]], "expires_hours": 1},
            headers={"Authorization": "Bearer " + other},
        ).status_code
        == 404
    )


def test_complete_upload_review_share_revoke_delete(env):
    c, app, _ = env
    source = c.get("/api/demo/samples/blood-test").content
    upload = c.post(
        "/api/records", files={"file": ("lab.pdf", source, "application/pdf")}
    )
    assert upload.status_code == 201
    id = upload.json()["id"]
    assert c.get("/api/records/" + id + "/file").content == source
    a = c.post("/api/records/" + id + "/analyze", json={})
    assert a.status_code == 200, a.text
    assert a.json()["mode"] == "synthetic_fixture"
    assert not any(e["record_id"] == id for e in c.get("/api/timeline").json())
    body = {"extraction": a.json()["extraction"], "confirmed": True}
    body["extraction"]["provider"] = "Corrected Demo Clinic"
    for _ in range(2):
        assert c.patch("/api/records/" + id + "/analysis", json=body).status_code == 200
    assert len([e for e in c.get("/api/timeline").json() if e["record_id"] == id]) == 1
    assert (
        c.get("/api/records/" + id + "/analysis").json()["original_extraction"][
            "provider"
        ]
        == "Demo Care Clinic"
    )
    g = c.post(
        "/api/shares",
        json={"label": "Test doctor", "record_ids": [id], "expires_hours": 1},
    )
    assert g.status_code == 201
    grant = g.json()
    headers = {"X-Access-Token": grant["token"], "Authorization": ""}
    shared = c.get("/api/shared", headers=headers).json()
    assert [r["id"] for r in shared["records"]] == [id]
    assert (
        c.get("/api/shared/records/" + id + "/file", headers=headers).content == source
    )
    other = next(r for r in c.get("/api/records").json() if r["id"] != id)
    assert (
        c.get(
            "/api/shared/records/" + other["id"] + "/file", headers=headers
        ).status_code
        == 403
    )
    assert (
        c.patch(
            "/api/records/" + id + "/analysis", json=body, headers=headers
        ).status_code
        == 401
    )
    assert "token_hash" not in str(c.get("/api/shares").json())
    assert c.delete("/api/shares/" + grant["id"]).status_code == 200
    assert c.get("/api/shared", headers=headers).status_code == 410
    assert (
        c.get("/api/shared/records/" + id + "/file", headers=headers).status_code == 410
    )
    assert c.delete("/api/records/" + id).status_code == 200
    assert c.get("/api/records/" + id + "/file").status_code == 404
    assert not any(e["record_id"] == id for e in c.get("/api/timeline").json())
    assert {"sharing_revoked", "doctor_document_viewed", "record_deleted"} <= {
        x["action"] for x in c.get("/api/audit-logs").json()
    }


def test_expired_share_and_emergency_allowlist(env):
    c, app, _ = env
    records = c.get("/api/records").json()
    g = c.post(
        "/api/shares",
        json={"label": "Expired", "record_ids": [records[0]["id"]], "expires_hours": 1},
    ).json()
    stored = app.state.store.get("sharing_grants", g["id"])
    stored["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    ).isoformat()
    app.state.store.put("sharing_grants", stored)
    assert (
        c.get("/api/shared", headers={"X-Access-Token": g["token"]}).status_code == 410
    )
    assert c.post("/api/emergency-access", json={}).status_code == 400
    profile = {
        "display_name": "Test patient",
        "blood_group": "O+",
        "allergies": "Penicillin",
        "medications": "SECRET MEDICATION",
        "conditions": "SECRET CONDITION",
        "include": ["display_name", "blood_group", "allergies"],
    }
    assert c.patch("/api/emergency-profile", json=profile).status_code == 200
    first = c.post("/api/emergency-access", json={}).json()["token"]
    response = c.get("/api/emergency", headers={"X-Access-Token": first})
    assert response.status_code == 200
    assert set(response.json()["profile"]) == set(profile["include"])
    assert "SECRET" not in response.text
    second = c.post("/api/emergency-access", json={}).json()["token"]
    assert c.get("/api/emergency", headers={"X-Access-Token": first}).status_code == 410
    assert (
        c.get("/api/emergency", headers={"X-Access-Token": second}).status_code == 200
    )
    c.delete("/api/emergency-access")
    assert (
        c.get("/api/emergency", headers={"X-Access-Token": second}).status_code == 410
    )


def test_file_validation_and_manual_extraction(env):
    c, app, s = env
    for name, data in [
        ("x.pdf", b"not a PDF"),
        ("x.png", b"not an image"),
        ("x.exe", b"bad"),
    ]:
        assert c.post("/api/records", files={"file": (name, data)}).status_code == 400
    assert (
        c.post(
            "/api/records", files={"file": ("large.pdf", b"x" * (s.max_upload + 1))}
        ).status_code
        == 413
    )
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (70, 70), "Fictional medical note. No diagnosis, dose, or date is documented."
    )
    data = doc.tobytes()
    doc.close()
    text, method = extract_text(data, "application/pdf")
    assert "Fictional" in text and method == "pymupdf"
    result, mode, _ = analyze(data, "application/pdf", s, {})
    assert (
        mode == "manual_review"
        and result.document_date is None
        and not result.medications
        and not result.diagnoses
    )
    assert c.post("/api/records", files={"file": ("x.pdf", data)}).status_code == 201
    with pytest.raises(ValidationError):
        Extraction.model_validate({"document_type": "Invented Type"})


def test_real_tesseract_and_scanned_pdf(env):
    image = Image.new("RGB", (1100, 350), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
    except OSError:
        font = ImageFont.load_default(size=36)
    draw.text((40, 50), "SYNTHETIC MEDICAL DOCUMENT", fill="black", font=font)
    draw.text((40, 120), "Patient: Fictional Alex Morgan", fill="black", font=font)
    out = io.BytesIO()
    image.save(out, format="PNG")
    data = out.getvalue()
    assert validate_file(data, "scan.png") == "image/png"
    text, method = extract_text(data, "image/png")
    assert "SYNTHETIC" in text and method == "tesseract"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_image(fitz.Rect(20, 20, 575, 195), stream=data)
    pdf = doc.tobytes()
    doc.close()
    text, method = extract_text(pdf, "application/pdf")
    assert "SYNTHETIC" in text and method == "pymupdf+tesseract"


def test_persistence_logout_and_guards(env):
    c, app, s = env
    auth = dict(c.headers)
    count = len(c.get("/api/records").json())
    fresh = TestClient(create_app(s))
    assert len(fresh.get("/api/records", headers=auth).json()) == count
    assert (
        c.patch(
            "/api/emergency-profile", json={"include": ["medical_records"]}
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/api/shares", json={"label": "bad", "record_ids": [], "expires_hours": 999}
        ).status_code
        == 422
    )
    c.delete("/api/session")
    assert c.get("/api/records").status_code == 401
    with pytest.raises(RuntimeError):
        create_app(replace(s, mode="live", supabase_url="", supabase_key=""))

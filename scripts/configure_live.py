"""Local setup, invoked using the app's virtual environment by run_live.py."""
import getpass
import os
from pathlib import Path
import sys

import httpx
from dotenv import dotenv_values, set_key

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend/.env"
FRONTEND = ROOT / "frontend/.env.local"
DEFAULT_URL = "https://xzylnpnmaqjcgkomxotv.supabase.co"
DEFAULT_PUBLIC_KEY = "sb_publishable_N50n__4Gbp00e-logVaduw_FDElfJHw"


def main():
    saved = dotenv_values(BACKEND)
    front = dotenv_values(FRONTEND)
    url = os.getenv("SUPABASE_URL") or saved.get("SUPABASE_URL") or DEFAULT_URL
    public = os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or front.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    if not public:
        public = DEFAULT_PUBLIC_KEY if url.rstrip("/") == DEFAULT_URL else input("Supabase publishable key: ").strip()
    secret = os.getenv("SUPABASE_SECRET_KEY") or saved.get("SUPABASE_SECRET_KEY")
    if not secret:
        print("Open Supabase > Settings > API Keys. Copy the secret key (or legacy service_role key).")
        secret = getpass.getpass("Server key (hidden; saved only in backend/.env): ").strip()
    if not url.startswith("https://") or not secret or not public:
        sys.exit("An HTTPS project URL, publishable key and server key are required.")
    if secret == public or secret.startswith("sb_publishable_") or public.startswith("sb_secret_"):
        sys.exit("The browser needs a publishable key; the backend needs a separate server secret.")
    url = url.rstrip("/")
    headers = {"apikey": secret}
    if secret.startswith("eyJ"):
        headers["Authorization"] = "Bearer " + secret
    try:
        with httpx.Client(timeout=20) as client:
            auth = client.get(url + "/auth/v1/settings", headers={"apikey": public})
            auth.raise_for_status()
            if auth.json().get("disable_signup"):
                sys.exit("Enable new user signups in Supabase Authentication settings first.")
            if auth.json().get("external", {}).get("email") is False:
                sys.exit("Enable the Email provider in Supabase Authentication first.")
            for table in ("profiles", "medical_records", "document_extractions", "medical_events", "medications", "allergies", "safety_alerts", "sharing_grants", "emergency_profiles", "emergency_access_grants", "audit_logs"):
                response = client.get(url + "/rest/v1/medibridge_" + table, params={"select": "id", "limit": "0"}, headers=headers)
                response.raise_for_status()
            bucket = client.get(url + "/storage/v1/bucket/medibridge-medical-documents", headers=headers)
            bucket.raise_for_status()
            if bucket.json().get("public") is not False:
                sys.exit("The medibridge-medical-documents bucket must be private.")
    except httpx.HTTPStatusError as error:
        sys.exit(f"Cloud readiness check failed (HTTP {error.response.status_code}). Check your keys and apply the included database migration if tables are missing.")
    except httpx.RequestError:
        sys.exit("Cannot reach Supabase. Check your connection and that the project is active.")
    BACKEND.touch(mode=0o600, exist_ok=True)
    BACKEND.chmod(0o600)
    for name, value in {"APP_MODE": "live", "FRONTEND_URL": "http://127.0.0.1:8000", "SUPABASE_URL": url, "SUPABASE_SECRET_KEY": secret}.items():
        set_key(str(BACKEND), name, value)
    FRONTEND.touch(exist_ok=True)
    for name, value in {"VITE_API_URL": "", "VITE_SUPABASE_URL": url, "VITE_SUPABASE_PUBLISHABLE_KEY": public}.items():
        set_key(str(FRONTEND), name, value)
    print("Cloud readiness checks passed. Configure these allowed redirect URLs in Supabase Authentication > URL Configuration:")
    print("  http://127.0.0.1:8000/dashboard\n  http://127.0.0.1:8000/reset-password")
    print("Keep email confirmation enabled. Open confirmation links on this computer while the app is running.")


if __name__ == "__main__":
    main()

## 🎥 MediBridge AI — Hackathon Demonstration Video

We are presenting **MediBridge AI — Your Health, Connected**, a digital healthcare record management platform designed to simplify the organization, digitization, and accessibility of patient medical information.

### Watch Our Prototype Demonstration

**[▶ Watch MediBridge AI Hackathon Demo Video](https://drive.google.com/file/d/1xrVsRWE5BNvn_CdNtjDGZ3vyycpRlDRH/view?usp=sharing)**

### Features Demonstrated

- Email authentication and demo access
- Patient dashboard
- Medical document upload
- OCR-based prescription and report text extraction
- Health timeline
- Medication and allergy information
- Doctor access and sharing
- Emergency information

### Technologies Used

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| OCR | Tesseract OCR |
| Database and authentication integration | Supabase |
| Version Control | Git, GitHub |
| Containerization | Docker |
| Cloud Deployment | Render |

**Demo Note:** The demonstration uses fictional patient information. OCR results require user review, and the application does not provide verified medical diagnoses.
# MediBridge AI

**One Patient. One Medical Timeline. Complete Control.**

A Bits and Bites 24-hour hackathon application that converts fragmented documents into a patient-reviewed history and provides limited, revocable access for doctors and emergency responders.

## Run immediately — Windows, macOS or Linux

Install Python 3.12+ and Node.js 22.12+ (or a newer LTS). Extract the supplied ZIP, open a terminal in its `medibridge-ai` folder, then run:

```sh
python scripts/run_demo.py
```

On macOS/Linux, use `python3` if `python` is unavailable. The launcher creates an isolated Python environment, installs pinned dependencies, builds the frontend and starts the single-server app at **http://127.0.0.1:8000**. Click **Explore live demo**. No passwords or cloud accounts are needed for the local synthetic demo. The first run needs internet for dependency downloads.

The app uses SQLite and private local files in `backend/data` for the **explicit demo mode**. Demo sessions expire after 24 hours and are scoped to a randomly generated patient identity; records persist across refresh and process restart. Signing out revokes that demo session. Demo accounts cannot be recovered after losing the session token. Use fictional data only. Local files are not encrypted by this application.

Tesseract is needed for scanned images/PDFs; ordinary digital PDFs work without it. On macOS, `brew install tesseract`; on Ubuntu, `sudo apt-get install tesseract-ocr`. On Windows, install Tesseract and add its installation folder to PATH. The health endpoint reports whether Tesseract is available.

## What works locally

- Responsive charcoal-and-ivory glass UI, landing screen and protected patient workspace.
- Persistent uploads, content/signature validation, document preview/download, search, type/date filters, deletion.
- Digital PDF text extraction, scanned PDF and image OCR with page/pixel/time limits.
- Exact-hash synthetic extraction for supplied fixtures. Other documents return actual OCR text for manual entry when external AI is off.
- Editable review of conditions, medications, dosage, frequency, dates, allergies, lab findings, procedures and follow-up. Original extraction and source text are preserved.
- Atomic, idempotent review-to-timeline and medication/allergy updates. Current medication use defaults to **unknown**.
- Selected-record doctor grants with random 256-bit tokens, stored as SHA-256 hashes, maximum seven-day access, expiry/revocation checked on every document request.
- Read-only guest doctor portal, approved-field emergency profile, QR rotation/revocation and 30-day default expiry.
- Server-generated audit events. Record deletion immediately denies future retrieval via existing grants.
- Safety review notifications and clearly separate **synthetic interaction examples**. No validated medication interaction checker is configured.

## Real accounts — local live launcher

The selected project `xzylnpnmaqjcgkomxotv` is active. All 11 prefixed MediBridge tables were created and verified with RLS enabled, and `medibridge-medical-documents` is private. Email signup is enabled with confirmation required. End-to-end signup still needs your local server key and callback configuration.

Run:

```sh
python3 scripts/run_live.py
```

The launcher installs dependencies, checks Supabase Auth, all application tables and the private bucket, builds the frontend with the publishable key, and runs FastAPI in **live** mode at http://127.0.0.1:8000. At the first run, paste your Supabase **secret key** (or legacy service_role key) into the hidden terminal prompt. It is stored only in ignored `backend/.env` with owner-only file permissions; never send it in chat. Existing backend AI settings are preserved. A readiness failure stops startup with an explanation.

In Supabase Authentication > URL Configuration, allow:

- `http://127.0.0.1:8000/dashboard`
- `http://127.0.0.1:8000/reset-password`

Enable the Email provider and new user signup. Keep email confirmation enabled and open confirmation links on this computer while the app runs. Configure email delivery for the intended users.

`python3 scripts/run_demo.py` still starts the separate synthetic demo; it now overrides saved frontend cloud configuration so demo and Supabase tokens cannot accidentally be mixed by the launcher.

For a fresh, empty project, the baseline is `supabase/migrations/20261010061200_medibridge_patient_records.sql`. Do not reapply it if tables already exist. The selected project has the complete prefixed baseline applied as `medibridge_isolated_patient_records`. Existing unrelated tables are preserved. Do not reapply the baseline there.

For deployment, configure the backend's `APP_MODE=live`, `SUPABASE_URL`, server-only `SUPABASE_SECRET_KEY`, and exact `FRONTEND_URL`. Configure frontend `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`; add the deployed callback URLs to Supabase. Server secrets must never enter VITE variables.

Signup, login, confirmation, reset and refresh use Supabase's SDK. FastAPI validates access tokens with `/auth/v1/user` and checks ownership. End-to-end live-account verification is still required.

## Development

From the repository root, start `python -m uvicorn backend.main:app --reload --no-access-log` in an environment with requirements installed. In another terminal, `cd frontend` then `npm ci` and `npm run dev`. Vite forwards `/api` to port 8000. Open port 5173. The API documentation is at `/docs`; the health endpoint is `/api/health`.

## AI configuration

The adapter accepts an OpenAI-compatible HTTPS chat-completions provider via `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and the explicit `ALLOW_EXTERNAL_AI=true` switch. This transmits extracted document text to that provider. Review provider terms and obtain appropriate patient consent before enabling it for real data. The UI labels all live extraction as unverified. Pydantic validates returned structure and the server checks exact supporting quotes for medication, allergy and lab entries. The model has no tools and cannot authorize actions.

No AI credentials are bundled. There is no silent fallback on an AI provider error. Without credentials, non-fixture documents require manual structured review. Medication-interaction knowledge is not supplied by the LLM.

## Security model and limits

See [architecture](docs/ARCHITECTURE.md). Server secrets never enter frontend builds; all patient API routes require authentication. Supabase tables have RLS; browser clients have owner-scoped SELECT only, with writes handled by the backend. Audit writes are not exposed to clients. Private storage has no public retrieval policy. The backend can issue owner-only signed URLs with a 60-second TTL; shared documents use checked proxy downloads so revocation blocks future requests immediately. Already downloaded files and previously issued owner signed URLs cannot be recalled.

Guest doctor and emergency access authenticate possession of an unguessable token, **not a clinician's identity**. Only selected records or explicitly approved emergency fields are included. Access tokens stay in URL fragments and are sent in request headers, with no-referrer and no-store responses. Do not add analytics, session recording or access-token logging to these pages. Host-level logs also need redaction. Demo bearer sessions use browser localStorage; live sessions use the Supabase SDK. Deploy over HTTPS, restrict CORS, and harden against XSS before use with actual medical records.

The current rate limit is process-local, not distributed. OCR runs synchronously in backend worker threads and is intended for a small hackathon workload. Use isolated background workers and malware scanning before accepting public untrusted documents at scale. No clinical certification, regulatory compliance or end-to-end encryption is claimed. Backups, account deletion, verified clinician identity, distributed quotas and production operations remain future work.

## Tests

```sh
python -m pytest backend/tests -q
npm run build --prefix frontend
# Start the built app on 127.0.0.1:8000, then:
cd frontend
npx playwright install chromium
npx playwright test
```

Backend tests cover ownership, auth, persistence, uploads, real OCR, review idempotency, source preservation, grant scope/expiry/revocation, emergency allowlists, invalid files and missing fields. Browser tests cover protected routes, search, review/timeline, upload validation, doctor revocation, QR access, mobile overflow and visible service failures. OCR tests require Tesseract and an available font (portable fallback is provided).

## Deployment

- **Frontend:** Vercel project rooted at `frontend`; build `npm run build`; output `dist`; set the three VITE variables before building. `frontend/vercel.json` handles SPA routes and response headers.
- **Backend:** the root Dockerfile builds React and a Python/Tesseract service on port 8000. Use a Python/container host and configure HTTPS, `APP_MODE=live`, Supabase variables and the frontend origin. This is a long-running FastAPI service, not a persistent Vercel process.
- **Database:** apply the Supabase migration; verify RLS with two separate real users and test all storage operations.
- Verify `/api/health`, registration/confirmation/login/reset, upload/review, refresh, sharing expiry/revocation and phone QR access against the deployed URLs. A localhost QR only opens on the same machine.

No public deployment has been created or claimed. A real backend origin and active Supabase configuration are required before a useful Vercel deployment.

## Git upload status

The implementation is committed locally on `integration/medibridge-mvp`. The remote branch was created at the original frontend commit, but automatic approval review blocked uploading the new source pending explicit user authorization. The ZIP contains the implemented code; fetching the remote branch does not yet retrieve these changes.

## Team integration

The integration branch is based on the exact `feature/frontend` commit `8d9395b48ea6e026b45dc32445553e76bd050d0d`. At inspection, `feature/backend`, `feature/ai`, `feature/doctor-portal` and `main` shared initial commit `d4ce9b178d9c06f27ae54b5edcca9ecd92b68272`. Patient UI navigation, layout vocabulary and visual components were extended; metadata-only local state was replaced with API data. No feature branches or main were overwritten.

| Team role | Area |
|---|---|
| Member 1 | React patient frontend |
| Member 2 | Backend, persistence and authorization |
| Member 3 | Document extraction and OCR |
| Member 4 | Doctor portal and emergency access |

See [demo script](docs/DEMO_SCRIPT.md) and [feature status](docs/STATUS.md).

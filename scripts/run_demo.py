"""Cross-platform, one-command local demo launcher. No cloud credentials needed."""

import os, pathlib, shutil, subprocess, sys, venv, webbrowser, threading, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
os.chdir(ROOT)
live = "--live" in sys.argv
os.environ["APP_MODE"] = "live" if live else "demo"
python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if not python.exists():
    print("Creating isolated Python environment...", flush=True)
    venv.create(ROOT / ".venv", with_pip=True)
subprocess.run(
    [str(python), "-m", "pip", "install", "-r", "backend/requirements.txt"], check=True
)
npm = shutil.which("npm")
if not npm:
    sys.exit("Install Node.js 22.12+ (or a newer LTS), then run this command again.")
if live:
    subprocess.run([str(python), "scripts/configure_live.py"], check=True)
else:
    # Explicit process values override any saved Vite cloud configuration.
    os.environ["VITE_SUPABASE_URL"] = ""
    os.environ["VITE_SUPABASE_PUBLISHABLE_KEY"] = ""
os.environ["VITE_API_URL"] = ""
subprocess.run([npm, "ci"], cwd=ROOT / "frontend", check=True)
subprocess.run([npm, "run", "build"], cwd=ROOT / "frontend", check=True)
if not shutil.which("tesseract"):
    print(
        "Tesseract is not installed: digital PDF extraction works; install Tesseract for scanned PDFs/images.",
        flush=True,
    )
print(
    ("\nMediBridge live: http://127.0.0.1:8000\nCreate an account or sign in.\n" if live else "\nMediBridge demo: http://127.0.0.1:8000\nChoose Explore live demo. Use fictional records only.\n") + "Press Ctrl+C to stop.\n",
    flush=True,
)


def open_browser():
    time.sleep(2)
    webbrowser.open("http://127.0.0.1:8000")


threading.Thread(target=open_browser, daemon=True).start()
try:
    subprocess.run(
        [
            str(python),
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--no-access-log",
        ],
        check=True,
    )
except KeyboardInterrupt:
    pass

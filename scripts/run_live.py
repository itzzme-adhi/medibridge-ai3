"""Run real Supabase signup/login; secrets are entered locally, never in chat."""
import runpy
import sys
from pathlib import Path
sys.argv.append("--live")
runpy.run_path(str(Path(__file__).with_name("run_demo.py")), run_name="__main__")

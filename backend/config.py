import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))


@dataclass
class Settings:
    mode: str = os.getenv("APP_MODE", "demo")
    data_dir: str = os.getenv("DATA_DIR", str(Path(__file__).with_name("data")))
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    supabase_url: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_key: str = os.getenv("SUPABASE_SECRET_KEY", "")
    llm_url: str = os.getenv("LLM_BASE_URL", "").rstrip("/")
    llm_key: str = os.getenv("LLM_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "")
    allow_external_ai: bool = os.getenv("ALLOW_EXTERNAL_AI", "false").lower() == "true"
    max_upload: int = 10 * 1024 * 1024

    def validate(self):
        if self.mode not in ("demo", "live"):
            raise RuntimeError("APP_MODE must be demo or live")
        if self.mode == "live" and not (
            self.supabase_url.startswith("https://") and self.supabase_key
        ):
            raise RuntimeError(
                "Live mode requires SUPABASE_URL and SUPABASE_SECRET_KEY"
            )
        if self.llm_key and not (
            self.llm_url.startswith("https://") and self.llm_model
        ):
            raise RuntimeError(
                "LLM_API_KEY requires an HTTPS LLM_BASE_URL and LLM_MODEL"
            )

"""Environment-based configuration loader."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    # Supabase
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # SUMO
    sumo_home: str = os.getenv("SUMO_HOME", "")
    sumo_binary: str = os.getenv("SUMO_BINARY", "sumo-gui")

    # Backend
    backend_host: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    backend_port: int = int(os.getenv("BACKEND_PORT", "8000"))

    # LLM
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")

    # Simulation
    sim_tick_rate: int = int(os.getenv("SIM_TICK_RATE", "10"))
    cv_frame_interval: int = int(os.getenv("CV_FRAME_INTERVAL", "10"))
    db_batch_size: int = int(os.getenv("SUPABASE_BATCH_SIZE", "50"))


@lru_cache
def get_settings() -> Settings:
    return Settings()

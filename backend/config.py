"""Application configuration from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    xai_api_key: str = ""
    xai_model: str = ""
    xai_base_url: str = "https://api.x.ai/v1"
    xai_timeout_seconds: float = 120.0

    demo_user_id: str = "demo-user"

    memory_save_endpoint: str = ""
    memory_search_endpoint: str = ""
    memory_list_endpoint: str = ""
    memory_get_endpoint: str = ""
    memory_update_endpoint: str = ""
    memory_http_timeout_seconds: float = 30.0

    frontend_origin: str = "http://localhost:3000"
    max_image_bytes: int = 12 * 1024 * 1024  # 12 MiB demo limit
    use_mock_grok: bool = False

    @property
    def grok_configured(self) -> bool:
        return bool(self.xai_api_key and self.xai_model) or self.use_mock_grok

    @property
    def memory_store_configured(self) -> bool:
        # Mock store always works; remote endpoints optional.
        return True

    @property
    def using_remote_memory(self) -> bool:
        return bool(self.memory_save_endpoint and self.memory_search_endpoint)


@lru_cache
def get_settings() -> Settings:
    return Settings()

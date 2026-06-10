from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7일

    database_url: str = "sqlite:///./aishotmaker.db"
    storage_dir: str = "storage"
    base_url: str = "http://localhost:8000"

    free_credits: int = 5


settings = Settings()

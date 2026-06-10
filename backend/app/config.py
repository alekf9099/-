from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", protected_namespaces=())

    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7일

    database_url: str = "sqlite:///./aishotmaker.db"
    storage_dir: str = "storage"
    base_url: str = "http://localhost:8000"

    free_credits: int = 5

    # Google 소셜 로그인 OAuth 클라이언트 ID (Android 앱의 Web Client ID)
    google_client_id: str = ""

    # AI 이미지 생성 Provider 설정
    # "local": PIL 기반 데모용 이미지 (API 키 불필요)
    # "replicate": Replicate API로 실제 AI 이미지 생성 (REPLICATE_API_TOKEN 필요)
    model_image_provider: str = "local"
    vton_provider: str = "local"
    replicate_api_token: str = ""


settings = Settings()

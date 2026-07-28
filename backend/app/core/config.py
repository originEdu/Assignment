from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/motion"
    # No default: a missing secret must fail loudly at startup rather than
    # silently signing tokens with a publicly known key.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]


settings = Settings()

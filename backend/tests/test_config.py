import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_missing_jwt_secret_fails_to_load(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

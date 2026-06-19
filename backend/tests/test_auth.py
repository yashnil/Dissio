"""Tests for Supabase JWT verification and the auth dependency."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from app.config import settings
from app.services.auth import get_current_user_id, verify_supabase_jwt

SECRET = "test-jwt-secret-at-least-32-bytes-long!!"


def _token(sub="user-1", *, secret=SECRET, exp_delta=timedelta(hours=1), aud="authenticated"):
    payload = {"sub": sub, "aud": aud, "exp": datetime.now(timezone.utc) + exp_delta}
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", SECRET, raising=False)
    yield


def test_valid_token_returns_subject():
    assert verify_supabase_jwt(_token("abc-123")) == "abc-123"


def test_expired_token_rejected():
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(_token(exp_delta=timedelta(hours=-1)))
    assert exc.value.status_code == 401


def test_wrong_secret_rejected():
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(_token(secret="not-the-secret"))
    assert exc.value.status_code == 401


def test_wrong_audience_rejected():
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(_token(aud="anon"))
    assert exc.value.status_code == 401


def test_missing_secret_is_503(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "", raising=False)
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(_token())
    assert exc.value.status_code == 503


def test_dependency_requires_bearer():
    with pytest.raises(HTTPException) as exc:
        get_current_user_id(authorization=None)
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException):
        get_current_user_id(authorization="Token xyz")


def test_dependency_extracts_user():
    assert get_current_user_id(authorization=f"Bearer {_token('me')}") == "me"

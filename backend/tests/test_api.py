import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app

# Import models so their tables are registered on Base.metadata.
from app.auth import models as _auth_models  # noqa: F401
from app.records import models as _records_models  # noqa: F401

JOINTS = [(4, 2), (8, 6), (12, 10), (16, 14), (20, 18)]


def open_palm_frame() -> dict:
    pts = [{"x": 0.0, "y": 0.0, "z": 0.0} for _ in range(21)]
    for tip, pip in JOINTS:
        pts[pip] = {"x": 1.0, "y": 0.0, "z": 0.0}
        pts[tip] = {"x": 2.0, "y": 0.0, "z": 0.0}
    return {"landmarks": pts}


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    TestSession = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


async def _auth_headers(client) -> dict:
    await client.post(
        "/auth/register", json={"email": "a@b.com", "password": "password123"}
    )
    resp = await client.post(
        "/auth/login", data={"username": "a@b.com", "password": "password123"}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_register_login_submit_and_list(client):
    headers = await _auth_headers(client)

    submission = {
        "target_gesture": "open_palm",
        "frames": [open_palm_frame() for _ in range(5)],
    }
    resp = await client.post("/sessions/submit", json=submission, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["matched_gesture"] == "open_palm"
    assert body["score"] == 100.0

    resp = await client.get("/sessions", headers=headers)
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) == 1
    assert sessions[0]["result"]["score"] == 100.0


async def test_submit_requires_auth(client):
    resp = await client.post("/sessions/submit", json={"frames": [open_palm_frame()]})
    assert resp.status_code == 401


async def test_duplicate_registration_conflicts(client):
    payload = {"email": "dup@b.com", "password": "password123"}
    first = await client.post("/auth/register", json=payload)
    assert first.status_code == 201
    second = await client.post("/auth/register", json=payload)
    assert second.status_code == 409

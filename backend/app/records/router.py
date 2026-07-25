from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.database import get_db
from app.records.models import Session
from app.records.schemas import SessionOut

router = APIRouter(prefix="/sessions", tags=["records"])


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Session]:
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user.id)
        .options(selectinload(Session.result))
        .order_by(Session.submitted_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Session:
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id, Session.user_id == user.id)
        .options(selectinload(Session.result))
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session

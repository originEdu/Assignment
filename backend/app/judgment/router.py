from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.database import get_db
from app.judgment import engine
from app.judgment.schemas import GestureSubmission, JudgeResult
from app.records.models import Session, SessionResult

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/submit", response_model=JudgeResult)
async def submit(
    payload: GestureSubmission,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JudgeResult:
    result = engine.judge(payload)

    session = Session(user_id=user.id, gesture_type=payload.target_gesture)
    session.result = SessionResult(
        matched_gesture=result["matched_gesture"],
        score=result["score"],
        detail={
            "frames_total": result["frames_total"],
            "frames_matched": result["frames_matched"],
        },
    )
    db.add(session)
    await db.commit()

    return JudgeResult(**result)

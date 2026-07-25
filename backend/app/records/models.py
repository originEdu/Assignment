from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# JSONB on PostgreSQL, plain JSON elsewhere (e.g. SQLite used in tests).
JsonType = JSON().with_variant(JSONB, "postgresql")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    gesture_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    result: Mapped["SessionResult"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class SessionResult(Base):
    __tablename__ = "session_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), unique=True
    )
    matched_gesture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    score: Mapped[float] = mapped_column(Float)
    detail: Mapped[dict] = mapped_column(JsonType, default=dict)

    session: Mapped["Session"] = relationship(back_populates="result")

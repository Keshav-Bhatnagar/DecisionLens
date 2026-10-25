from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import (
    String, Text, DateTime, ForeignKey, JSON, Boolean, Float
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def utc_now() -> datetime:
    """Return timezone-aware current UTC datetime."""
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default=None)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, default=None)
    display_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    folders: Mapped[List["Folder"]] = relationship(
        "Folder", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    decisions: Mapped[List["Decision"]] = relationship(
        "Decision", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    color: Mapped[str] = mapped_column(String(30), default="#4F46E5")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    owner: Mapped["User"] = relationship("User", back_populates="folders")
    decisions: Mapped[List["Decision"]] = relationship(
        "Decision", back_populates="folder", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Folder id={self.id} name={self.name} owner_id={self.owner_id}>"


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    problem_statement: Mapped[str] = mapped_column(Text, default="", nullable=False)
    record_type: Mapped[str] = mapped_column(String(30), default="decision")  # "decision" or "meeting"
    status: Mapped[str] = mapped_column(String(40), default="draft")  # draft, evaluating, decided, archived
    domain: Mapped[str] = mapped_column(String(50), default="BUSINESS", nullable=False)  # REAL_ESTATE, FINANCE, SOFTWARE, etc.
    language: Mapped[str] = mapped_column(String(10), default="en")  # "en" or "hi"
    raw_input: Mapped[str] = mapped_column(Text, default="", nullable=False)
    transcript: Mapped[str] = mapped_column(Text, default="", nullable=False)
    transcript_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    points: Mapped[dict] = mapped_column(JSON, default=dict)
    points_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    gaps: Mapped[dict] = mapped_column(JSON, default=dict)
    research: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    recommendation: Mapped[dict] = mapped_column(JSON, default=dict)
    roadmap: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    owner: Mapped["User"] = relationship("User", back_populates="decisions")
    folder: Mapped["Folder"] = relationship("Folder", back_populates="decisions")
    attachments: Mapped[List["Attachment"]] = relationship(
        "Attachment", back_populates="decision", cascade="all, delete-orphan", passive_deletes=True
    )
    audio_recordings: Mapped[List["AudioRecording"]] = relationship(
        "AudioRecording", back_populates="decision", cascade="all, delete-orphan", passive_deletes=True
    )
    snapshots: Mapped[List["AnalysisSnapshot"]] = relationship(
        "AnalysisSnapshot", back_populates="decision", cascade="all, delete-orphan", passive_deletes=True
    )
    roadmaps: Mapped[List["RoadmapRecord"]] = relationship(
        "RoadmapRecord", back_populates="decision", cascade="all, delete-orphan", passive_deletes=True
    )
    outcomes: Mapped[List["DecisionOutcome"]] = relationship(
        "DecisionOutcome", back_populates="decision", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Decision id={self.id} title={self.title} folder_id={self.folder_id}>"


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("decisions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(default=0, nullable=False)
    extracted_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    decision: Mapped["Decision"] = relationship("Decision", back_populates="attachments")

    def __repr__(self) -> str:
        return f"<Attachment id={self.id} original_name={self.original_name}>"


class AudioRecording(Base):
    __tablename__ = "audio_recordings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("decisions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)
    enhanced_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    media_type: Mapped[str] = mapped_column(String(100), default="audio/wav")
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    file_size: Mapped[int] = mapped_column(default=0, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en")
    used_enhanced: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    decision: Mapped["Decision"] = relationship("Decision", back_populates="audio_recordings")

    def __repr__(self) -> str:
        return f"<AudioRecording id={self.id} filename={self.original_filename} decision_id={self.decision_id}>"


class AnalysisSnapshot(Base):
    __tablename__ = "analysis_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("decisions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    synthesis_type: Mapped[str] = mapped_column(String(50), default="recommendation", nullable=False)
    headline: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    recommendation: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    framework_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    input_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    gaps_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    research_snapshot: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    user_priorities: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    decision: Mapped["Decision"] = relationship("Decision", back_populates="snapshots")
    roadmaps: Mapped[List["RoadmapRecord"]] = relationship("RoadmapRecord", back_populates="snapshot")

    def __repr__(self) -> str:
        return f"<AnalysisSnapshot id={self.id} decision_id={self.decision_id} v={self.version}>"


class RoadmapRecord(Base):
    __tablename__ = "roadmaps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("decisions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    snapshot_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("analysis_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    phases: Mapped[List[dict]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    decision: Mapped["Decision"] = relationship("Decision", back_populates="roadmaps")
    snapshot: Mapped[Optional["AnalysisSnapshot"]] = relationship("AnalysisSnapshot", back_populates="roadmaps")

    def __repr__(self) -> str:
        return f"<RoadmapRecord id={self.id} decision_id={self.decision_id} v={self.version}>"


class DecisionOutcome(Base):
    __tablename__ = "decision_outcomes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("decisions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    implementation_status: Mapped[str] = mapped_column(
        String(50), default="implemented_as_recommended", nullable=False
    )  # implemented_as_recommended, pivoted_to_alternative, delayed, abandoned
    chosen_option: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    utility_rating: Mapped[int] = mapped_column(default=5, nullable=False)  # 1 to 5 stars
    predicted_vs_actual: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    unexpected_challenges: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    what_worked_well: Mapped[str] = mapped_column(Text, default="", nullable=False)
    lessons_learned: Mapped[str] = mapped_column(Text, default="", nullable=False)
    would_recommend_tool: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    days_since_decision: Mapped[int] = mapped_column(default=30, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    decision: Mapped["Decision"] = relationship("Decision", back_populates="outcomes")
    owner: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<DecisionOutcome id={self.id} decision_id={self.decision_id} rating={self.utility_rating}>"
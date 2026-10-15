import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship
from apps.api.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    folders = relationship("Folder", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("DecisionSession", back_populates="user", cascade="all, delete-orphan")


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    parent_id = Column(String(36), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    user = relationship("User", back_populates="folders")
    parent = relationship("Folder", remote_side=[id], backref="children")
    sessions = relationship("DecisionSession", back_populates="folder", cascade="all, delete-orphan")


class DecisionSession(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False, index=True)
    objective = Column(Text, nullable=False)
    folder_id = Column(String(36), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="draft")  # draft, in_progress, completed, archived
    framework_type = Column(String(50), default="mcda")  # mcda, swot, first_principles
    context_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    user = relationship("User", back_populates="sessions")
    folder = relationship("Folder", back_populates="sessions")
    media_items = relationship("MediaItem", back_populates="session", cascade="all, delete-orphan")
    transcripts = relationship("TranscriptItem", back_populates="session", cascade="all, delete-orphan")
    responses = relationship("ResponseItem", back_populates="session", cascade="all, delete-orphan")
    analyses = relationship("AnalysisResult", back_populates="session", cascade="all, delete-orphan")


class MediaItem(Base):
    __tablename__ = "media"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(1024), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    duration_seconds = Column(Float, nullable=True)
    status = Column(String(50), default="uploaded")  # uploaded, processing, processed, failed
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    session = relationship("DecisionSession", back_populates="media_items")
    transcripts = relationship("TranscriptItem", back_populates="media", cascade="all, delete-orphan")


class TranscriptItem(Base):
    __tablename__ = "transcripts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    media_id = Column(String(36), ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    raw_text = Column(Text, nullable=False)
    segments = Column(JSON, nullable=True)  # list of {start, end, speaker, text}
    word_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    session = relationship("DecisionSession", back_populates="transcripts")
    media = relationship("MediaItem", back_populates="transcripts")


class ResponseItem(Base):
    __tablename__ = "responses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    prompt_id = Column(String(100), nullable=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    speaker = Column(String(100), nullable=True)
    extra_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    session = relationship("DecisionSession", back_populates="responses")


class AnalysisResult(Base):
    __tablename__ = "analyses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    framework = Column(String(50), nullable=False)  # mcda, swot, first_principles
    summary = Column(Text, nullable=False)
    key_findings = Column(JSON, nullable=True)
    matrix = Column(JSON, nullable=True)  # scoring matrix / alternatives / criteria
    recommendations = Column(JSON, nullable=True)
    confidence_score = Column(Float, default=0.85)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    session = relationship("DecisionSession", back_populates="analyses")

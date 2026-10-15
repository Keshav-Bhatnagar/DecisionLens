from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, ConfigDict


# ==========================================
# Health Schemas
# ==========================================
class HealthResponse(BaseModel):
    status: str
    version: str
    database: Dict[str, Any]
    environment: str
    timestamp: datetime


class HealthDbCheckResponse(BaseModel):
    status: str
    read_write_verified: bool
    details: Dict[str, Any]
    timestamp: datetime


# ==========================================
# User Schemas
# ==========================================
class UserBase(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(min_length=6)


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: Optional[str] = None


# ==========================================
# Folder Schemas
# ==========================================
class FolderBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    parent_id: Optional[str] = None


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None


class FolderResponse(FolderBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ==========================================
# Session Schemas
# ==========================================
class SessionBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    objective: str = Field(min_length=1)
    folder_id: Optional[str] = None
    framework_type: str = Field(default="mcda", pattern="^(mcda|swot|first_principles|general)$")
    context_data: Optional[Dict[str, Any]] = None


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    objective: Optional[str] = None
    folder_id: Optional[str] = None
    status: Optional[str] = None
    framework_type: Optional[str] = None
    context_data: Optional[Dict[str, Any]] = None


class SessionResponse(SessionBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime


# ==========================================
# Media Schemas
# ==========================================
class MediaCreate(BaseModel):
    session_id: str
    file_name: str
    file_path: str
    file_size_bytes: int
    mime_type: str
    duration_seconds: Optional[float] = None


class MediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_id: str
    file_name: str
    file_path: str
    file_size_bytes: int
    mime_type: str
    duration_seconds: Optional[float] = None
    status: str
    created_at: datetime


# ==========================================
# Transcript Schemas
# ==========================================
class TranscriptSegment(BaseModel):
    start: float
    end: float
    speaker: Optional[str] = None
    text: str


class TranscriptCreate(BaseModel):
    session_id: str
    media_id: Optional[str] = None
    raw_text: str
    segments: Optional[List[TranscriptSegment]] = None
    word_count: Optional[int] = None


class TranscriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_id: str
    media_id: Optional[str] = None
    raw_text: str
    segments: Optional[List[Dict[str, Any]]] = None
    word_count: int
    created_at: datetime


# ==========================================
# Response Schemas
# ==========================================
class ResponseCreate(BaseModel):
    session_id: str
    prompt_id: Optional[str] = None
    question: str
    answer: str
    speaker: Optional[str] = None
    extra_metadata: Optional[Dict[str, Any]] = None


class ResponseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_id: str
    prompt_id: Optional[str] = None
    question: str
    answer: str
    speaker: Optional[str] = None
    extra_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime


# ==========================================
# Analysis Schemas
# ==========================================
class AnalysisCreate(BaseModel):
    session_id: str
    framework: str = "mcda"
    summary: str
    key_findings: Optional[List[str]] = None
    matrix: Optional[Dict[str, Any]] = None
    recommendations: Optional[List[str]] = None
    confidence_score: Optional[float] = 0.85


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_id: str
    framework: str
    summary: str
    key_findings: Optional[List[Any]] = None
    matrix: Optional[Dict[str, Any]] = None
    recommendations: Optional[List[Any]] = None
    confidence_score: float
    created_at: datetime

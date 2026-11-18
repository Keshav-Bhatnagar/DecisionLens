from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from app.config import settings

import logging

from urllib.parse import urlparse, urlunparse

logger = logging.getLogger("decisionlens.database")

# Engine setup with appropriate connection arguments
try:
    import psycopg  # psycopg v3
    has_psycopg3 = True
except ImportError:
    has_psycopg3 = False

try:
    import psycopg2
    has_psycopg2 = True
except ImportError:
    has_psycopg2 = False

db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

if db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    if has_psycopg3:
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    elif has_psycopg2:
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

# Dynamically route Supabase direct IPv6 URLs to IPv4 connection pooler for cloud hosts like Render
try:
    parsed_db = urlparse(db_url)
    if parsed_db.hostname and parsed_db.hostname.startswith("db.") and parsed_db.hostname.endswith(".supabase.co"):
        project_ref = parsed_db.hostname.replace("db.", "").replace(".supabase.co", "")
        new_user = f"postgres.{project_ref}" if parsed_db.username == "postgres" else parsed_db.username
        # Preserve user's private password from environment
        auth_part = f"{new_user}:{parsed_db.password}" if parsed_db.password else new_user
        netloc = f"{auth_part}@aws-0-ap-southeast-1.pooler.supabase.com:6543"
        db_url = urlunparse((parsed_db.scheme, netloc, parsed_db.path, parsed_db.params, parsed_db.query, parsed_db.fragment))
        logger.info("Dynamically converted Supabase direct host to IPv4 connection pooler.")
except Exception as exc:
    logger.debug(f"URL parsing skipped: {exc}")

is_sqlite = db_url.startswith("sqlite")
engine_kwargs = {"echo": False}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_recycle"] = 300
    engine_kwargs["pool_pre_ping"] = False  # Avoid 450ms WAN roundtrip ping on every request

engine = create_engine(db_url, **engine_kwargs)

# Enable foreign key constraints in SQLite
if is_sqlite:
    @event.listens_for(Engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency yielding a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_pgvector_schema() -> None:
    """
    Prepare Supabase/Postgres for semantic document search:
    enables the pgvector extension and makes sure decision_document_chunks has
    `embedding_model` and an `embedding vector(EMBEDDING_DIMENSIONS)` column.
    If the dimension changed, the vector column is recreated; chunks are then
    re-embedded automatically on the next search (or via POST /api/rag/reindex).
    Each step runs in its own transaction so one failure never blocks startup.
    """
    if is_sqlite:
        return
    dim = int(settings.embedding_dimensions or 1536)

    def _run(sql: str, label: str) -> bool:
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
            return True
        except Exception as exc:
            logger.warning(f"pgvector setup step '{label}' skipped: {exc}")
            return False

    _run("CREATE EXTENSION IF NOT EXISTS vector;", "enable pgvector extension")
    _run(
        "ALTER TABLE decision_document_chunks ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(120);",
        "add embedding_model column",
    )

    current_type = None
    try:
        with engine.connect() as conn:
            current_type = conn.execute(
                text(
                    "SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a "
                    "WHERE a.attrelid = 'decision_document_chunks'::regclass "
                    "AND a.attname = 'embedding' AND NOT a.attisdropped"
                )
            ).scalar()
    except Exception as exc:
        logger.warning(f"Could not inspect embedding column: {exc}")
        return

    expected = f"vector({dim})"
    if current_type == expected:
        return
    if current_type is not None:
        logger.warning(f"Embedding column is {current_type}, expected {expected}. Recreating it; chunks will re-embed.")
        _run("ALTER TABLE decision_document_chunks DROP COLUMN embedding;", "drop old embedding column")
    if _run(f"ALTER TABLE decision_document_chunks ADD COLUMN embedding vector({dim});", "add embedding column"):
        _run("UPDATE decision_document_chunks SET embedding_model = NULL;", "mark chunks for re-embedding")
        logger.info(f"pgvector embedding column ready: {expected}")


def init_db() -> None:
    """Create all database tables and ensure SQLite schema migrations with graceful fallback."""
    global engine, SessionLocal, is_sqlite
    import app.models  # noqa: F401 - ensure models are registered on Base.metadata

    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.error(f"Failed to connect to primary database ({exc}). Falling back to local SQLite.")
        sqlite_url = "sqlite:///./decisionlens.db"
        is_sqlite = True
        engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
        SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
        Base.metadata.create_all(bind=engine)

    # Apply incremental column additions for PostgreSQL/Supabase and SQLite development
    if not is_sqlite:
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE decisions ADD COLUMN IF NOT EXISTS fault_lines JSONB DEFAULT '{}'::jsonb;"))
                conn.commit()
        except Exception as exc:
            logger.debug(f"Postgres incremental column check skipped: {exc}")
        ensure_pgvector_schema()

    if is_sqlite:
        try:
            with engine.connect() as conn:
                # Check users columns
                user_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(users);")).fetchall()]
                if "oauth_provider" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50);"))
                if "avatar_url" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);"))
                if "display_name" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(150);"))

                # Check folders columns
                folder_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(folders);")).fetchall()]
                if "color" not in folder_cols:
                    conn.execute(text("ALTER TABLE folders ADD COLUMN color VARCHAR(30) DEFAULT '#4F46E5';"))
                if "domain" not in folder_cols:
                    conn.execute(text("ALTER TABLE folders ADD COLUMN domain VARCHAR(50);"))
                if "updated_at" not in folder_cols:
                    conn.execute(text("ALTER TABLE folders ADD COLUMN updated_at DATETIME;"))

                # Check decisions columns
                decision_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(decisions);")).fetchall()]
                if "problem_statement" not in decision_cols:
                    conn.execute(text("ALTER TABLE decisions ADD COLUMN problem_statement TEXT DEFAULT '';"))
                if "record_type" not in decision_cols:
                    conn.execute(text("ALTER TABLE decisions ADD COLUMN record_type VARCHAR(30) DEFAULT 'decision';"))
                if "points_reviewed" not in decision_cols:
                    conn.execute(text("ALTER TABLE decisions ADD COLUMN points_reviewed BOOLEAN DEFAULT 0;"))
                if "domain" not in decision_cols:
                    conn.execute(text("ALTER TABLE decisions ADD COLUMN domain VARCHAR(50) DEFAULT 'BUSINESS';"))
                if "fault_lines" not in decision_cols:
                    conn.execute(text("ALTER TABLE decisions ADD COLUMN fault_lines JSON DEFAULT '{}';"))

                # Check attachments columns
                attach_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(attachments);")).fetchall()]
                if "file_size" not in attach_cols:
                    conn.execute(text("ALTER TABLE attachments ADD COLUMN file_size INTEGER DEFAULT 0;"))

                # Check RAG chunk columns
                chunk_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(decision_document_chunks);")).fetchall()]
                if chunk_cols and "embedding_model" not in chunk_cols:
                    conn.execute(text("ALTER TABLE decision_document_chunks ADD COLUMN embedding_model VARCHAR(120);"))

                conn.commit()
        except Exception:
            pass

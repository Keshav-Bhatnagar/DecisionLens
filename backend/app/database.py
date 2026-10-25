from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from app.config import settings

import logging

from urllib.parse import urlparse, urlunparse

logger = logging.getLogger("decisionlens.database")

# Engine setup with appropriate connection arguments
db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

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

    # Apply incremental column additions for local SQLite development if tables were created earlier
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

                # Check attachments columns
                attach_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(attachments);")).fetchall()]
                if "file_size" not in attach_cols:
                    conn.execute(text("ALTER TABLE attachments ADD COLUMN file_size INTEGER DEFAULT 0;"))

                conn.commit()
        except Exception:
            pass

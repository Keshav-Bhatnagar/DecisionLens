from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from app.config import settings

# Engine setup with appropriate connection arguments
is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

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
    """Create all database tables and ensure SQLite schema migrations."""
    Base.metadata.create_all(bind=engine)

    # Apply incremental column additions for local SQLite development if tables were created earlier
    if is_sqlite:
        with engine.connect() as conn:
            try:
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

                # Check attachments columns
                attach_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(attachments);")).fetchall()]
                if "file_size" not in attach_cols:
                    conn.execute(text("ALTER TABLE attachments ADD COLUMN file_size INTEGER DEFAULT 0;"))

                conn.commit()
            except Exception:
                pass

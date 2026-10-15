import logging
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from apps.api.core.config import settings

logger = logging.getLogger(__name__)

# Handle SQLite vs PostgreSQL configurations
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG and False,  # set to False to avoid cluttering logs
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields an active database session and ensures it closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """Execute a simple query to verify database connectivity."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).scalar()
            return {"connected": True, "result": result, "dialect": engine.dialect.name}
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return {"connected": False, "error": str(e), "dialect": engine.dialect.name}


def test_database_read_write() -> dict:
    """Explicitly verify that the database can perform both read and write operations."""
    try:
        with engine.begin() as conn:
            # Create a lightweight temporary heartbeat table if it doesn't exist
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS _health_heartbeat (
                    id INTEGER PRIMARY KEY,
                    ping_token TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            import uuid
            test_token = f"ping-{uuid.uuid4()}"
            conn.execute(
                text("INSERT INTO _health_heartbeat (ping_token) VALUES (:token)"),
                {"token": test_token}
            )
            retrieved = conn.execute(
                text("SELECT ping_token FROM _health_heartbeat WHERE ping_token = :token"),
                {"token": test_token}
            ).scalar()

            # Clean up old pings to prevent unbounded growth
            conn.execute(
                text("DELETE FROM _health_heartbeat WHERE ping_token = :token"),
                {"token": test_token}
            )

            return {
                "read_write_verified": True,
                "read_token": retrieved,
                "matches": retrieved == test_token,
            }
    except Exception as e:
        logger.error(f"Database read/write check failed: {e}")
        return {"read_write_verified": False, "error": str(e)}

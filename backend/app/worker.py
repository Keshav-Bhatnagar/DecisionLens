"""
Standalone Postgres-backed Worker for Google Meet Bot Sessions (₹0 Redis alternative).

Uses SELECT ... FOR UPDATE SKIP LOCKED on PostgreSQL so multiple worker containers
can safely claim queued bot jobs without Redis or paid message brokers.

Usage:
    python -m app.worker
"""

import logging
import os
import socket
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db, is_sqlite
from app.models import BotJob
from app.services.meet_runner import MeetBotRunner

logger = logging.getLogger("decisionlens.worker")


def enqueue_bot_job(
    db: Session,
    session_id: int,
    meet_url: str,
    bot_name: str = "DecisionLens Bot",
    language: str = "en",
) -> BotJob:
    """Insert a new queued bot job into PostgreSQL/SQLite."""
    job = BotJob(
        session_id=session_id,
        meet_url=meet_url,
        bot_name=bot_name or "DecisionLens Bot",
        language=language or "en",
        status="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def claim_next_bot_job(db: Session, worker_id: str) -> Optional[BotJob]:
    """
    Atomically claim the oldest queued BotJob.
    Uses FOR UPDATE SKIP LOCKED on PostgreSQL to prevent double-claiming across workers.
    """
    stmt = (
        select(BotJob)
        .where(BotJob.status == "queued")
        .order_by(BotJob.created_at.asc(), BotJob.id.asc())
        .limit(1)
    )
    if not is_sqlite:
        stmt = stmt.with_for_update(skip_locked=True)

    job = db.scalars(stmt).first()
    if not job:
        return None

    job.status = "running"
    job.worker_id = worker_id
    job.locked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


def process_single_job(job: BotJob) -> None:
    """Execute one MeetBotRunner lifecycle and update job completion status."""
    runner = MeetBotRunner(
        session_id=job.session_id,
        meet_url=job.meet_url,
        bot_name=job.bot_name,
        language=job.language,
    )
    db = SessionLocal()
    try:
        runner._run_loop()
        db_job = db.get(BotJob, job.id)
        if db_job:
            db_job.status = "completed"
            db_job.completed_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as exc:
        logger.exception("Worker job=%s (session=%s) failed: %s", job.id, job.session_id, exc)
        db_job = db.get(BotJob, job.id)
        if db_job:
            db_job.status = "failed"
            db_job.error_message = str(exc)[:500]
            db_job.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def run_worker_loop(poll_interval_seconds: float = 2.0) -> None:
    """Main polling loop for standalone `python -m app.worker` execution."""
    init_db()
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    logger.info("DecisionLens Postgres Bot Worker started (worker_id=%s)", worker_id)

    while True:
        db = SessionLocal()
        try:
            job = claim_next_bot_job(db, worker_id=worker_id)
        finally:
            db.close()

        if job:
            logger.info("Claimed BotJob id=%s for session=%s", job.id, job.session_id)
            process_single_job(job)
        else:
            time.sleep(poll_interval_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_worker_loop()


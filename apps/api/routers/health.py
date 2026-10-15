from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from apps.api.core.config import settings
from apps.api.core.database import get_db, check_database_connection, test_database_read_write
from apps.api.models.schemas import HealthResponse, HealthDbCheckResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check():
    """System health check endpoint verifying API service and database connectivity."""
    db_status = check_database_connection()
    status_str = "healthy" if db_status.get("connected") else "degraded"
    
    return HealthResponse(
        status=status_str,
        version=settings.APP_VERSION,
        database=db_status,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/health/db", response_model=HealthDbCheckResponse)
def database_read_write_check(db: Session = Depends(get_db)):
    """
    Explicitly verifies that the database can perform both READ and WRITE operations.
    Fails with 500 if the database cannot read or write.
    """
    result = test_database_read_write()
    if not result.get("read_write_verified"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database read/write verification failed: {result.get('error')}",
        )

    return HealthDbCheckResponse(
        status="ok",
        read_write_verified=True,
        details=result,
        timestamp=datetime.now(timezone.utc),
    )

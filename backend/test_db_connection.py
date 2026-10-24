import sys
import os
import time

sys.path.insert(0, os.path.abspath("."))

from app.config import settings
from app.database import engine, SessionLocal, init_db
from sqlalchemy import text
from app.models import User

def test_connection():
    print("=" * 60)
    print("DECISIONLENS DATABASE CONNECTION DIAGNOSTIC")
    print("=" * 60)

    # 1. Target URL (masked password)
    raw_url = settings.database_url
    if "@" in raw_url:
        protocol_user, host_part = raw_url.split("@", 1)
        protocol, creds = protocol_user.split("://", 1)
        user = creds.split(":", 1)[0]
        masked_url = f"{protocol}://{user}:*****@{host_part}"
    else:
        masked_url = raw_url
    print(f"Target Database: {masked_url}")

    # 2. Connection & Latency
    start_time = time.time()
    try:
        with engine.connect() as conn:
            conn_time = (time.time() - start_time) * 1000
            print(f"[OK] Connection established in {conn_time:.2f} ms")

            # Version & Current Database
            version_str = conn.execute(text("SELECT version();")).fetchone()[0]
            db_name = conn.execute(text("SELECT current_database();")).fetchone()[0]
            current_user = conn.execute(text("SELECT current_user;")).fetchone()[0]

            print(f"  - Database: {db_name}")
            print(f"  - User: {current_user}")
            print(f"  - Engine: {version_str.split(' on ')[0]}")

            # 3. Ensure Schema initialization
            print("\nChecking schema tables...")
            init_db()

            # 4. List all public tables
            tables = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
            """)).fetchall()
            
            table_names = [t[0] for t in tables]
            print(f"[OK] Verified {len(table_names)} tables in public schema:")
            for t in table_names:
                count = conn.execute(text(f"SELECT count(*) FROM {t}")).fetchone()[0]
                print(f"     * {t:22} ({count} rows)")

            # 5. Read/Write Transaction verification
            print("\nVerifying Read / Write transaction integrity...")
            test_email = f"diagnostic_{int(time.time())}@decisionlens.test"
            conn.execute(
                text("INSERT INTO users (email, password_hash, created_at) VALUES (:email, :pwd, NOW())"),
                {"email": test_email, "pwd": "diagnostic_hash_temporary"}
            )
            created_user = conn.execute(
                text("SELECT id, email FROM users WHERE email = :email"),
                {"email": test_email}
            ).fetchone()
            assert created_user is not None
            # Cleanup test record
            conn.execute(
                text("DELETE FROM users WHERE email = :email"),
                {"email": test_email}
            )
            conn.commit()
            print("[OK] Read / Write / Delete transaction verified successfully.")

    except Exception as ex:
        print(f"\n[FAILED] Connection failed: {type(ex).__name__}")
        print(f"Error details: {ex}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("RESULT: DATABASE CONNECTION TO SUPABASE IS HEALTHY & FULLY OPERATIONAL!")
    print("=" * 60)

if __name__ == "__main__":
    test_connection()

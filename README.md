# DecisionLens

**DecisionLens** is an intelligent audio-driven executive decision analysis platform. It captures stakeholder deliberation audio or text inputs, extracts diarized conversational transcripts, structures decision criteria and alternatives, and runs algorithmic frameworks such as **Multi-Criteria Decision Analysis (MCDA)** and **SWOT** analysis.

---

## 🏗️ Repository Architecture

```text
decisionlens/
  apps/
    web/                 # Next.js 14 App Router (Tailwind CSS, TypeScript)
    api/                 # FastAPI REST application
      routers/           # auth, folders, sessions, media, transcripts, responses, analysis, health
      services/          # audio.py (ffmpeg), stt.py, llm.py, research.py, frameworks/, validators.py
      models/            # SQLAlchemy database models and Pydantic v2 schemas
      jobs/              # Background job runners (audio processing, STT, analysis)
      alembic/           # Database migrations from day one
  examples/
    audio/               # Sample 16kHz mono audio generated with ffmpeg
    transcripts/         # Sample diarized meeting transcripts (JSON)
    expected_outputs/    # Sample MCDA decision matrices and executive decision brief
  .env.example           # Environment template (all secrets kept strictly on backend)
  .gitignore             # Ignores .env, .db, build artifacts
```

---

## ⚡ Prerequisites

1. **Node.js**: `20.x+` (verified with Node `v25.9.0`)
2. **Python**: `3.11+` (verified with Python `3.12.8`)
3. **ffmpeg / ffprobe**: Installed and available on system `$PATH`

---

## 🔒 Security & Environment Configuration

All sensitive keys (LLM, search, database connection strings, JWT secrets) are stored **only in `.env`**. They are loaded strictly on the backend and are **never exposed to the browser** or committed to version control.

Copy the template to create your `.env`:

```bash
cp .env.example .env
```

Configuration variables in `.env`:
- `DATABASE_URL`: `sqlite:///./decisionlens.db` (or PostgreSQL `postgresql+psycopg2://...`)
- `SECRET_KEY`: Backend signing key
- `GEMINI_API_KEY`: Google Gemini API key (optional; deterministic decision models run if unset)
- `OPENAI_API_KEY`: OpenAI API key (optional)
- `TAVILY_API_KEY`: Tavily Search API key (optional)
- `NEXT_PUBLIC_API_URL`: `http://localhost:8000`

---

## 🚀 Getting Started

### 1. Database Migrations (Day One)

The database schema is managed via **Alembic**. Run migrations to bring the schema up to date:

```bash
# Activate virtual environment
source .venv/bin/activate

# Run Alembic migrations
alembic -c apps/api/alembic.ini upgrade head
```

### 2. Start the FastAPI Backend

```bash
source .venv/bin/activate
PYTHONPATH=. uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --reload
```

- API Base URL: `http://localhost:8000`
- Interactive Swagger UI: `http://localhost:8000/docs`
- Health check endpoint: `http://localhost:8000/health`
- Database read/write verification: `http://localhost:8000/health/db`

### 3. Start the Next.js Web Application

```bash
cd apps/web
npm run dev
```

- Web Dashboard: `http://localhost:3000`

---

## 🧪 Testing

Run the automated integration test suite:

```bash
source .venv/bin/activate
PYTHONPATH=. pytest tests/test_api.py -v
```

Tests verify:
- Root `/` and `/health` endpoints
- Database read and write verification `/health/db`
- Folder creation & retrieval
- Session creation
- ffmpeg audio probe and synthetic audio generation
- Speech-to-text transcript creation
- Multi-Criteria Decision Analysis (MCDA) matrix calculation and persistence

---

## 📊 Decision Frameworks

1. **MCDA (Multi-Criteria Decision Analysis):**
   - Normalizes criteria weights.
   - Computes weighted scores across all alternatives.
   - Outputs ranked choices with sensitivity breakdown.
2. **SWOT Analysis:**
   - Evaluates Strengths, Weaknesses, Opportunities, and Threats.
   - Generates actionable strategic risk mitigations.
3. **First Principles & Second-Order Thinking:**
   - Deconstructs objectives to fundamental constraints and traces downstream effects.

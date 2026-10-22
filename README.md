# DecisionLens — AI-Powered Decision Intelligence Platform

DecisionLens is a production-grade personal decision-intelligence platform that transforms unstructured thoughts, documents, and meeting audio recordings into structured analysis, evidence-backed reasoning, and an actionable roadmap.

---

## Architecture & Subsystems

| Subsystem | Technology | Port / URL | Status |
| :--- | :--- | :--- | :--- |
| **Backend** | FastAPI + Python 3.12 + SQLAlchemy | `http://localhost:8000` | Fully Verified (82/82 Tests Pass) |
| **Frontend** | Next.js 14 (App Router) + TypeScript + Tailwind CSS | `http://localhost:3000` | Fully Verified (Lint, Typecheck & Build Pass) |
| **Database** | SQLite (Dev) / PostgreSQL (Production) | `./decisionlens.db` | Foreign Keys Enabled + Cascading Deletes |
| **AI Engine** | OpenAI GPT-4o-mini / Hosted AI Service | Configurable API | Anti-Prompt Injection + Fenced Untrusted Input |
| **Search Engine**| Tavily / Serper / Mock Provider | Configurable API | Primary-source prioritization + Claim audit |

---

## Clean Setup & Deployment Instructions

### Prerequisites
- **Python 3.12+**
- **Node.js 18.x or 20.x+** and **npm 9+**
- **FFmpeg** (Optional, recommended for transcoding `.m4a` / `.mp3` audio files)

---

### 1. Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   # Windows (PowerShell): .venv\Scripts\Activate.ps1
   # Windows (CMD): .venv\Scripts\activate.bat
   ```

3. **Install dependencies:**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   *Key variables in `.env`:*
   - `JWT_SECRET`: Secret key for JWT session tokens (generate a random 32+ character string in production).
   - `DATABASE_URL`: `sqlite:///./decisionlens.db` for local SQLite or `postgresql+psycopg://user:pass@host:5432/db` for Postgres.
   - `STORAGE_DIR`: `./storage` (directory for uploaded files and audio).
   - `OPENAI_API_KEY`: OpenAI API key for structuring, gap analysis, and synthesis (falls back safely to structured mocked responses if empty).
   - `SEARCH_PROVIDER`: `tavily`, `serper`, or `mock` for external research.
   - `TAVILY_API_KEY` / `SERPER_API_KEY`: API keys for research web search.
   - `GOOGLE_SPEECH_API_KEY`: Optional key for Chromium Google Speech API fallback.

5. **Initialize Database & Start Backend Server:**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   *Tables and schema are initialized automatically on application startup.*
   - Root Health Probe: [http://localhost:8000/api/health](http://localhost:8000/api/health)
   - Interactive OpenAPI Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

6. **Run Backend Test Suite:**
   ```bash
   pytest tests/ -v
   ```

---

### 2. Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Ensure `NEXT_PUBLIC_API_URL=http://localhost:8000` points to the active FastAPI backend.

4. **Run Code Quality & Type Checks:**
   ```bash
   # Run ESLint (0 errors, 0 warnings)
   npm run lint

   # Run TypeScript strict type-checking
   npm run type-check
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```

6. **Start Frontend Server:**
   - **Development mode:**
     ```bash
     npm run dev
     ```
     Access at [http://localhost:3000](http://localhost:3000).
   - **Production mode:**
     ```bash
     npm start
     ```

---

## Security & Verification Summary

1. **User Isolation & Cross-Tenant Data Access:**
   - Every single endpoint is protected by JWT authentication via `get_current_user`.
   - All folder, decision, attachment, gap, research, framework, and roadmap records are strictly scoped to the requesting user (`user_id`).
   - Cross-user access attempts return `404 Not Found` to prevent ID enumeration and metadata leakage.
   - Moving a decision across folders strictly validates ownership of both the decision and the destination folder.

2. **Database Integrity & Cascading Deletion:**
   - SQLite enforces foreign keys via `PRAGMA foreign_keys = ON` on every connection.
   - All relationship models use `ondelete="CASCADE"` and `cascade="all, delete-orphan"`. Deleting a folder or decision cascades clean removal to all attachments, findings, gaps, research logs, framework runs, recommendations, and roadmaps.

3. **Safe File Uploads & Audio:**
   - Strict file extension whitelist (`.pdf`, `.docx`, `.txt`, `.md`, `.wav`, `.mp3`, `.m4a`, `.webm`, `.ogg`).
   - Maximum upload size enforced (25 MB default).
   - Server-side UUID generation (`uuid.uuid4().hex`) for stored files, preventing path traversal attacks and file overwrites.
   - Deleting attachments removes the physical file from disk.

4. **Prompt Injection & Untrusted Data Protection:**
   - User-supplied texts are wrapped in `<UNTRUSTED_USER_INPUT>` boundaries with strict system guardrails forbidding execution of nested instructions or system overrides.
   - Strict anti-hallucination prompts prohibit the AI engine from fabricating missing information, probabilities, or sources.

5. **Error Sanitization:**
   - Production error responses never leak internal stack traces or database structures.
   - Standard HTTP exceptions and Pydantic validation errors return structured JSON details.

---

## Completed Phases

- [x] **Phase 0:** Architecture Blueprint & Inspection
- [x] **Phase 1:** Project Scaffold, Configuration & Health Check
- [x] **Phase 2:** Database Models, Authentication, and User Isolation
- [x] **Phase 3:** Folders, Decisions, and Persistence CRUD
- [x] **Phase 4:** Document Uploads & Text Extraction (PDF, DOCX, TXT, MD)
- [x] **Phase 5:** Audio Recording, Enhancement & Bilingual (EN/HI) Transcription
- [x] **Phase 6:** Cognitive Structuring (8 Categories) & Private Feedback
- [x] **Phase 7:** Information Gap Detection & Interactive Resolution Flow
- [x] **Phase 8:** External Web Research Provider & Evidence Retrieval
- [x] **Phase 9:** 5 Thinking Frameworks (Six Hats, SWOT, Decision Matrix, 5 Whys, Decision Tree)
- [x] **Phase 10:** Decision Synthesis, Immutable Snapshots & Interactive Roadmap
- [x] **Phase 11:** Connected Frontend Workflow, Stepper, & Markdown/JSON Export
- [x] **Phase 12:** Security Audit, Quality Gate Verification & Hardening

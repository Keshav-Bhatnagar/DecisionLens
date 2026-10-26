# DecisionLens — Enterprise Decision Intelligence & Institutional Memory Platform

[![CI/CD Azure Pipeline](https://github.com/Keshav-Bhatnagar/Sem3/actions/workflows/deploy-azure.yml/badge.svg)](https://github.com/Keshav-Bhatnagar/Sem3/actions/workflows/deploy-azure.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.2-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://docker.com)
[![Azure](https://img.shields.io/badge/Azure-Container%20Apps-0078D4.svg?logo=microsoftazure&logoColor=white)](https://azure.microsoft.com)

**DecisionLens** transforms chaotic human meetings, audio recordings, and complex business documents into mathematically proven, auditable, and continuous organizational decisions. 

Unlike generic AI chatbots that hallucinate calculations and suffer from conversational amnesia, DecisionLens introduces **Epistemic Source-Grounding**, a deterministic **Multi-Attribute Utility Theory (MAUT)** mathematical decision engine with zero hallucination, and **Workspace-Scoped Precedent Chaining** so every meeting builds on the institutional memory of the last.

---

## 🌟 Key Innovations & Architecture

```
[ MULTI-MODAL INGESTION ]       [ INSTITUTIONAL MEMORY ]         [ DETERMINISTIC MATH ]
 • Web Speech API (Client)       • folder_context.py              • framework_engine.py / mcda.py
 • Azure AI Speech / FFmpeg      • Chronological Precedents       • Multi-Attribute Utility (MAUT)
 • PDF, DOCX, CSV Extractors     • 6 Inherited Dimensions         • Sensitivity Analysis (±20%)
              │                               │                               │
              └───────────────────────┬───────┴───────────────────────────────┘
                                      ▼
                        [ COGNITIVE AI PIPELINE ]
                         • ai.py (Dr. Evelyn Vance)
                         • Google Gemini 2.5 Flash / 1.5 Pro
                         • 8 Grounded Cognitive Buckets
                         • Few-Shot Contrastive Guardrails
                                      ▼
                        [ BOARDROOM PUBLISHING ]
                         • ReportLab Vector PDF Generator
                         • Executive LaTeX Summaries
                         • Jira / Notion Markdown & JSON
```

### 1. Epistemic Source-Grounding (`ai.py`)
- Strictly enforces: **What Was Said → What Was Inferred → What Is Unknown**.
- Categorizes discussions into **8 isolated cognitive buckets**: `facts`, `assumptions`, `feelings`, `pros`, `cons`, `mixed_points`, `contradictions`, and `unknowns`.
- Every fact, pro, and con includes a verbatim speaker quote (`source_statement`) and epistemic status (`confirmed_fact`, `projection`, `subjective_preference`).
- **Prompt Injection Defense**: All user texts are strictly fenced within `<UNTRUSTED_USER_INPUT>` XML boundaries.

### 2. Zero-Hallucination Mathematical Decision Engine (`framework_engine.py`)
- LLMs are decoupled from candidate ranking.
- Scoring is computed using **Multi-Attribute Utility Theory (MAUT)**:
  $$U(Option_i) = \sum_{j=1}^{n} \left(\frac{w_j}{100} \times \text{Score}_{ij}\right)$$
- Enforces strict weight normalization ($\sum w_j = 100\%$).
- **Sensitivity Analysis ($\pm 20\%$)**: Mathematically simulates criteria weight swings to identify fragile winners and calculate exact rank inversion thresholds.

### 3. Workspace-Scoped Precedent Chaining (`folder_context.py`)
- Project folders serve as continuous institutional memory containers.
- Meeting $N+1$ automatically queries the prior 5 chronological records in the workspace to inherit:
  1. **Established Facts** (eliminates redundant questioning).
  2. **Answered Gaps** (tracks empirical facts resolved previously).
  3. **Carried-Over Unknowns** (automatically brought forward into the new gap analysis).
  4. **Prior Matrix Winner** (remembers previously approved architectural paths).
  5. **Active Roadmap Milestones** (chains implementation phases).
  6. **Production Outcome Reviews** (recycles real-world lessons back into future meetings).

### 4. Autonomous Web Research (`search.py`)
- Resolves critical empirical unknowns (pricing, compliance, technical specs) using **Tavily**, **Serper (Google SERP)**, or free **DuckDuckGo** HTML search.
- Categorizes evidence by domain authority (e.g., Tier 1: `aws.amazon.com`, `rfc-editor.org`, `nist.gov`).

---

## 🛠️ Complete Technology Stack

| Tier | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 14 (App Router), React 18, TypeScript** | High-performance SSR, client components, and stateful routing. |
| **Styling & UI** | **Tailwind CSS, Lucide Icons, Headless UI** | Dark/light design system with `ModalPortal` (`z-[9999]`) decoupled from stacking contexts. |
| **Client Audio** | **Web Speech API (`webkitSpeechRecognition`)** | Zero-latency real-time microphone dictation ($0.00 cloud cost). |
| **Backend API** | **FastAPI, Uvicorn, Python 3.11** | Asynchronous REST endpoints and Server-Sent Events (SSE). |
| **Database** | **PostgreSQL (Supabase / RDS) + SQLite (Dev)** | SQLAlchemy 2.0 ORM, strict multi-tenant isolation, foreign key cascades. |
| **Cognitive AI** | **Google Gemini 2.5 Flash & 1.5 Pro, Azure OpenAI** | High-throughput structuring and executive synthesis. |
| **Audio Pipeline** | **Azure AI Speech Services, FFmpeg** | 16kHz mono PCM transcoding and multi-speaker transcription. |
| **File Parsing** | **pypdf, python-docx, pandas** | Digital text extraction with Gemini Vision OCR fallback for scanned PDFs. |
| **Reporting** | **ReportLab + TeX Live (`pdflatex`)** | Publication-grade vector PDF generation, Markdown, and JSON exports. |
| **DevOps & Cloud** | **Docker, GitHub Actions, Microsoft Azure** | Automated CI/CD pushing to GHCR and running on Azure Container Apps. |

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- **Python 3.11+**
- **Node.js 20+** and **npm 9+**
- **FFmpeg** (Recommended for audio downsampling)

---

### Option A: Run via Docker Compose (Recommended)

Start the entire full-stack environment with a single command:
```bash
docker compose up --build
```
- Frontend UI: `http://localhost:3000`
- FastAPI Backend: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`

---

### Option B: Local Manual Setup

#### 1. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate       # On Windows: .venv\Scripts\activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Run database migrations and start server
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local

# Start Next.js development server
npm run dev
```
Access the application at `http://localhost:3000`.

---

## ☁️ Production Deployment (Azure & Render)

### 1. Microsoft Azure Container Apps (Automated CI/CD)
The repository includes a production multi-stage [`Dockerfile`](./Dockerfile), [`start.sh`](./start.sh) process supervisor, and automated GitHub Actions workflow [`.github/workflows/deploy-azure.yml`](./.github/workflows/deploy-azure.yml):
1. Pushing to `main` builds a unified production container (Node 20 + Python 3.11).
2. The image is published to GitHub Container Registry (`ghcr.io`).
3. Deploy to Azure Container Apps with a single command:
   ```bash
   az containerapp create \
     --name decisionlens \
     --resource-group DecisionLensRG \
     --image ghcr.io/<your-username>/sem3:latest \
     --target-port 3000 \
     --ingress external \
     --env-vars DATABASE_URL="..." GEMINI_API_KEY="..." JWT_SECRET="..."
   ```

### 2. Render PaaS (`render.yaml`)
DecisionLens includes a complete Blueprint manifest:
- Backend Web Service (Python 3.11) with automated health probes on `/health`.
- Frontend Web Service (Node 20).
- Push to GitHub and deploy via the Render Dashboard using **Blueprints**.

---

## 🧪 Testing & Verification

DecisionLens features comprehensive automated test coverage verifying mathematical accuracy, multi-tenant security, and precedent chaining:

```bash
# Run backend test suite
cd backend
pytest tests/ -v
```

Key verified test suites:
- `test_folder_memory.py`: Multi-session chronological chaining and tenant isolation.
- `test_mcda.py`: Multi-Attribute Utility Theory (MAUT) mathematical scorecards.
- `test_research.py`: Tavily, Serper, and DuckDuckGo empirical research dispatching.
- `test_audio.py` & `test_file_parser.py`: FFmpeg transcoding and PDF/Word parsing.
- `test_report_generation.py`: Publication-grade PDF compilation integrity.

---

## 🔒 Security & Data Governance

1. **Multi-Tenant User Isolation**: Every endpoint enforces JWT token validation (`@get_current_user`). Workspaces and decision records are strictly isolated by `owner_id`.
2. **Cascading Relational Deletion**: All child entities (`attachments`, `mcda_options`, `criteria`, `gap_analyses`, `outcome_reviews`) use `ondelete="CASCADE"`, ensuring clean data removal without orphaned records.
3. **Prompt Injection & Untrusted Input Protection**: External file texts and notes are wrapped in `<UNTRUSTED_USER_INPUT>` boundaries with strict instructions forbidding prompt execution.
4. **Audit Trail**: Full provenance tracking for every fact and matrix rating back to source audio timestamps and document lines.

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

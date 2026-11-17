# LPU AI Copilot: Project Folder Structure & Responsibilities

**Document:** PROJECT_STRUCTURE.md  
**Scope:** File hierarchy, modular boundaries, and separation of concerns for the independent repository.

---

## 1. Root Repository Structure

```
lpu-ai-copilot/
├── client/                     # Chrome Extension Source Code (React 18 + TS + Vite)
├── backend/                    # Stateless AI Gateway (Python FastAPI)
├── website/                    # Showcase Landing Page & Documentation
├── docs/                       # Technical Specs, Architecture Diagrams & Viva Prep
├── docker-compose.yml          # Container orchestration for backend
├── Dockerfile                  # Production container definition for FastAPI
├── .gitignore                  # Git ignore rules for node_modules, .env, venvs
└── README.md                   # Project overview, installation, and team bio
```

---

## 2. Chrome Extension Client (`client/`)

```
client/
├── public/
│   ├── icons/                  # 16, 32, 48, 128px PNG extension icons
│   └── manifest.json           # Chrome Manifest V3 configuration
├── src/
│   ├── background/
│   │   └── service-worker.ts   # MV3 service worker, port keeper, tab listener
│   ├── content/
│   │   ├── content-script.ts   # In-page injection entry point & IPC bridge
│   │   ├── umsDetector.ts      # Page state, Cloudflare Turnstile detection
│   │   ├── umsPreflight.ts      # Campus Drive popup auto-dismissal
│   │   ├── pageObserver.ts     # Actionable DOM element harvesting & coordinate mapping
│   │   ├── actionEngine.ts     # Native DOM click and typing event dispatcher
│   │   ├── agentMotion.ts      # Cubic Bézier trajectories & human-like easing
│   │   ├── aiCursorOverlay.ts  # Visual viewport cursor and target bounding box
│   │   ├── parsers/
│   │   │   ├── attendanceParser.ts   # HTML table fraction & duty leave extractor
│   │   │   ├── dateSheetParser.ts    # Conduct card & exam schedule extractor
│   │   │   └── timetableParser.ts    # SSRS timesheet report table extractor
│   ├── sidepanel/
│   │   ├── main.tsx            # React StrictMode mounting entry point
│   │   ├── App.tsx             # Root state coordinator, tab router & view switcher
│   │   └── App.module.css      # Viewport flex containment and scroll layout
│   ├── components/
│   │   ├── AttendanceDashboard/
│   │   │   ├── AttendanceRing.tsx      # SVG percentage circle with color bands
│   │   │   ├── CourseCard.tsx          # Individual course row with bunk badge
│   │   │   └── CourseList.tsx          # Sorted courses list (lowest attendance first)
│   │   ├── Calculators/
│   │   │   ├── BunkModal.tsx           # Interactive safe bunk slider modal
│   │   │   └── RecoveryModal.tsx       # Consecutive classes target calculator
│   │   ├── Examination/
│   │   │   ├── ExamCard.tsx            # Date sheet card with venue, seat, and countdown
│   │   │   └── ExamList.tsx            # Chronological exam schedule
│   │   ├── Timetable/
│   │   │   ├── TimetableView.tsx       # Weekly class matrix with floor decoders
│   │   │   └── LeaveSimulatorModal.tsx # Compound timetable-grounded bunk simulator
│   │   ├── Chat/
│   │   │   ├── ChatView.tsx            # Chat messages stream & prompt suggestion rail
│   │   │   ├── ChatMessage.tsx         # User / Assistant message bubble
│   │   │   └── MarkdownRenderer.tsx    # Safe streaming markdown & table renderer
│   │   ├── Navigation/
│   │   │   ├── Header.tsx              # Top bar, connection badge, history toggle
│   │   │   └── DrawerHistory.tsx       # Slide-out conversation history
│   │   └── Common/
│   │       ├── Toast.tsx               # Notification toasts for action updates
│   │       └── Skeletons.tsx           # Shimmer placeholders for loading states
│   ├── services/
│   │   ├── api.ts              # Stateless backend client (Chat & Plan endpoints)
│   │   ├── localInference.ts   # Client-side deterministic fallback engine
│   │   ├── calendarExport.ts   # RFC 5545 standard .ics file generator
│   │   └── storage.ts          # chrome.storage.local wrapper for settings
│   ├── storage/
│   │   ├── db.ts               # IndexedDB database initialization & schema
│   │   └── repositories.ts     # Attendance, Exam, Timetable, and Chat Repositories
│   ├── shared/
│   │   ├── types.ts            # Domain types (Attendance, Exam, Timetable, Chat)
│   │   ├── messages.ts         # Chrome runtime IPC message protocol
│   │   └── math.ts             # Deterministic bunk allowance & recovery math
│   ├── styles/
│   │   ├── variables.css       # Academic Glassmorphism design tokens & colors
│   │   └── global.css          # Baseline CSS reset, custom scrollbars
│   └── tests/                  # Vitest unit and integration test suite
├── package.json                # Lean dependency tree
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Sidepanel build config
├── vite.background.config.ts   # Service worker build config
└── vite.content.config.ts      # Content script bundle config
```

---

## 3. Backend Gateway (`backend/`)

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS middleware, route registration
│   ├── config.py               # Pydantic Settings (.env configuration)
│   ├── agent/
│   │   ├── agent.py            # Conversational tool-calling loop (Qwen / Gemini)
│   │   ├── planner.py          # Computer Use browser action planner
│   │   ├── prompts.py          # System prompts for academic personas
│   │   └── tools.py            # Mathematical attendance tools for function calling
│   ├── schemas/
│   │   ├── chat.py             # Pydantic models for chat requests and activities
│   │   ├── planner.py          # Action models (click, type, scroll, wait, finish)
│   │   └── attendance.py       # Attendance payload validation schemas
│   ├── services/
│   │   ├── groq_service.py     # Groq Cloud API HTTP client
│   │   └── gemini_service.py   # Google Gemini Flash fallback client
│   └── voice/
│       ├── router.py           # /api/voice/transcribe and /api/voice/speak routes
│       └── service.py          # Whisper STT & Orpheus TTS handlers
├── tests/                      # Pytest suite for API endpoints and math tools
├── requirements.txt            # Python dependencies (fastapi, uvicorn, pydantic, httpx)
└── .env.example                # Clean template for API keys and port configuration
```

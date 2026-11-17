# LPU AI Copilot: 10-Phase Development Roadmap

**Document:** DEVELOPMENT_ROADMAP.md  
**Scope:** Actionable, phase-by-phase implementation schedule designed for a student group project.

---

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVELOPMENT ROADMAP PHASES                      │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Project Initialization & Extension Skeleton                   │
│ Phase 2: UMS Portal Detection & IPC Communication                      │
│ Phase 3: Attendance Extraction & Deterministic Bunk Algebra            │
│ Phase 4: Examination Schedule & SSRS Timetable Modules                 │
│ Phase 5: Stateless Backend & Token-Streaming AI Agent                  │
│ Phase 6: Computer Use Autonomous Browser Navigation                    │
│ Phase 7: Voice Subsystem (Whisper STT + Cloud TTS)                     │
│ Phase 8: Differentiating Features (Leave Simulator & .ics Export)      │
│ Phase 9: Comprehensive Testing, Hardening & Package Optimization       │
│ Phase 10: Academic Documentation, Live Demo Setup & Presentation       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Project Initialization & Extension Skeleton

- **Objective:** Establish the repository structure, Vite multi-bundle build pipeline, and Manifest V3 extension shell.
- **Tasks:**
  1. Initialize `client/` with Vite 5, React 18, and TypeScript.
  2. Configure `vite.config.ts`, `vite.background.config.ts`, and `vite.content.config.ts`.
  3. Create `manifest.json` defining side panel, permissions (`sidePanel`, `storage`, `tabs`, `scripting`), and host permissions for `ums.lpu.in`.
  4. Build minimal React side panel mounted into `sidepanel.html`.
- **Files to Create:** `client/package.json`, `client/tsconfig.json`, `client/vite.*.config.ts`, `client/public/manifest.json`, `client/src/sidepanel/main.tsx`, `client/src/sidepanel/App.tsx`.
- **Testing Criteria:** Run `npm run build`; load `client/dist/` into Chrome via `chrome://extensions`; click extension icon to verify side panel mounts cleanly.
- **Definition of Done:** Side panel renders "LPU AI Copilot Ready" with zero console warnings.

---

## Phase 2: UMS Portal Detection & IPC Communication

- **Objective:** Establish reliable two-way communication between the active UMS tab, the service worker, and the side panel.
- **Tasks:**
  1. Write `umsDetector.ts` to identify hostname, login forms, and dashboard state.
  2. Implement `umsPreflight.ts` to detect and dismiss blocking Campus Drive popups.
  3. Create `service-worker.ts` with keep-alive heartbeat port and tab activation listener.
  4. Write `useUmsConnection.ts` React hook to reflect live portal status in the side panel header.
- **Files to Create:** `client/src/content/umsDetector.ts`, `client/src/content/umsPreflight.ts`, `client/src/background/service-worker.ts`, `client/src/hooks/useUmsConnection.ts`, `client/src/shared/messages.ts`.
- **Testing Criteria:** Open `ums.lpu.in`; verify connection badge transitions from `NOT_CONNECTED` $\to$ `UMS_DETECTED` $\to$ `DASHBOARD_READY`.
- **Definition of Done:** Side panel dynamically detects active tab changes within 200ms.

---

## Phase 3: Attendance Extraction & Deterministic Bunk Algebra

- **Objective:** Extract live attendance tables from UMS and compute safe bunk allowances.
- **Tasks:**
  1. Build `attendanceParser.ts` to harvest tables, fraction strings, and duty leaves.
  2. Implement pure math library `math.ts` for safe-bunk allowance and recovery calculations.
  3. Set up IndexedDB database (`storage/db.ts`) and `repositories.ts` to cache attendance snapshots.
  4. Build UI components: `AttendanceRing.tsx`, `CourseCard.tsx`, and `BunkModal.tsx`.
- **Files to Create:** `client/src/content/parsers/attendanceParser.ts`, `client/src/shared/math.ts`, `client/src/storage/db.ts`, `client/src/storage/repositories.ts`, `client/src/components/AttendanceDashboard/*`, `client/src/components/Calculators/*`.
- **Testing Criteria:** Write Vitest unit tests verifying $\lfloor (A - 0.75D)/0.75 \rfloor$ across 20 numerical edge cases. Verify parsing of mock UMS attendance HTML.
- **Definition of Done:** Attendance percentages, safe bunk allowances, and lowest-course warnings render accurately on the dashboard.

---

## Phase 4: Examination Schedule & SSRS Timetable Modules

- **Objective:** Extract and display examination dates, seat numbers, and weekly class timetables.
- **Tasks:**
  1. Write `dateSheetParser.ts` to extract course codes, exam dates, timings, and MCQ breakdown.
  2. Implement `timetableParser.ts` to normalize SSRS weekly timetable matrices into structured day slots.
  3. Add room decoder: maps room code strings (e.g. `34-204`) into building and floor directions.
  4. Build `ExamCard.tsx` with upcoming countdown and `TimetableView.tsx`.
- **Files to Create:** `client/src/content/parsers/dateSheetParser.ts`, `client/src/content/parsers/timetableParser.ts`, `client/src/components/Examination/*`, `client/src/components/Timetable/*`.
- **Testing Criteria:** Unit test with real UMS SSRS timetable HTML fixture; assert all class slots, rooms, and subject codes parse without error.
- **Definition of Done:** Both exam date sheet and weekly timetable cards render in the side panel.

---

## Phase 5: Stateless Backend & Token-Streaming AI Agent

- **Objective:** Stand up the FastAPI backend and integrate high-speed token streaming via Groq Cloud or Gemini Flash.
- **Tasks:**
  1. Scaffold FastAPI app with CORS middleware and Pydantic schemas.
  2. Implement `agent.py` tool-calling loop connecting Groq `qwen/qwen3.8-27b` with attendance math tools.
  3. Create progressive SSE streaming endpoint (`POST /api/chat/stream`).
  4. Implement `SmoothTokenPacer.ts` and `ChatView.tsx` in the side panel for silky smooth token rendering.
- **Files to Create:** `backend/app/main.py`, `backend/app/config.py`, `backend/app/agent/agent.py`, `backend/app/agent/prompts.py`, `backend/app/agent/tools.py`, `client/src/services/api.ts`, `client/src/components/Chat/*`.
- **Testing Criteria:** Pytest suite verifies chat endpoint returns valid SSE chunks; side panel renders typed output with zero perceptible lag.
- **Definition of Done:** Natural language queries like *"How many classes can I bunk in CSE329?"* stream exact grounded answers in under 1 second.

---

## Phase 6: Computer Use Autonomous Browser Navigation

- **Objective:** Enable the agent to autonomously navigate UMS on the student's behalf.
- **Tasks:**
  1. Implement `pageObserver.ts` to assign spatial IDs (`copilot-xxx`) and harvest interactive DOM bounding boxes.
  2. Build `agentMotion.ts` with cubic Bézier trajectory generator and human-like easing.
  3. Build `aiCursorOverlay.ts` to render visual cursor animations on the host tab.
  4. Write `planner.py` in the backend to decide next browser actions (click, scroll, wait, finish).
- **Files to Create:** `client/src/content/pageObserver.ts`, `client/src/content/agentMotion.ts`, `client/src/content/aiCursorOverlay.ts`, `client/src/content/actionEngine.ts`, `backend/app/agent/planner.py`.
- **Testing Criteria:** Trigger *"Navigate to Date Sheet"*; verify visual cursor glides across the screen and clicks the link accurately.
- **Definition of Done:** End-to-end autonomous navigation successfully opens the date sheet from the dashboard.

---

## Phase 7: Voice Subsystem (Whisper STT + Cloud TTS)

- **Objective:** Add low-latency spoken Q&A with barge-in interruption.
- **Tasks:**
  1. Create `offscreen.html` and `offscreen.ts` for microphone capture and audio playback.
  2. Implement backend endpoints: `POST /api/voice/transcribe` (Whisper) and `POST /api/voice/speak` (Orpheus).
  3. Implement barge-in: speaking or clicking cancels active audio playback immediately.
- **Files to Create:** `client/public/offscreen.html`, `client/src/offscreen/offscreen.ts`, `backend/app/voice/router.py`, `backend/app/voice/service.py`, `client/src/services/voiceController.ts`.
- **Testing Criteria:** Speak a query into the mic; verify transcribed text appears in chat input and spoken answer plays back clearly.
- **Definition of Done:** Complete push-to-talk voice conversation loop operational.

---

## Phase 8: Differentiating Features (Leave Simulator & .ics Export)

- **Objective:** Implement unique academic features that elevate the project above reference solutions.
- **Tasks:**
  1. **Timetable-Grounded Leave Simulator:** Cross-reference scheduled classes on a selected weekday with live course attendance to calculate compound post-leave percentages.
  2. **iCalendar Sync:** Build `calendarExport.ts` producing standard `.ics` files containing all exam dates and timetable slots for Google/Apple Calendar.
  3. Add UI modal and export buttons in side panel.
- **Files to Create:** `client/src/services/calendarExport.ts`, `client/src/components/Timetable/LeaveSimulatorModal.tsx`.
- **Testing Criteria:** Export `.ics` file; import into Google Calendar; verify exam timings and room locations match UMS exactly.
- **Definition of Done:** Student can simulate skipping Friday and download their exam schedule with one click.

---

## Phase 9: Comprehensive Testing, Hardening & Package Optimization

- **Objective:** Achieve full test coverage, purge dead code, and package a production-grade ZIP under 2.5 MB.
- **Tasks:**
  1. Run complete Vitest suite (aiming for $\ge 50$ unit/integration tests).
  2. Run backend Pytest suite.
  3. Audit `package.json` to ensure zero unused dependencies.
  4. Write automated packaging script (`package_extension.py`) validating Manifest V3 assets.
- **Files to Create:** `client/scripts/package_extension.py`, `client/tests/**/*.test.ts`, `backend/tests/**/*.py`.
- **Testing Criteria:** All tests pass with 0 failures; packed ZIP size is $\le 2.5\text{ MB}$.
- **Definition of Done:** Production-ready extension ZIP generated in `client/dist/`.

---

## Phase 10: Academic Documentation, Live Demo Setup & Presentation

- **Objective:** Prepare comprehensive documentation and demonstration assets for evaluation.
- **Tasks:**
  1. Compile final project report covering architecture, algorithms, and privacy guarantees.
  2. Create interactive offline demo mode (using mock HTML fixtures) for resilient live presentation.
  3. Prepare viva defence questions and answers matrix.
- **Files to Create:** `docs/PROJECT_REPORT.md`, `docs/VIVA_PREPARATION.md`, `website/index.html`.
- **Definition of Done:** Project is packaged, documented, and ready for viva demonstration.

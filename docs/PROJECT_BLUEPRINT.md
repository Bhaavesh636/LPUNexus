# LPU AI Copilot: Complete Technical Specification & Master Blueprint

**Document Version:** 1.0.0  
**Target Platform:** Google Chrome (Manifest V3)  
**Target Environment:** Lovely Professional University Management System (`ums.lpu.in` / `studentums.lpu.in`)  
**Project Objective:** Build an independent, privacy-first, autonomous academic copilot and browser side panel extension for university students.

---

## 1. Executive Summary & Project Vision

The **LPU AI Copilot** is a next-generation browser extension built on Chrome Manifest V3. Operating inside the Chrome Side Panel alongside active student sessions on LPU UMS, it automates tedious portal navigation, deterministically tracks academic attendance, calculates exact attendance margins, maps examination venues and seat assignments, visualizes weekly SSRS timetables, and provides a conversational AI assistant.

### Foundational Principles
1. **Zero-Knowledge Privacy:** Student credentials, authentication cookies, and session tokens are **never** harvested, stored, or transmitted to any server. All persistent student data lives exclusively in on-device **IndexedDB**.
2. **Deterministic Arithmetic Over Hallucination:** Academic attendance and safe-bunk allowances are calculated using verified algebraic formulas, never inferred probabilistically by an LLM.
3. **Resilient Hybrid Perception:** Portal state and UI elements are harvested using a multi-tiered DOM perception pipeline (semantic IDs, class heuristics, XPath, and coordinate geometry), ensuring operation across portal layout updates.
4. **Autonomous Computer Use with Safe Fallbacks:** Actions (clicks, scrolling, modal navigation) use human-like cubic Bézier curves and visual cursor overlays with strict client-side verification before executing subsequent steps.
5. **Ultra-Lightweight Footprint:** The extension core is engineered to be under 2.5 MB, eliminating bloat and dead dependencies.

---

## 2. Core Capability Classification (Feature Prioritization)

To manage group development and ensure an incremental delivery pipeline, capabilities are classified into three distinct tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FEATURE PRIORITIZATION TIERS                      │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 1: ESSENTIAL (MVP - First Working Release)                        │
│ - Manifest V3 Chrome Side Panel & Service Worker Lifecycle             │
│ - Live UMS Host Detection (Active Tab, Login Page, Dashboard)         │
│ - Preflight Recruitment Modal Auto-Dismissal ("Remind me later")       │
│ - Deterministic Attendance Extraction from UMS Modal / Tables          │
│ - Safe Bunk & Attendance Recovery Calculator (Exact Math Engine)       │
│ - Course-Wise Progress Cards with Lowest Attendance Warning Highlights │
│ - On-Device IndexedDB Storage (No External Database Required)          │
│ - Basic Text Chat Assistant with Local Heuristic Fallback              │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 2: IMPORTANT (Complete Academic Submission)                       │
│ - Fast Token-Streaming AI Reasoning (FastAPI + Groq / Gemini API)      │
│ - Examination Date Sheet Extraction (Timings, Seat Status, MCQ Pattern)│
│ - SSRS Weekly Timetable Parser with Floor & Block Spatial Formatting   │
│ - Timetable-Grounded Leave Planner ("Can I bunk Friday?")              │
│ - Autonomous Navigation Agent (Bézier Cursor Simulation on UMS)        │
│ - One-Click Calendar Sync (.ics export for Timetable & Exams)          │
│ - Ephemeral Conversation History Drawer & Local Search                 │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 3: OPTIONAL ENHANCEMENTS (Future Release)                         │
│ - Real-Time Low-Latency Voice Interaction (Whisper STT + Cloud TTS)    │
│ - Campus Recruitment Placement Drive Aggregator & Eligibility Tracker  │
│ - Multi-Provider Fallback Gateway (Groq Cloud + Free Google Gemini)   │
│ - Semester CGPA & Internal Marks Target Predictor                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Reverse-Engineered Reference Analysis (Key Learnings)

The blueprint incorporates key lessons reverse-engineered from the reference implementation (`ONEE / LPU UMS Agent`):

### A. UMS Portal Idiosyncrasies
1. **ASP.NET Session & Modal Structures:** UMS frequently presents modal dialogs (`div.modal`, iframe popups) rather than distinct URLs. Content scripts must monitor DOM mutations rather than relying on URL navigation events.
2. **Blocking Campus Drive Popups:** On student login, a persistent recruitment modal appears. If not dismissed via its specific *"Remind me later"* button, background content scripts cannot access underlying dashboard elements.
3. **Attendance Fractions & Duty Leaves:** Attendance tables render attended and delivered classes as fractions (e.g. `38/45`) with separate columns for Duty Leave (DL) and Medical Leave. Formulas must credit approved duty leaves to attended counts.
4. **SSRS Timetable Hierarchies:** Timetables are rendered by Microsoft SQL Server Reporting Services (SSRS). They feature merged table headers, empty filler cells, and combined course-faculty cells (e.g., `CSE329\nDr. John Doe\n34-201`). Parsers must use cell-splitting regex rather than simple text queries.

### B. Architectural Refinements over Reference
- **Decouple the Monolithic API Service:** The reference implementation accumulated 2,680+ lines in `api.ts`. The new architecture separates network transport, local heuristics, and intent classification into distinct services.
- **Eliminate Unused Dependencies:** The reference included 34.2 MB of unused Kokoro voice weights and unimported packages (`framer-motion`, `lucide-react`). The new blueprint uses native browser animations and lightweight Lucide icons.
- **Bridge Attendance with Timetables:** The reference treated attendance and timetables as independent features. The new blueprint unites them in a **Timetable-Grounded Leave Simulator**.

---

## 4. System Component Specifications

The system comprises three independent, loosely coupled subsystems:

1. **Browser Extension Frontend (`client/`)**:
   - `sidepanel/`: React 18 + TypeScript SPA running inside Chrome Side Panel.
   - `content/`: Content scripts injected into `*://ums.lpu.in/*` and `*://*.lpu.in/*`.
   - `background/`: Manifest V3 Service Worker managing lifecycle, alarms, and tab IPC.
   - `storage/`: IndexedDB repository abstraction for client-side persistence.
2. **Stateless AI Gateway (`backend/`)**:
   - Python FastAPI application exposing token-streaming SSE and REST endpoints.
   - Zero-database architecture; receives grounded DOM summaries in each request payload.
   - Strict credential boundary between reasoning models and voice synthesis.
3. **Product Landing & Documentation Website (`website/`)**:
   - Static HTML5/CSS3 site with SVG interactive architecture diagrams and direct `.zip` downloads.

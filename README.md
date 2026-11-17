# LpuNexus

> **Important Notice:** LpuNexus is currently an **early-stage WORKING PROTOTYPE**, not a finished product. Features are being developed and tested incrementally.

---

## 1. Project Overview

**LpuNexus** is a privacy-first, on-device academic copilot Chrome and Brave browser extension specifically designed for students at Lovely Professional University (LPU).

### The Problem It Aims to Solve
LPU students frequently interact with the University Management System (UMS — `ums.lpu.in` / `studentums.lpu.in`) to monitor attendance thresholds, access weekly schedules, check examination dates, and handle university announcements. However, navigating complex nested menus, unexpected portal session expirations, and repetitive popups creates friction for daily academic tracking.

LpuNexus operates seamlessly in the browser's native **Side Panel**, running alongside active UMS tabs to provide instant visibility, safe automation, and grounded academic assistance — while ensuring student data never leaves their local device.

---

## 2. Current Status

LpuNexus is an **early-stage working prototype under active development**. 

Phase 1 (Extension Skeleton & Design System) and Phase 2 (UMS Portal Detection & IPC Communication) are complete and verified. The extension connects to live browser tabs, detects portal state changes, and runs safely without interfering with Cloudflare security challenges or login credentials.

---

## 3. Currently Implemented Features

- **Manifest V3 Architecture:** Built natively on Chromium's Manifest V3 specifications with minimal permissions (`sidePanel`, `storage`, `tabs`) and scoped host permissions.
- **Native React Side Panel:** High-performance, lightweight UI mounted in the native browser side panel via `@vitejs/plugin-react`.
- **Dual-Theme Design System with Persistence:** Warm Cream light theme (`#FAF3EC`) and deep slate dark theme (`#151922`) with Strong Terracotta accents (`#C66A32`). Remembers user preference across sessions via `chrome.storage.local`.
- **One-Click Toolbar Access:** Configured with `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the pinned extension icon immediately opens the side panel.
- **UMS Login Page Detection:** Reliably identifies ASP.NET authentication controls and prevents false-positive dashboard states.
- **Passive Cloudflare Verification Detection:** Detects Turnstile and Managed Challenge screens strictly from host page-level markers. **Never attempts to solve, click through, or bypass challenges**, maintaining strict passivity until human verification completes.
- **Authenticated Dashboard Detection:** Multi-signal DOM inspection confirming active student sessions through corroborating navigation, logout controls, and workspace elements.
- **Live Tab & Window Connection Tracking:** Service worker dynamically tracks active tabs (`tabs.onActivated`, `tabs.onUpdated`, `tabs.onRemoved`). The side panel connects via long-lived port (`nexus_sidepanel`) and updates connection status badges within 200ms when switching between UMS and non-UMS tabs.
- **Safe Campus Drive Preflight Modal Handling:** Automatically targets and dismisses recurring "Campus Drive" popup dialogs by strictly clicking the *"Remind me later"* button, completely isolated from login or submission controls.
- **Strongly-Typed IPC Communication:** Full TypeScript discriminated-union message protocol connecting the Content Script, Background Service Worker, and Side Panel with monotonic message sequencing (`seq`) and unique session UUID validation.

---

## 4. Current Limitations

Please note the following limitations in the current prototype:

- **Attendance Extraction is NOT implemented yet.** (Scheduled for Phase 3).
- **Examination Schedule and Timetable extraction are NOT implemented yet.** (Scheduled for Phase 4).
- **Backend server and AI assistant integration are NOT implemented yet.** (Scheduled for Phase 5).
- **Computer-use autonomous navigation and voice capabilities are NOT implemented yet.** (Scheduled for Phases 6 and 7).
- The side panel currently displays prototype connection badges, active tab metadata, and preflight notifications. It does not yet display parsed academic records.

---

## 5. Technology Stack

- **Platform:** Google Chrome / Brave Browser Extension (Manifest V3)
- **Frontend Framework:** React 18.3, ReactDOM 18.3
- **Language:** TypeScript 5.6 (Strict Mode enabled, zero unsafe assertions)
- **Build System:** Vite 5.4 (Coordinated multi-target compilation for Side Panel, ES Service Worker, and IIFE Content Script)
- **Styling:** CSS Modules with Native CSS Custom Properties (Theme tokens)
- **Testing:** Node.js 24 Native Test Runner (`node:test`, `node:assert/strict`) bundled with `esbuild`
- **APIs:** Chrome Extensions API (`chrome.sidePanel`, `chrome.storage`, `chrome.tabs`, `chrome.runtime`)

---

## 6. Project Structure

```
LpuNexus/
├── client/                     # Chrome Extension frontend & background
│   ├── public/                 # Static extension assets (manifest.json, icons)
│   ├── src/
│   │   ├── background/         # Service worker & multi-window state orchestrator
│   │   ├── content/            # Content scripts (umsDetector, umsPreflight)
│   │   ├── hooks/              # useUmsConnection custom React lifecycle hook
│   │   ├── shared/             # Typed IPC contracts (messages.ts, types.ts)
│   │   └── sidepanel/          # React Side Panel application (App.tsx, styles)
│   ├── tests/                  # Unit & integration test suites
│   ├── scripts/                # Test runner and build utilities
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.*.config.ts        # Sidepanel, background, and content build configs
├── docs/                       # Technical blueprints and specifications
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── FEATURE_SPECIFICATION.md
│   └── PLANNED_FEATURES.md
├── .gitignore
└── README.md
```

---

## 7. Installation & Build Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) >= 18.0.0 (Node 22 or 24 recommended)
- `npm` >= 9.0.0
- Google Chrome or Brave Browser

### 1. Build the Extension
```bash
# Navigate to the client directory
cd client

# Install dependencies
npm install

# Run automated tests (48 unit & integration tests)
npm test

# Run strict TypeScript typecheck
npm run typecheck

# Build extension bundles
npm run build
```

The compiled extension files will be output to `client/dist/`.

### 2. Load into Brave or Chrome
1. Open your browser and navigate to:
   - **Brave:** `brave://extensions`
   - **Chrome:** `chrome://extensions`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `D:\Projects\LpuNexus\client\dist` directory.
5. Pin **LpuNexus** to your browser toolbar.
6. Click the LpuNexus icon to open the native Side Panel.

---

## 8. Future Development Roadmap

Development follows the authoritative roadmap detailed in [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md):

- **Phase 1: Project Initialization & Extension Skeleton** — *(Completed)*
- **Phase 2: UMS Portal Detection & IPC Communication** — *(Completed)*
- **Phase 3: Attendance Extraction & Deterministic Bunk Algebra** — Parsing live attendance tables, duty leave recovery math, and safe bunk calculations.
- **Phase 4: Examination Schedule & SSRS Timetable Modules** — Seating plan extraction, exam countdowns, SSRS weekly schedule normalization, and room navigation.
- **Phase 5: Stateless Backend & Token-Streaming AI Agent** — FastAPI streaming backend with grounded token streaming (Groq Cloud / Gemini Flash) with strict zero-knowledge privacy.
- **Phase 6: Computer Use Autonomous Browser Navigation** — Visual AI cursor overlay, spatial DOM targeting, and assisted portal navigation.
- **Phase 7: Voice Subsystem** — Push-to-talk spoken Q&A with Whisper STT and low-latency audio playback.
- **Phase 8: Differentiating Features** — Timetable-grounded leave simulator and one-click `.ics` calendar export for Google and Apple Calendar.
- **Phase 9: Comprehensive Testing & Package Optimization** — End-to-end hardening and production bundle packaging.
- **Phase 10: Academic Documentation & Presentation** — Project defense documentation, viva preparation matrix, and offline interactive demo mode.

---

## 9. License & Disclaimer

This project is an independent academic prototype developed for Lovely Professional University students. It is not officially affiliated with or endorsed by Lovely Professional University. All product and university names are trademarks of their respective holders.

# LpuNexus: Central Feature Backlog

**Document Version:** 1.1.0  
**Last Updated:** Phase 2 (Step 9 — Final Verification)  
**Scope:** Central tracking backlog for all planned, in-progress, completed, deferred, and future features for LpuNexus.

---

## 1. Planned Features

### Native Browser Password Manager Compatibility
- **Description:** Verify that Brave and Chrome's native password managers work with the existing UMS login form. Do not modify the university's login form attributes unless a compatibility issue is discovered and separately approved.
- **Priority:** High
- **Status:** Planned
- **Target Phase:** Phase 3+
- **Dependencies / Prerequisites:** Manifest V3 content script injection on `ums.lpu.in` and `studentums.lpu.in`.
- **Implementation Notes:** In-extension custom password storage is strictly excluded for security. LpuNexus does not collect, capture, or store student passwords in `chrome.storage.local`. The extension ensures that third-party DOM scripts or modals do not block the browser's native autofill prompts.

---

## 2. In Progress (Phase 3: DOM Data Extraction Engine)

*Phase 3 planning and implementation will commence upon explicit approval.*

---

## 3. Completed Features

### Manifest V3 Chrome/Brave Extension Skeleton
- **Description:** Foundational Chrome Manifest V3 extension structure supporting the Chrome Side Panel API, service worker lifecycle, and content script injection.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 1
- **Dependencies / Prerequisites:** Node.js, npm, Vite 5.
- **Implementation Notes:** Configured with minimal permissions (`"sidePanel"`, `"storage"`, `"tabs"`) and exact host permissions matching `*://ums.lpu.in/*` and `*://studentums.lpu.in/*`.

### Multi-Target Vite Compilation Toolchain
- **Description:** Three coordinated Vite build configurations compiling the Side Panel SPA, ES-module Background Service Worker, and self-contained IIFE Content Script.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 1
- **Dependencies / Prerequisites:** Vite 5, `@vitejs/plugin-react`.
- **Implementation Notes:** `vite.config.ts` clears `dist/` and compiles the React SPA; `vite.background.config.ts` and `vite.content.config.ts` append their bundles with `emptyOutDir: false`. Entire unpacked extension bundle is under 160 KB.

### Visual Identity: Warm Cream + Strong Terracotta (Dual Theme)
- **Description:** Custom design system built with CSS variables featuring a Warm Cream light mode (`#FAF3EC`, `#F8EEE5`, `#FFFAF5`) and preserved dark mode (`#151922`, `#202633`) paired with Strong Terracotta accents (`#C66A32` / `#E08A50`).
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 1
- **Dependencies / Prerequisites:** CSS Modules, `variables.css`.
- **Implementation Notes:** Complete exclusion of heavy third-party UI/animation libraries (`lucide-react`, `framer-motion`). Employs lightweight, accessible inline SVGs with increased visual weight (2.2–2.4px strokes). Exceeds WCAG AA contrast standards.

### Theme Persistence via `chrome.storage.local`
- **Description:** Instant light/dark theme toggle in the Nexus Bar with persistence across side-panel open/close sessions.
- **Priority:** Medium
- **Status:** Completed
- **Target Phase:** Phase 1
- **Dependencies / Prerequisites:** `chrome.storage.local`.
- **Implementation Notes:** Default theme is light (Warm Cream). Theme updates `data-theme` on `<html>` with immediate CSS variable transitions.

### One-Click Native Side-Panel Opening
- **Description:** Pinned toolbar action icon click directly opens the LpuNexus side panel without navigating through secondary extension menus.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 1 / Phase 2
- **Dependencies / Prerequisites:** `chrome.sidePanel.setPanelBehavior`, `"action"` manifest key.
- **Implementation Notes:** Registered at service worker initialization with `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` for seamless one-click invocation in Brave and Chromium.

### UMS Portal Page-State Detection Engine
- **Description:** Deterministic multi-signal DOM inspection identifying live portal lifecycle states: `LOGIN_PAGE`, `CLOUDFLARE_VERIFICATION`, `DASHBOARD_READY`, `ATTENDANCE_MODAL_MOUNTED`, `EXAMINATION_PAGE`, `TIMETABLE_PAGE`, and `UNKNOWN`.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 2
- **Dependencies / Prerequisites:** Phase 1 Manifest V3 content script skeleton.
- **Implementation Notes:** Avoids relying solely on URL matching. Combines form inputs, navigation anchors, student registration headers, and modal wrappers with a debounced (150ms) `MutationObserver`.

### Cloudflare Verification-State Detection & Passive Safety Guard
- **Description:** Passive detection of Cloudflare Turnstile and Managed Challenge verification screens using host page-level markers without accessing cross-origin iframes.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 2
- **Dependencies / Prerequisites:** UMS page detector (`umsDetector.ts`).
- **Implementation Notes:** Strictly respects the Same-Origin Policy (SOP). The content script never inspects `contentDocument` or `contentWindow` within Cloudflare iframes. Inspects only host-level element attributes (`iframe[src*="challenges.cloudflare.com"]`) and host container wrappers (`#challenge-running`, `#cf-turnstile`, `.ray-id`). When active, all automated DOM interactions are inhibited to prevent bot-flagging.

### Preflight Recruitment Modal Auto-Dismissal
- **Description:** Automated identification and dismissal of blocking campus recruitment dialogs (e.g. Campus Drive popups) appearing over the student dashboard upon login.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 2
- **Dependencies / Prerequisites:** UMS page detector; authenticated `DASHBOARD_READY` state.
- **Implementation Notes:** Targets exclusively the specific *"Remind me later"* button. Strictly isolated from login, submit, or security-challenge controls. De-duplicates actions via memory sets.

### Typed IPC Communication Architecture
- **Description:** Strongly-typed message-passing contract connecting the Content Script, Background Service Worker, and React Side Panel using TypeScript discriminated unions.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 2
- **Dependencies / Prerequisites:** Chrome Extension messaging APIs (`chrome.runtime.sendMessage`, `chrome.runtime.Port`).
- **Implementation Notes:** Two-phase window binding handshake with separate error boundaries (`WINDOW_NOT_FOUND` vs tab states); monotonic sequence numbers (`seq`); session UUID adoption; top-level frame validation (`frameId === 0`); canonical document-to-tab URL correspondence validation; active-tab association guards for preflight notifications.

### Live Side-Panel Connection Status Hook (`useUmsConnection`)
- **Description:** Reusable React hook for the side panel that dynamically tracks the active UMS tab and renders contextual connection badges in the Nexus Bar.
- **Priority:** High
- **Status:** Completed
- **Target Phase:** Phase 2
- **Dependencies / Prerequisites:** Typed IPC message protocol (`messages.ts`).
- **Implementation Notes:** Full React Strict Mode lifecycle resilience (active instance ref, generation tracking ref, mirror active tab ref). Unified exponential retry schedule (`1s, 2s, 4s, 8s, 8s`). Validates required integer `windowId >= 0`. Filters preflight notifications by active tab and window ownership. Synchronizes `PortalStatus.Error` on background error dispatch. Exposed `manualReconnect()` callback for user retry.

---

## 4. Deferred Features

### Floating-Arrow Companion Interface
- **Description:** A collapsible in-page companion overlay. When expanded, LpuNexus displays its normal interface. Clicking a small arrow collapses it into a minimal floating arrow anchored to the edge of the UMS page, which can be clicked to re-expand the panel.
- **Priority:** Medium
- **Status:** Deferred
- **Target Phase:** Post-Phase 10 Release
- **Dependencies / Prerequisites:** Complete 10-phase roadmap completion; content script in-page DOM injection engine; IPC coordination with native side panel.
- **Implementation Notes:** The native browser side panel cannot be resized programmatically below Chromium's minimum viewport width. This feature requires a dedicated in-page floating trigger element injected via content script that communicates with the extension runtime.

### General-Purpose UMS Intelligence Agent
- **Description:** An autonomous, natural-language academic intelligence agent capable of arbitrary browsing, searching, and extracting academic notices, course syllabi (e.g. CSE211), faculty contact info, and university circulars across UMS.
- **Priority:** Low
- **Status:** Deferred
- **Target Phase:** Post-Phase 10 Release
- **Dependencies / Prerequisites:** Completion of all 10 roadmap phases; backend agent reasoning loop; multi-page autonomous navigation engine.
- **Implementation Notes:** Explicitly deferred. Not to be planned, scaffolded, or implemented during the current 10-phase roadmap.

---

## 5. Future Ideas (Unapproved / Exploratory)

### Optional Local Registration-Number Memory
- **Description:** An opt-in convenience setting allowing students to store their non-sensitive registration number locally in `chrome.storage.local` to pre-populate the username field on `Login.aspx`.
- **Priority:** Low
- **Status:** Unapproved Future Idea
- **Target Phase:** TBD (Requires explicit approval)
- **Dependencies / Prerequisites:** Phase 2 login detection; user consent modal.
- **Implementation Notes:** Strictly non-sensitive registration numbers only. Passwords will **never** be stored by the extension; password management remains exclusively with the browser's hardware-encrypted vault.

### Multi-Provider Fallback AI Gateway
- **Description:** Automatic fallback routing from primary Groq Cloud inference to free-tier Google Gemini 1.5 Flash when API quotas or rate limits (HTTP 429) are encountered.
- **Priority:** Low
- **Status:** Future Idea
- **Target Phase:** Phase 5 (Backend Integration)
- **Dependencies / Prerequisites:** FastAPI backend gateway, Groq and Gemini API keys.
- **Implementation Notes:** Configured statelessly on the backend without retaining student data.

### Semester CGPA & Internal Marks Target Predictor
- **Description:** Predictive academic calculator forecasting final semester grades based on continuous evaluation (CA), mid-term exam marks, and target grade thresholds.
- **Priority:** Low
- **Status:** Future Idea
- **Target Phase:** Post-Roadmap
- **Dependencies / Prerequisites:** Phase 3 attendance and marks extraction pipeline.
- **Implementation Notes:** Pure client-side arithmetic engine.

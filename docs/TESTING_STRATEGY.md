# LPU AI Copilot: Testing Strategy & Verification Plan

**Document:** TESTING_STRATEGY.md  
**Scope:** Test automation, mock fixtures, regression defense, security validation, and offline viva demonstration.

---

## 1. Testing Pyramid Overview

```
                 / \
                /   \
               / E2E \       Playwright for Chrome Extensions
              /───────\      (Full browser lifecycle & DOM navigation)
             /  Integ  \     Vitest + React Testing Library + Fake-IndexedDB
            /───────────\    (IPC bridge, IndexedDB stores, SSE streams)
           /    Unit     \   Vitest (TypeScript) + Pytest (Python)
          /───────────────\  (Bunk algebra, DOM parsers, schema validators)
```

---

## 2. Unit Testing Strategy

### A. Frontend Mathematical Invariants (`client/src/tests/math.test.ts`)
The core arithmetic of safe bunks and recovery classes must be mathematically verified across all boundary conditions:
- **Baseline Case:** Attended = 30, Delivered = 35 ($85.71\%$) $\to$ Safe Bunk Allowance = 5 classes.
- **Exact Boundary Case:** Attended = 15, Delivered = 20 ($75.00\%$) $\to$ Safe Bunk Allowance = 0 classes.
- **Below Boundary Case:** Attended = 14, Delivered = 20 ($70.00\%$) $\to$ Safe Bunk Allowance = 0; Recovery Classes = 2.
- **Zero Classes Case:** Attended = 0, Delivered = 0 $\to$ Attendance = $100.0\%$, Bunk = 0, Recovery = 0.
- **Target Customization:** Verify threshold changes (e.g., Target = $80.0\%$, Target = $90.0\%$).

### B. DOM Parsing Robustness with HTML Fixtures
University portals frequently change minor CSS classes. Unit tests must run deterministic HTML fixtures through the parser:
- `fixtures/umsDashboard.html`: Verifies detection of student registration number and name.
- `fixtures/umsAttendanceTable.html`: Verifies multi-row extraction, fraction formats (`38/45`), and duty leave additions.
- `fixtures/umsTimetableSSRS.html`: Verifies complex SSRS table with merged headers and multi-faculty blocks.
- `fixtures/umsSeatingPlan.html`: Verifies seat status detection (`"Awaited"` vs `"Allocated"`).

### C. Backend API & Tool Execution (`backend/tests/`)
- `test_tools.py`: Tests all Python mathematical tool counterparts (`calculate_bunk_allowance_math`, `calculate_required_classes_math`).
- `test_api.py`: Uses `httpx.AsyncClient` with `ASGITransport` to verify `/health`, `/api/chat`, and `/api/plan-action` endpoints.
- `test_streaming.py`: Asserts SSE chunk structures yield valid JSON payloads ending in `[DONE]`.

---

## 3. Integration Testing & Mocking

### A. IndexedDB Persistence Testing (`fake-indexeddb`)
To verify data persistence without a live browser:
- Use `fake-indexeddb` inside JSDOM environment.
- Test that `VerifiedAttendanceRepository` stores and retrieves snapshots by registration number.
- Test the 30-record retention cap on `AgentHistoryRepository` to ensure old traces are automatically purged.

### B. IPC Messaging Simulation
Simulate `chrome.runtime.Port` and `chrome.tabs.sendMessage` to ensure:
- Content script dispatches `UMS_PAGE_DETECTED` correctly.
- Background worker correctly routes payload to active Side Panel port.
- Heartbeat ping/pong messages occur every 25 seconds without throwing errors.

---

## 4. Edge Cases & Boundary Matrix

| Scenario | Anticipated Risk | Guard Implementation |
|---|---|---|
| **Cloudflare Challenge** | Automated clicks flag bot detection | Guard enters passive wait; disables AI cursor until challenge passes. |
| **Silent Session Expiry** | UMS redirects to login page in background | Watchdog detects login DOM, halts DOM polling, and alerts student. |
| **Zero Classes Delivered** | Division by zero in attendance calculation | Guard clause defaults percentage to $100.0\%$ and bunks to $0$. |
| **Irregular SSRS Cell Split** | Malformed strings crash timetable parser | Regex fallback extracts room digits (`\d{1,2}-\d{2,3}`) independently. |
| **Groq API Rate Limit (429)** | Chat fails during demo | Automatic fallback to local deterministic heuristic engine. |
| **Audio Playback Blocked** | Browser blocks unprompted audio autoplay | Voice playback is strictly tied to explicit user mic click. |

---

## 5. Security & Manifest V3 Compliance Audit

1. **CSP Integrity:** Ensure `extension_pages` contains zero references to `eval()` or `unsafe-eval` (except `'wasm-unsafe-eval'` if running local WebAssembly).
2. **Zero Storage Leaks:** Enforce automated linter check forbidding `window.localStorage` inside `client/src/content/`.
3. **Host Permission Minimization:** Limit matches strictly to `*://ums.lpu.in/*` and `*://*.lpu.in/*`.
4. **Credential Isolation:** Confirm zero API keys are bundled into client-side JS bundles.

---

## 6. Academic Viva & Live Demonstration Strategy

Live university portals can be unpredictable during presentations (server downtime, slow Wi-Fi, maintenance windows). To guarantee a flawless live demo:

### The "Resilient Demo Architecture"
1. **Live Mode:** Connects to live `ums.lpu.in` tab and remote FastAPI server.
2. **Offline Simulation Mode (Demo Safety Net):**
   - The extension includes a hidden demo toggle in the settings modal.
   - When enabled, the content script mounts the pre-verified local HTML fixtures (`fixtures/umsRealDashboard.html`) in an offline sandbox.
   - The side panel uses `localInference.ts` to answer questions with 0ms latency without relying on external Wi-Fi or API credits.
3. **Key Viva Talking Points:**
   - Why Manifest V3 Side Panel was chosen over traditional popups.
   - How cubic Bézier trajectories prevent bot detection on enterprise portals.
   - Why deterministic algebra is strictly preferred over LLM arithmetic for attendance.
   - How the client-side IndexedDB architecture guarantees zero-knowledge student privacy.

# LPU AI Copilot: Technology Stack & Architectural Rationale

**Document:** TECH_STACK.md  
**Scope:** Rationale, evaluation, versioning, and trade-offs for all technology choices across client and server.

---

## 1. Core Technology Selection Matrix

| Subsystem | Selected Technology | Role & Responsibility | Initial (v1) vs Final |
|---|---|---|---|
| **Extension Platform** | Chrome Manifest V3 | Standard extension architecture with Side Panel API | Initial |
| **Frontend Framework** | React 18.3.1 + TypeScript 5.6 | UI component trees, state management, strict domain types | Initial |
| **Build Toolchain** | Vite 5.4.8 | Multi-bundle compilation (Sidepanel, Background Worker, Content Script) | Initial |
| **Styling** | CSS Modules + Custom Design Tokens | Scoped component styling, zero CSS runtime overhead | Initial |
| **Local Storage** | Browser IndexedDB + `chrome.storage.local` | Zero-server storage; student data stays 100% on-device | Initial |
| **Backend Gateway** | Python 3.11/3.13 + FastAPI 0.115 | Asynchronous REST and Server-Sent Events (SSE) streaming API | Initial |
| **Primary LLM** | Groq Cloud (`qwen/qwen3.8-27b`) | Sub-second token streaming for conversational reasoning | Initial |
| **Fallback LLM** | Google Gemini 1.5 Flash (Free Tier) | Cost-free fallback if Groq quotas are exhausted | Secondary |
| **Speech-to-Text** | Groq Whisper Large v3 | High-accuracy audio transcription | Secondary |
| **Text-to-Speech** | Groq Orpheus (`autumn` voice) | Low-latency expressive audio synthesis | Secondary |
| **Testing Toolchain** | Vitest 2.1 + JSDOM + Pytest | Fast unit and integration tests across TS and Python | Initial |

---

## 2. Deep Dive: Architectural Justifications

### A. Manifest V3 Chrome Side Panel (vs Traditional Popups)
- **Problem with Popups:** Standard browser extension popups (`default_popup`) dismiss and unmount the moment a student clicks anywhere inside the web page. This makes multi-step navigation (e.g. clicking through UMS tabs) impossible.
- **Why Side Panel:** The `chrome.sidePanel` API remains pinned to the viewport while the student interacts with the host page. It enables continuous perception, side-by-side timetable review, and persistent agent activity tracking.

### B. React 18 + TypeScript (vs Vanilla JS)
- Managing complex nested states (active portal state, real-time token streaming, attendance fraction models, bunk sliders) in vanilla JavaScript leads to spaghetti code.
- TypeScript enforces compile-time type safety across IPC message boundaries (`ExtensionMessage`), preventing undefined property crashes.

### C. Multi-Bundle Vite Setup
A Chrome extension requires three separate entry points with different execution contexts:
1. `sidepanel.html`: Runs in extension window context (has DOM, React, full extension APIs).
2. `service-worker.ts`: Runs in a background worker thread (zero DOM, no `window` object).
3. `content-script.ts`: Runs in host webpage context (`ums.lpu.in`, isolated JS world, shares DOM with host).

Vite compiles these with three targeted configurations:
- `vite.config.ts`: Builds React sidepanel and copies static assets.
- `vite.background.config.ts`: Compiles background service worker with ES module output.
- `vite.content.config.ts`: Bundles content script as a single self-contained IIFE script for injection.

### D. Python FastAPI Backend (vs Node.js Express)
- FastAPI provides automatic Pydantic data validation, native async generators for SSE streaming, and seamless integration with Python AI/ML libraries.
- It allows easy integration with both Hugging Face Spaces (via Gradio mounting in `app.py`) and standard Docker containers.

### E. LLM Provider Strategy (Groq + Gemini Flash Dual-Engine)
- **Primary: Groq Cloud:** Groq's LPU architecture delivers over 300 tokens/second on `qwen/qwen3.8-27b`. Responses stream instantly without student waiting.
- **Free Backup: Google Gemini 1.5 Flash:** Provides a free tier with high daily rate limits. Wrapping the LLM call in a simple provider interface allows automatic fallback if Groq keys hit rate limits.

---

## 3. Libraries Deliberately Excluded (Avoiding Reference Bloat)

1. **`kokoro-js` & ONNX WebAssembly (~34 MB):** The reference codebase included 34.2 MB of unused voice binaries. Running local 82M ONNX models in browser workers causes massive extension bloat and memory consumption. Cloud TTS (Groq Orpheus) is faster and keeps the extension under 2.5 MB.
2. **`framer-motion` (~1.5 MB):** Pure CSS keyframes, spring transitions, and `requestAnimationFrame` achieve identical 60fps animations with zero bundle penalty.
3. **`lucide-react` (~2 MB):** Instead of importing an icon library, hand-crafted inline SVGs or selectively bundled feather icons save significant bundle size.

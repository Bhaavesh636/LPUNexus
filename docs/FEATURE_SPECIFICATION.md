# LPU AI Copilot: Detailed Feature Specification

**Document:** FEATURE_SPECIFICATION.md  
**Scope:** Functional requirements, data contracts, edge cases, and verification criteria for all 13 system capabilities.

---

## Feature 1: UMS Page State Detection & Preflight Guard

### 1.1 Expected Behavior
When a student opens any tab matching `*://ums.lpu.in/*` or `*://studentums.lpu.in/*`, the extension automatically identifies the portal lifecycle state. If an obstructive "Campus Drive Notifications" recruitment modal appears, the preflight guard identifies the *"Remind me later"* button and safely dispatches a click to reveal the underlying dashboard.

### 1.2 Technical Specification
- **Inputs:** Live DOM root `document`.
- **Outputs:** State enum: `'NOT_CONNECTED' | 'LOGIN_PAGE' | 'UMS_DETECTED' | 'DASHBOARD_READY' | 'ATTENDANCE_MODAL_MOUNTED' | 'EXAMINATION_PAGE' | 'TIMETABLE_PAGE'`.
- **Components:** `src/content/umsDetector.ts`, `src/content/umsPreflight.ts`, `src/hooks/useUmsConnection.ts`.
- **Backend Requirements:** None (100% on-device execution).
- **Edge Cases:**
  - Cloudflare Turnstile verification challenge page: Guard enters wait state, preventing automated clicks from flagging bot detection.
  - Slow portal loading: MutationObserver with 150ms debounce polls for key elements before classifying page as unsupported.
- **Testing Criteria:**
  - Inject mock HTML containing `ums_login.html` → Returns `'LOGIN_PAGE'`.
  - Inject mock modal with text *"Remind me later"* → Triggers simulated click within 300ms.

---

## Feature 2: Attendance Extraction & Parsing

### 2.1 Expected Behavior
Extracts course-by-course attendance data from both the dashboard modal and the full attendance table, extracting course codes, course names, attended classes, delivered classes, duty leaves, and computing exact percentages.

### 2.2 Data Contract
```typescript
export interface CourseAttendance {
  code: string;           // e.g. "CSE329"
  name: string;           // e.g. "Advanced Python Programming"
  attended: number;       // e.g. 38
  delivered: number;      // e.g. 45
  dutyLeaves: number;     // e.g. 2
  percentage: number;     // e.g. 84.44 (computed as (attended + dutyLeaves) / delivered * 100)
  bunkAllowance: number;  // Classes student can safely miss above 75%
  requiredClasses: number;// Classes student must attend to reach 75%
}

export interface AttendanceSummary {
  studentName: string;
  registrationNumber: string;
  overallPercentage: number;
  totalCourses: number;
  courses: CourseAttendance[];
  extractedAt: string;
}
```

### 2.3 Edge Cases
- Fraction notation in cells (e.g. `"38/45"` or `"38 (DL: 2) / 45"`).
- Subjects with 0 delivered classes (Percentage = `100.0%` by university convention, bunk allowance = `0`).
- Attendance tables rendered inside dynamically loaded iframes.

---

## Feature 3: Attendance Dashboard & Visual Indicators

### 3.1 Expected Behavior
Renders in the side panel showing:
1. Large aggregate attendance percentage ring with color coding:
   - 🟢 $\ge 80\%$ (Safe)
   - 🟡 $75\% - 79.9\%$ (Warning)
   - 🔴 $< 75\%$ (Critical / Fine Risk)
2. Card list of all courses sorted by lowest attendance first.
3. Quick-action chips: *"Can I bunk tomorrow?"*, *"Show lowest course"*, *"Recovery plan"*.

---

## Feature 4: Safe Bunk Calculator (Exact Algebraic Engine)

### 4.1 Expected Behavior
Given current attended classes ($A$) and delivered classes ($D$) for a course, deterministically computes how many consecutive classes can be skipped without dropping below a target threshold ($T = 0.75$).

### 4.2 Mathematical Formula
$$\text{Bunk Allowance} = \max\left(0, \left\lfloor \frac{A - (T \cdot D)}{T} \right\rfloor\right)$$

*Example:* $A = 30$, $D = 35$, $T = 0.75$:
$$\left\lfloor \frac{30 - 26.25}{0.75} \right\rfloor = \left\lfloor \frac{3.75}{0.75} \right\rfloor = 5\text{ classes safe to skip.}$$

---

## Feature 5: Attendance Recovery Calculator

### 5.1 Expected Behavior
For courses currently below the threshold ($A/D < T$), computes the exact number of consecutive attended classes ($R$) required to restore attendance to at least $T$:

### 5.2 Mathematical Formula
$$\text{Required Classes } (R) = \max\left(0, \left\lceil \frac{(T \cdot D) - A}{1 - T} \right\rceil\right)$$

*Example:* $A = 18$, $D = 28$, $T = 0.75$:
$$\left\lceil \frac{(0.75 \cdot 28) - 18}{0.25} \right\rceil = \left\lceil \frac{21 - 18}{0.25} \right\rceil = \frac{3}{0.25} = 12\text{ consecutive classes required.}$$

---

## Feature 6: Examination Date Sheet Extraction

### 6.1 Expected Behavior
Navigates to `examination/conduct/seatingplan` or parses open date sheet DOM. Extracts course code, exam date, start and end times, reporting cutoff time, exam type (Mid-Term Theory, End-Term Practical), and MCQ question pattern breakdown.

### 6.2 Data Model
```typescript
export interface ExaminationRecord {
  courseCode: string;
  courseTitle: string;
  examDate: string;        // "06 Oct 2026"
  startTime: string;       // "10:00 AM"
  endTime: string;         // "11:30 AM"
  reportingTime: string;   // "09:30 AM"
  seatNumber?: string;     // "Room 34-102, Seat 14" (if published)
  examType: string;        // "Theory Mid Term - MCQ"
  patternDescription?: string;
  status: 'Upcoming' | 'Completed' | 'Not Allowed';
}
```

---

## Feature 7: Examination Venue & Seat Number Lookup

### 7.1 Expected Behavior
UMS displays seat assignments approximately 24 to 48 hours prior to an examination. The parser inspects the footer metadata of each conduct card. If the seat is marked *"Awaited"*, the UI displays an amber badge. When a seat is allocated (e.g., *"Block 34, Room 204, Desk 12"*), it extracts the room, block, and desk number, and provides visual floor guidance.

---

## Feature 8: SSRS Weekly Timetable Extraction & Visualization

### 8.1 Expected Behavior
Extracts class schedules from the UMS SSRS report (`studenttimesheet.aspx`), normalizing irregular table cells into structured daily slots with:
- Day of week (Monday through Saturday).
- Time interval (e.g. `09:00 AM - 10:00 AM`).
- Course code, section, group.
- Room code decoded into building and floor directions (e.g. `34-204` $\to$ **Block 34, 2nd Floor**).

---

## Feature 9: AI-Powered Academic Assistant

### 9.1 Expected Behavior
Conversational assistant capable of answering natural language questions grounded in student data:
- Streams tokens smoothly using Server-Sent Events (SSE).
- Invokes deterministic math tools when answering bunk questions.
- Enforces strict tone: helpful, academic, concise, avoiding generic pleasantries.

---

## Feature 10: Autonomous Browser Automation (Computer Use)

### 10.1 Expected Behavior
When a student clicks an action chip like *"Check my Date Sheet"*, the agent:
1. Harvests DOM elements and verifies current page state.
2. If on the main dashboard, clicks the "Important Links $\to$ Date Sheet" anchor using human-like Bézier paths.
3. Renders the AI cursor on the host page.
4. Waits for navigation, verifies landing on the date sheet, and triggers the extractor.

---

## Feature 11: Voice Assistant (STT & TTS)

### 11.1 Expected Behavior
- **Push-to-Talk & Voice Activation:** Records student audio via the offscreen document using `MediaRecorder`.
- **Speech-to-Text:** Dispatches audio bytes to Groq Whisper (`whisper-large-v3`).
- **Text-to-Speech:** Synthesizes spoken responses via Groq Orpheus (`canopylabs/orpheus-v1-english`).
- **Barge-in Interruption:** If student clicks or speaks while audio is playing, playback is immediately silenced.

---

## Feature 12: Local Conversation History & Personalization

### 12.1 Expected Behavior
- Automatically saves chat threads to IndexedDB.
- Provides a slide-out drawer to review previous Q&A threads.
- Allows students to pin important threads (e.g., *"Midterm Exam Date Sheet Breakdown"*).
- Cap of 30 stored conversation threads to avoid local database growth.

---

## Feature 13: Settings & Local Privacy Controls

### 13.1 Expected Behavior
- Displays local data metrics: total stored attendance records, chat records, and cached timetable size.
- **One-Click Purge ("Nuclear Reset"):** Completely clears IndexedDB and resets extension to initial factory state.
- Reduced Motion accessibility toggle: disables Bézier curve animations for students with motion sensitivity.

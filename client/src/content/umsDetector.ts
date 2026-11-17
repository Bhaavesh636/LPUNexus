/**
 * LpuNexus — UMS Page Detection Engine
 * Phase 2: Deterministic multi-signal DOM inspection identifying live portal lifecycle states.
 *
 * Enforces the authoritative terminology from FEATURE_SPECIFICATION.md:
 * - LOGIN_PAGE
 * - CLOUDFLARE_VERIFICATION
 * - DASHBOARD_READY
 * - ATTENDANCE_MODAL_MOUNTED
 * - EXAMINATION_PAGE
 * - TIMETABLE_PAGE
 * - UNKNOWN
 *
 * Zero external or Chrome API dependencies — pure DOM inspection safe for both
 * browser content scripts and JSDOM test runners.
 */

import { UmsPageState } from '../shared/types';

/**
 * Minimal Location interface allowing mock testing and browser execution.
 */
export interface DetectionLocation {
  hostname: string;
  pathname: string;
  href: string;
}

/* ==========================================================================
   Helper Functions (Defensive DOM Inspection)
   ========================================================================== */

/**
 * Checks whether an element exists and is currently visible in the DOM layout.
 */
function isElementVisible(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement) {
    if (el.style.display === 'none' || el.style.visibility === 'hidden') {
      return false;
    }
    // Check computed or inline opacity / visibility if supported
    if (el.hidden) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && el.children.length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Safely tests case-insensitive text content within an element or document.
 */
function containsText(root: Element | Document | null, search: string): boolean {
  if (!root) return false;
  const content = root.textContent ?? '';
  return content.toLowerCase().includes(search.toLowerCase());
}

/**
 * Validates whether the target location belongs strictly to an authorized UMS portal hostname.
 * Restricted exclusively to ums.lpu.in and studentums.lpu.in.
 */
export function isUmsHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'ums.lpu.in' || normalized === 'studentums.lpu.in';
}

/* ==========================================================================
   Individual State Detectors
   ========================================================================== */

/**
 * Priority 1: Cloudflare Turnstile / Managed Challenge Detection
 *
 * STRICT SECURITY INVARIANT:
 * Never inspects cross-origin iframe contents (violates SOP and throws DOMException).
 * Inspects exclusively host-page level attributes, wrappers, and titles.
 */
function isCloudflareVerification(doc: Document): boolean {
  // Signal 1: Document title markers
  const title = (doc.title || '').toLowerCase();
  if (title.includes('just a moment...') || title.includes('cloudflare')) {
    return true;
  }

  // Signal 2: Host challenge container elements
  if (
    doc.querySelector('#challenge-running') ||
    doc.querySelector('#challenge-stage') ||
    doc.querySelector('#cf-turnstile') ||
    doc.querySelector('.cf-browser-verification') ||
    doc.querySelector('#cf-wrapper')
  ) {
    return true;
  }

  // Signal 3: Host iframe attributes without crossing origin boundaries
  const iframes = doc.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const src = (iframes[i]?.getAttribute('src') || '').toLowerCase();
    if (
      src.includes('challenges.cloudflare.com') ||
      src.includes('cloudflarechallenges.com') ||
      src.includes('turnstile')
    ) {
      return true;
    }
  }

  // Signal 4: Ray ID and verification text in host document
  if (
    doc.querySelector('.ray-id') ||
    doc.querySelector('.cf-ray') ||
    containsText(doc.body, 'Checking your browser before accessing') ||
    containsText(doc.body, 'Verifying you are human')
  ) {
    return true;
  }

  return false;
}

/**
 * Priority 2: UMS Login Page Detection
 *
 * Verifies the presence of ASP.NET login inputs, login submission controls,
 * and confirms the absence of an authenticated user navigation shell.
 */
function isLoginPage(doc: Document, loc: DetectionLocation): boolean {
  // Signal 1: Path markers
  const path = loc.pathname.toLowerCase();
  const isLoginPath =
    path.includes('/login.aspx') ||
    path === '/' ||
    path === '/default.aspx' ||
    path === '';

  // Signal 2: Specific ASP.NET username and password fields
  const hasUserNameInput = Boolean(
    doc.querySelector('input[name*="txtUserName" i]') ||
    doc.querySelector('input[id*="txtUserName" i]') ||
    doc.querySelector('input[name*="username" i]')
  );

  const hasPasswordInput = Boolean(
    doc.querySelector('input[type="password"]') ||
    doc.querySelector('input[name*="txtPassword" i]') ||
    doc.querySelector('input[id*="txtPassword" i]')
  );

  // Signal 3: Login submit button or form action
  const hasLoginButton = Boolean(
    doc.querySelector('input[type="submit"][value*="login" i]') ||
    doc.querySelector('input[name*="btnLogin" i]') ||
    doc.querySelector('button[id*="btnLogin" i]') ||
    doc.querySelector('input[id*="btnLogin" i]')
  );

  // Signal 4: Confirm not inside authenticated shell
  const hasAuthShell = Boolean(
    doc.querySelector('#divMainMenu') ||
    doc.querySelector('a[href*="logout" i]')
  );

  if (hasAuthShell) return false;

  // Must have username and password inputs, plus login path or login button
  return hasUserNameInput && hasPasswordInput && (isLoginPath || hasLoginButton);
}

/**
 * Priority 3: Visible Attendance Modal Mounted
 *
 * Confirms that an active modal overlay containing attendance tabular data
 * is currently mounted and visible on top of the authenticated shell.
 */
function isAttendanceModalMounted(doc: Document): boolean {
  // Check modal wrappers that are active/visible
  const activeModals = doc.querySelectorAll(
    '.modal.show, .modal.in, div[id*="modal"][style*="display: block"], div[id*="Modal"][style*="block"], div[id*="AttendanceModal"], #divAttendance'
  );

  for (let i = 0; i < activeModals.length; i++) {
    const modal = activeModals[i];
    if (modal && isElementVisible(modal)) {
      // Must contain attendance table or attendance headings
      if (
        modal.querySelector('table[id*="gvAttendance" i]') ||
        modal.querySelector('table[id*="Attendance" i]') ||
        containsText(modal, 'Delivered') ||
        containsText(modal, 'Duty Leave') ||
        containsText(modal, 'Attendance Percentage')
      ) {
        return true;
      }
    }
  }

  // Also check if an inline attendance table popup is explicitly rendered
  const standaloneTable = doc.querySelector('table[id*="gvAttendance" i]');
  if (standaloneTable && isElementVisible(standaloneTable)) {
    return true;
  }

  return false;
}

/**
 * Priority 4: Examination / Date Sheet Page Detection
 *
 * Identifies examination conduct pages, date sheets, and seating plans.
 */
function isExaminationPage(doc: Document, loc: DetectionLocation): boolean {
  const path = loc.pathname.toLowerCase();
  const href = loc.href.toLowerCase();

  const isExamUrl =
    path.includes('datesheet') ||
    path.includes('seatingplan') ||
    path.includes('examination') ||
    href.includes('conduct/seatingplan');

  const hasExamTable = Boolean(
    doc.querySelector('table[id*="gvDateSheet" i]') ||
    doc.querySelector('table[id*="gvSeating" i]') ||
    doc.querySelector('div[id*="seatingPlan" i]') ||
    doc.querySelector('div[id*="datesheet" i]')
  );

  const hasExamText = Boolean(
    containsText(doc.body, 'Date Sheet') ||
    containsText(doc.body, 'Seating Plan') ||
    containsText(doc.body, 'Reporting Time')
  );

  return (isExamUrl && (hasExamTable || hasExamText)) || hasExamTable;
}

/**
 * Priority 5: SSRS Weekly Timetable Page Detection
 *
 * Identifies the Microsoft SQL Server Reporting Services (SSRS) timesheet report.
 */
function isTimetablePage(doc: Document, loc: DetectionLocation): boolean {
  const path = loc.pathname.toLowerCase();

  const isTimetableUrl =
    path.includes('studenttimesheet') ||
    path.includes('timetable') ||
    path.includes('timesheet.aspx');

  const hasSsrsViewer = Boolean(
    doc.querySelector('#ReportViewerControl') ||
    doc.querySelector('div[id*="ReportViewer" i]') ||
    doc.querySelector('table[id*="studenttimesheet" i]') ||
    doc.querySelector('table.timesheet')
  );

  const hasTimetableContent = Boolean(
    containsText(doc.body, 'Weekly Timetable') ||
    containsText(doc.body, 'Time Table') ||
    containsText(doc.body, 'studenttimesheet')
  );

  return (isTimetableUrl && (hasSsrsViewer || hasTimetableContent)) || hasSsrsViewer;
}

/**
 * Priority 6: Authenticated Dashboard Ready
 *
 * Verifies that the student session is active through corroborating combinations
 * of authenticated navigation, logout controls, and dashboard workspace elements.
 * Does not depend on a specific profile card, ensuring compatibility across
 * varying UMS sub-pages and dynamic dashboard layouts.
 */
function isDashboardReady(doc: Document): boolean {
  // Signal 1: Authenticated portal navigation and menu containers
  const hasNav = Boolean(
    doc.querySelector('#divMainMenu') ||
    doc.querySelector('#navigation') ||
    doc.querySelector('.navbar-nav') ||
    doc.querySelector('nav.main-navigation') ||
    doc.querySelector('.sidebar-menu') ||
    doc.querySelector('#sidebar') ||
    doc.querySelector('ul[id*="menu" i]') ||
    doc.querySelector('div[id*="menu" i]')
  );

  // Signal 2: Session termination / Logout controls
  const hasLogout = Boolean(
    doc.querySelector('a[href*="logout" i]') ||
    doc.querySelector('a[href*="logoff" i]') ||
    doc.querySelector('[id*="btnLogout" i]') ||
    doc.querySelector('a[id*="lnkLogout" i]') ||
    doc.querySelector('button[id*="btnLogout" i]')
  );

  // Signal 3: Authenticated dashboard workspace structure
  const hasDashboardContent = Boolean(
    doc.querySelector('#divDashboard') ||
    doc.querySelector('#middlecontent') ||
    doc.querySelector('#ctl00_cphHeading') ||
    doc.querySelector('#ctl00_ContentPlaceHolder1') ||
    doc.querySelector('.dashboard-wrapper') ||
    doc.querySelector('.page-content') ||
    doc.querySelector('div[id*="dashboard" i]')
  );

  // Signal 4: Student identity or registration display (optional corroboration)
  const hasStudentIdentity = Boolean(
    doc.querySelector('.user-profile') ||
    doc.querySelector('#divUserProfile') ||
    doc.querySelector('.student-info') ||
    doc.querySelector('[id*="lblStudent" i]') ||
    doc.querySelector('[id*="lblRegistration" i]')
  );

  // Robust multi-signal evaluation: requires at least 2 distinct corroborating categories
  const signalsCount =
    (hasNav ? 1 : 0) +
    (hasLogout ? 1 : 0) +
    (hasDashboardContent ? 1 : 0) +
    (hasStudentIdentity ? 1 : 0);

  return signalsCount >= 2;
}

/* ==========================================================================
   Main Detection Engine
   ========================================================================== */

/**
 * Inspects a Document and Location to determine the authoritative UMS page state.
 *
 * STRICT PRECEDENCE RULES:
 * 1. Hostname Guard: Non-LPU domains immediately return UNKNOWN.
 * 2. Cloudflare Verification: Takes precedence over all states to prevent automated interactions.
 * 3. Login Page: Identified by login credentials form, avoiding false-positive dashboards.
 * 4. Attendance Modal: Must be explicitly mounted and visible on top of authenticated session.
 * 5. Examination Page: Seating plans, conduct tables, and date sheets.
 * 6. Timetable Page: SSRS reporting viewer and timesheet matrices.
 * 7. Dashboard Ready: Authenticated student master shell and navigation.
 * 8. Fallback: UNKNOWN when evidence is insufficient.
 *
 * @param doc Document object (defaults to global window.document)
 * @param loc Location object (defaults to global window.location)
 * @returns UmsPageState
 */
export function detectUmsPageState(
  doc?: Document,
  loc?: DetectionLocation
): UmsPageState {
  const currentDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  const currentLoc: DetectionLocation = loc ?? (typeof window !== 'undefined'
    ? {
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        href: window.location.href,
      }
    : { hostname: '', pathname: '', href: '' });

  if (!currentDoc || !currentDoc.body) {
    return 'UNKNOWN';
  }

  // Rule 1: Hostname validation
  if (!isUmsHostname(currentLoc.hostname)) {
    return 'UNKNOWN';
  }

  // Rule 2: Cloudflare verification has absolute priority
  if (isCloudflareVerification(currentDoc)) {
    return 'CLOUDFLARE_VERIFICATION';
  }

  // Rule 3: Login Page detection
  if (isLoginPage(currentDoc, currentLoc)) {
    return 'LOGIN_PAGE';
  }

  // Rule 4: Active visible attendance modal
  if (isAttendanceModalMounted(currentDoc)) {
    return 'ATTENDANCE_MODAL_MOUNTED';
  }

  // Rule 5: Examination / Date Sheet
  if (isExaminationPage(currentDoc, currentLoc)) {
    return 'EXAMINATION_PAGE';
  }

  // Rule 6: Weekly SSRS Timetable
  if (isTimetablePage(currentDoc, currentLoc)) {
    return 'TIMETABLE_PAGE';
  }

  // Rule 7: Authenticated Dashboard
  if (isDashboardReady(currentDoc)) {
    return 'DASHBOARD_READY';
  }

  // Rule 8: Default unknown state
  return 'UNKNOWN';
}

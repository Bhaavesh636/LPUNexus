/**
 * LpuNexus — Shared Domain Types
 * Phase 2: Core domain interfaces, page states, and connection definitions.
 */

/**
 * Authoritative UMS page states recognized across LpuNexus.
 * Enforces the exact terminology specified in FEATURE_SPECIFICATION.md.
 */
export type UmsPageState =
  | 'LOGIN_PAGE'
  | 'CLOUDFLARE_VERIFICATION'
  | 'DASHBOARD_READY'
  | 'ATTENDANCE_MODAL_MOUNTED'
  | 'EXAMINATION_PAGE'
  | 'TIMETABLE_PAGE'
  | 'UNKNOWN';

/**
 * Portal connection states displayed in the Nexus Bar status badge.
 * Retains complete backwards-compatibility with Phase 1 components.
 */
export enum PortalStatus {
  NotConnected = 'not_connected',
  Connecting = 'connecting',
  LoginPage = 'login_page',
  CloudflareVerification = 'cloudflare_verification',
  Dashboard = 'dashboard',
  AttendanceModal = 'attendance_modal',
  DateSheet = 'date_sheet',
  Timetable = 'timetable',
  Ready = 'ready',
  UnsupportedPage = 'unsupported_page',
  Error = 'error',
}

/** Theme options supported by LpuNexus */
export type Theme = 'light' | 'dark';

/**
 * Active UMS Tab snapshot metadata tracked by the Background Service Worker.
 */
export interface ActiveUmsTabInfo {
  tabId: number;
  url: string;
  title?: string;
  state: UmsPageState;
  timestamp: number;
}

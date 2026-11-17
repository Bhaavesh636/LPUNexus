/**
 * LpuNexus — Typed IPC Message Contracts
 * Phase 2: Strongly-typed, discriminated-union message definitions connecting
 * Content Script <-> Background Service Worker <-> Chrome Side Panel.
 */

import { UmsPageState } from './types';

/**
 * Dedicated long-lived port name used for Side Panel <-> Service Worker communication.
 */
export const NEXUS_PORT_NAME = 'nexus_sidepanel';

/* ==========================================================================
   1. Content Script -> Background Service Worker Messages
   ========================================================================== */

/**
 * Dispatched by the Content Script when the UMS DOM transitions to a new state.
 */
export interface CsPageStateChangedMessage {
  type: 'CS_PAGE_STATE_CHANGED';
  state: UmsPageState;
  url: string;
  timestamp: number;
}

/**
 * Dispatched by the Preflight Guard when a blocking campus recruitment modal is dismissed.
 */
export interface CsPreflightDismissedMessage {
  type: 'CS_PREFLIGHT_DISMISSED';
  modalSelector: string;
  timestamp: number;
}

/**
 * Dispatched by the Content Script on page teardown/beforeunload.
 */
export interface CsDisconnectedMessage {
  type: 'CS_DISCONNECTED';
  url: string;
  timestamp: number;
}

export type ContentToBackgroundMessage =
  | CsPageStateChangedMessage
  | CsPreflightDismissedMessage
  | CsDisconnectedMessage;

/* ==========================================================================
   2. Background Service Worker -> Side Panel Domain Structures
   ========================================================================== */

/**
 * Preflight summary attached to active tab snapshots.
 */
export interface UmsPreflightSummary {
  handled: boolean;
  actionTaken: 'DISMISSED' | 'SKIPPED_CLOUDFLARE' | 'ALREADY_DISMISSED' | 'NO_MODAL_FOUND';
  modalIdentifier?: string;
  buttonText?: string;
  timestamp: number;
}

/**
 * Extended active tab info provided to the Side Panel.
 */
export interface SidepanelUmsTabInfo {
  tabId: number;
  windowId: number;
  url: string;
  title?: string;
  state: UmsPageState;
  timestamp: number;
  preflight: UmsPreflightSummary | null;
}

/* ==========================================================================
   3. Background Service Worker -> Side Panel Messages (over Port)
   ========================================================================== */

/**
 * Dispatched by the Background Service Worker to broadcast the active UMS tab's state.
 */
export interface BgTabStateChangedMessage {
  type: 'BG_TAB_STATE_CHANGED';
  tab: SidepanelUmsTabInfo;
  timestamp: number;
  sessionId: string;
  seq: number;
  isInitialSnapshot?: boolean;
}

/**
 * Dispatched when the active UMS tab is closed, navigated away, unattached, or window not found.
 */
export interface BgUmsDisconnectedMessage {
  type: 'BG_UMS_DISCONNECTED';
  reason: 'TAB_CLOSED' | 'NAVIGATED_AWAY' | 'NO_ACTIVE_UMS_TAB' | 'CONTENT_SCRIPT_UNLOADED' | 'WINDOW_NOT_FOUND';
  timestamp: number;
  sessionId: string;
  seq: number;
  isInitialSnapshot?: boolean;
}

/**
 * Dispatched to notify the Side Panel that a blocking modal was auto-dismissed.
 * Carries originating tabId and windowId for strict active-tab ownership verification.
 */
export interface BgPreflightNotificationMessage {
  type: 'BG_PREFLIGHT_NOTIFICATION';
  modalSelector: string;
  tabId: number;
  windowId: number;
  timestamp: number;
  sessionId: string;
  seq: number;
  isInitialSnapshot?: boolean;
}

/**
 * Dispatched to report runtime or communication errors to the Side Panel.
 */
export interface BgErrorMessage {
  type: 'BG_ERROR';
  code: string;
  message: string;
  timestamp: number;
  sessionId: string;
  seq: number;
  isInitialSnapshot?: boolean;
}

export type BackgroundToSidepanelMessage =
  | BgTabStateChangedMessage
  | BgUmsDisconnectedMessage
  | BgPreflightNotificationMessage
  | BgErrorMessage;

/* ==========================================================================
   4. Side Panel -> Background Service Worker Messages (over Port or Runtime)
   ========================================================================== */

/**
 * Dispatched by the Side Panel upon mount or retry to request the immediate cached state.
 */
export interface SpGetCurrentStateMessage {
  type: 'SP_GET_CURRENT_STATE';
  windowId: number;
  timestamp: number;
}

/**
 * Dispatched by the Side Panel to request an active tab inspection refresh.
 */
export interface SpRefreshTabRequestMessage {
  type: 'SP_REFRESH_TAB_REQUEST';
  windowId: number;
  timestamp: number;
}

export type SidepanelToBackgroundMessage =
  | SpGetCurrentStateMessage
  | SpRefreshTabRequestMessage;

/* ==========================================================================
   5. Unified Extension Message Union
   ========================================================================== */

export type ExtensionMessage =
  | ContentToBackgroundMessage
  | BackgroundToSidepanelMessage
  | SidepanelToBackgroundMessage;

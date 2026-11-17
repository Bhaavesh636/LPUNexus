/**
 * LpuNexus — useUmsConnection Hook
 * Phase 2 Step 7: Side Panel <-> Background Service Worker Connection & State Synchronizer.
 *
 * Responsibilities:
 * 1. Manages typed port connection lifecycle with atomic connection generation tracking.
 * 2. Implements the two-phase handshake adopting session and monotonic sequence only
 *    from qualifying initial snapshots.
 * 3. Enforces strict originating tab/window ownership checks on preflight notifications.
 * 4. Manages unified retry schedule (1s, 2s, 4s, 8s, 8s; max 5) for WINDOW_NOT_FOUND and disconnects.
 * 5. Full React Strict Mode resilience (setup -> cleanup -> setup) without stale callback interference.
 * 6. Pure runtime type guard validation without unsafe type assertions.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { UmsPageState, PortalStatus } from '../shared/types';
import {
  NEXUS_PORT_NAME,
  BackgroundToSidepanelMessage,
  SidepanelUmsTabInfo,
  UmsPreflightSummary,
} from '../shared/messages';

/* ==========================================================================
   1. Runtime Constants & Validation Sets
   ========================================================================== */

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 8000] as const;
const MAX_RETRIES = 5;

let globalEffectInstanceCounter = 0;

const VALID_UMS_PAGE_STATES: ReadonlySet<string> = new Set<UmsPageState>([
  'LOGIN_PAGE',
  'CLOUDFLARE_VERIFICATION',
  'DASHBOARD_READY',
  'ATTENDANCE_MODAL_MOUNTED',
  'EXAMINATION_PAGE',
  'TIMETABLE_PAGE',
  'UNKNOWN',
]);

const VALID_DISCONNECT_REASONS: ReadonlySet<string> = new Set([
  'TAB_CLOSED',
  'NAVIGATED_AWAY',
  'NO_ACTIVE_UMS_TAB',
  'CONTENT_SCRIPT_UNLOADED',
  'WINDOW_NOT_FOUND',
]);

const VALID_PREFLIGHT_ACTIONS: ReadonlySet<string> = new Set([
  'DISMISSED',
  'SKIPPED_CLOUDFLARE',
  'ALREADY_DISMISSED',
  'NO_MODAL_FOUND',
]);

/* ==========================================================================
   2. Pure Type Guards (Zero Type Assertions)
   ========================================================================== */

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function isValidNonNegativeInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
}

function isPositiveInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val > 0;
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isAuthorizedUmsUrl(val: unknown): val is string {
  if (typeof val !== 'string' || val.trim().length === 0) return false;
  try {
    const parsed = new URL(val);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'ums.lpu.in' || host === 'studentums.lpu.in';
  } catch {
    return false;
  }
}

function isValidUmsPageState(val: unknown): val is UmsPageState {
  return typeof val === 'string' && VALID_UMS_PAGE_STATES.has(val);
}

function isValidPreflightSummary(val: unknown): val is UmsPreflightSummary | null {
  if (val === null) return true;
  if (!isRecord(val)) return false;
  if (typeof val.handled !== 'boolean') return false;
  if (typeof val.actionTaken !== 'string' || !VALID_PREFLIGHT_ACTIONS.has(val.actionTaken)) return false;
  if (!isPositiveInteger(val.timestamp)) return false;
  if (val.modalIdentifier !== undefined && typeof val.modalIdentifier !== 'string') return false;
  if (val.buttonText !== undefined && typeof val.buttonText !== 'string') return false;
  return true;
}

export function isValidSidepanelTabInfo(val: unknown): val is SidepanelUmsTabInfo {
  if (!isRecord(val)) return false;
  if (!isValidNonNegativeInteger(val.tabId)) return false;
  if (!isValidNonNegativeInteger(val.windowId)) return false;
  if (!isAuthorizedUmsUrl(val.url)) return false;
  if (!isValidUmsPageState(val.state)) return false;
  if (!isPositiveInteger(val.timestamp)) return false;
  if (val.title !== undefined && typeof val.title !== 'string') return false;
  if (!isValidPreflightSummary(val.preflight)) return false;
  return true;
}

export function isValidBackgroundMessage(msg: unknown): msg is BackgroundToSidepanelMessage {
  if (!isRecord(msg)) return false;
  if (!isNonEmptyString(msg.sessionId)) return false;
  if (!isPositiveInteger(msg.seq)) return false;
  if (!isPositiveInteger(msg.timestamp)) return false;
  if (msg.isInitialSnapshot !== undefined && typeof msg.isInitialSnapshot !== 'boolean') return false;

  if (msg.type === 'BG_TAB_STATE_CHANGED') {
    return isValidSidepanelTabInfo(msg.tab);
  }

  if (msg.type === 'BG_UMS_DISCONNECTED') {
    return typeof msg.reason === 'string' && VALID_DISCONNECT_REASONS.has(msg.reason);
  }

  if (msg.type === 'BG_PREFLIGHT_NOTIFICATION') {
    return (
      isNonEmptyString(msg.modalSelector) &&
      isValidNonNegativeInteger(msg.tabId) &&
      isValidNonNegativeInteger(msg.windowId)
    );
  }

  if (msg.type === 'BG_ERROR') {
    return isNonEmptyString(msg.code) && typeof msg.message === 'string';
  }

  return false;
}

export function isQualifyingInitialSnapshot(msg: BackgroundToSidepanelMessage): boolean {
  if (msg.isInitialSnapshot !== true) return false;
  if (msg.type === 'BG_TAB_STATE_CHANGED') {
    return isValidSidepanelTabInfo(msg.tab);
  }
  if (msg.type === 'BG_UMS_DISCONNECTED') {
    return msg.reason !== 'WINDOW_NOT_FOUND' && VALID_DISCONNECT_REASONS.has(msg.reason);
  }
  return false;
}

export function mapPageStateToPortalStatus(state: UmsPageState): PortalStatus {
  switch (state) {
    case 'DASHBOARD_READY':
      return PortalStatus.Dashboard;
    case 'LOGIN_PAGE':
      return PortalStatus.LoginPage;
    case 'CLOUDFLARE_VERIFICATION':
      return PortalStatus.CloudflareVerification;
    case 'ATTENDANCE_MODAL_MOUNTED':
      return PortalStatus.AttendanceModal;
    case 'TIMETABLE_PAGE':
      return PortalStatus.Timetable;
    case 'EXAMINATION_PAGE':
      return PortalStatus.DateSheet;
    case 'UNKNOWN':
    default:
      return PortalStatus.Ready;
  }
}

/* ==========================================================================
   3. Hook Interfaces & Return Types
   ========================================================================== */

export interface PreflightNotificationData {
  modalSelector: string;
  tabId: number;
  windowId: number;
  timestamp: number;
}

export interface BackgroundErrorData {
  code: string;
  message: string;
  timestamp: number;
}

export interface UseUmsConnectionResult {
  portalStatus: PortalStatus;
  activeTab: SidepanelUmsTabInfo | null;
  latestPreflight: PreflightNotificationData | null;
  bgError: BackgroundErrorData | null;
  errorDetail: string | null;
  manualReconnect: () => void;
}

/* ==========================================================================
   4. Hook Implementation
   ========================================================================== */

export function useUmsConnection(): UseUmsConnectionResult {
  const [portalStatus, setPortalStatus] = useState<PortalStatus>(PortalStatus.Connecting);
  const [activeTab, setActiveTab] = useState<SidepanelUmsTabInfo | null>(null);
  const [latestPreflight, setLatestPreflight] = useState<PreflightNotificationData | null>(null);
  const [bgError, setBgError] = useState<BackgroundErrorData | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // Synchronous mirror ref for active tab to prevent closure staleness during verification
  const activeTabRef = useRef<SidepanelUmsTabInfo | null>(null);

  // Lifecycle Refs
  const isMountedRef = useRef<boolean>(true);
  const activeEffectInstanceRef = useRef<number>(0);
  const connectionGenerationRef = useRef<number>(0);

  // Connection State Refs
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const isHandshakeCompleteRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);
  const lastAppliedSeqRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const activeTimerRef = useRef<number | null>(null);

  /**
   * Clears any pending retry timer.
   */
  const clearActiveTimer = useCallback((): void => {
    if (activeTimerRef.current !== null) {
      window.clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
  }, []);

  /**
   * Schedules a WINDOW_NOT_FOUND retry on the same port, protected by generation ID.
   */
  const scheduleWindowRetry = useCallback((port: chrome.runtime.Port, generation: number): void => {
    clearActiveTimer();

    if (generation !== connectionGenerationRef.current || !isMountedRef.current) {
      return;
    }

    if (retryCountRef.current < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCountRef.current];
      retryCountRef.current += 1;
      setPortalStatus(PortalStatus.Connecting);

      activeTimerRef.current = window.setTimeout(async () => {
        activeTimerRef.current = null;

        // --- Pre-Await Verification ---
        if (
          !isMountedRef.current ||
          generation !== connectionGenerationRef.current ||
          isHandshakeCompleteRef.current ||
          portRef.current !== port
        ) {
          return;
        }

        let currentWindow: chrome.windows.Window | undefined;
        try {
          currentWindow = await chrome.windows.getCurrent();
        } catch {
          if (
            isMountedRef.current &&
            generation === connectionGenerationRef.current &&
            !isHandshakeCompleteRef.current &&
            portRef.current === port
          ) {
            scheduleWindowRetry(port, generation);
          }
          return;
        }

        // --- Post-Await Verification ---
        if (
          !isMountedRef.current ||
          generation !== connectionGenerationRef.current ||
          isHandshakeCompleteRef.current ||
          portRef.current !== port
        ) {
          return;
        }

        const windowId = currentWindow?.id;
        if (typeof windowId === 'number' && Number.isInteger(windowId) && windowId >= 0) {
          try {
            port.postMessage({
              type: 'SP_GET_CURRENT_STATE',
              windowId,
              timestamp: Date.now(),
            });
          } catch {
            // Port closed during postMessage; port.onDisconnect handles reconnection
            return;
          }
        } else {
          scheduleWindowRetry(port, generation);
        }
      }, delay);
    } else {
      setPortalStatus(PortalStatus.Error);
      setErrorDetail('Browser window not found or unavailable');
    }
  }, [clearActiveTimer]);

  /**
   * Schedules a port reconnection retry after active port disconnection.
   */
  const schedulePortReconnect = useCallback((generation: number): void => {
    clearActiveTimer();

    if (generation !== connectionGenerationRef.current || !isMountedRef.current) {
      return;
    }

    if (retryCountRef.current < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCountRef.current];
      retryCountRef.current += 1;
      setPortalStatus(PortalStatus.Connecting);

      activeTimerRef.current = window.setTimeout(() => {
        activeTimerRef.current = null;
        if (generation === connectionGenerationRef.current && isMountedRef.current) {
          connectPort();
        }
      }, delay);
    } else {
      setPortalStatus(PortalStatus.Error);
      setErrorDetail('Background service is sleeping or disconnected');
    }
  }, [clearActiveTimer]);

  /**
   * Main connection initiator.
   */
  const connectPort = useCallback((): void => {
    clearActiveTimer();

    // Advance generation to invalidate all previous in-flight callbacks & timers
    connectionGenerationRef.current += 1;
    const currentGen = connectionGenerationRef.current;

    // Clean up any existing port reference
    if (portRef.current) {
      const oldPort = portRef.current;
      portRef.current = null;
      try {
        oldPort.disconnect();
      } catch {
        // Ignore errors on closing previous port
      }
    }

    isHandshakeCompleteRef.current = false;
    sessionIdRef.current = null;
    lastAppliedSeqRef.current = 0;
    activeTabRef.current = null;
    setActiveTab(null);
    setPortalStatus(PortalStatus.Connecting);
    setLatestPreflight(null); // Clear preflight on new connection attempt
    setBgError(null);
    setErrorDetail(null);

    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: NEXUS_PORT_NAME });
    } catch {
      schedulePortReconnect(currentGen);
      return;
    }

    portRef.current = port;

    // --- Strict Active Port Disconnect Protection ---
    port.onDisconnect.addListener(() => {
      // Disconnect events for stale or superseded ports are ignored
      if (portRef.current !== port) {
        return;
      }

      // Active port disconnected: clear reference, advance generation, schedule reconnect
      portRef.current = null;
      connectionGenerationRef.current += 1;
      const nextGen = connectionGenerationRef.current;
      schedulePortReconnect(nextGen);
    });

    port.onMessage.addListener((rawMsg: unknown) => {
      if (currentGen !== connectionGenerationRef.current || !isMountedRef.current) {
        return;
      }

      if (!isValidBackgroundMessage(rawMsg)) {
        return;
      }

      // --- Pre-Handshake Phase ---
      if (!isHandshakeCompleteRef.current) {
        // Strict 3-Condition Guard for WINDOW_NOT_FOUND retry
        if (
          rawMsg.type === 'BG_UMS_DISCONNECTED' &&
          rawMsg.reason === 'WINDOW_NOT_FOUND' &&
          rawMsg.isInitialSnapshot === true
        ) {
          scheduleWindowRetry(port, currentGen);
          return;
        }

        // Drop any message that does not qualify as a valid initial snapshot
        if (!isQualifyingInitialSnapshot(rawMsg)) {
          return;
        }

        // Qualifying snapshot received: Adopt session and cancel all retry timers
        clearActiveTimer();
        retryCountRef.current = 0;
        sessionIdRef.current = rawMsg.sessionId;
        lastAppliedSeqRef.current = rawMsg.seq;
        isHandshakeCompleteRef.current = true;

        if (rawMsg.type === 'BG_TAB_STATE_CHANGED') {
          setLatestPreflight(null); // Clear preflight before applying new active tab state
          activeTabRef.current = rawMsg.tab;
          setActiveTab(rawMsg.tab);
          setPortalStatus(mapPageStateToPortalStatus(rawMsg.tab.state));
        } else if (rawMsg.type === 'BG_UMS_DISCONNECTED') {
          setLatestPreflight(null); // Clear preflight on UMS disconnection
          activeTabRef.current = null;
          setActiveTab(null);
          setPortalStatus(PortalStatus.NotConnected);
        }
        return;
      }

      // --- Post-Handshake Phase ---
      if (rawMsg.isInitialSnapshot === true) return;
      if (rawMsg.sessionId !== sessionIdRef.current) return;
      if (rawMsg.seq <= lastAppliedSeqRef.current) return;

      // Special Tab Ownership Check for BG_PREFLIGHT_NOTIFICATION
      if (rawMsg.type === 'BG_PREFLIGHT_NOTIFICATION') {
        const currentActive = activeTabRef.current;
        // Verify notification strictly belongs to the currently active tab & window
        if (
          !currentActive ||
          currentActive.tabId !== rawMsg.tabId ||
          currentActive.windowId !== rawMsg.windowId
        ) {
          // Notification belongs to a different or background tab; ignore without advancing sequence!
          return;
        }

        // Passed ownership validation: advance sequence now
        lastAppliedSeqRef.current = rawMsg.seq;

        setLatestPreflight({
          modalSelector: rawMsg.modalSelector,
          tabId: rawMsg.tabId,
          windowId: rawMsg.windowId,
          timestamp: rawMsg.timestamp,
        });

        setActiveTab((prev) => {
          if (!prev) return null;
          const updated: SidepanelUmsTabInfo = {
            ...prev,
            preflight: {
              handled: true,
              actionTaken: 'DISMISSED',
              modalIdentifier: rawMsg.modalSelector,
              timestamp: rawMsg.timestamp,
            },
          };
          activeTabRef.current = updated;
          return updated;
        });
        return;
      }

      // For all other post-handshake message types, advance sequence
      lastAppliedSeqRef.current = rawMsg.seq;

      if (rawMsg.type === 'BG_TAB_STATE_CHANGED') {
        setLatestPreflight(null); // Clear preflight before applying new active tab state
        activeTabRef.current = rawMsg.tab;
        setActiveTab(rawMsg.tab);
        setPortalStatus(mapPageStateToPortalStatus(rawMsg.tab.state));
      } else if (rawMsg.type === 'BG_UMS_DISCONNECTED') {
        setLatestPreflight(null); // Clear preflight on UMS disconnection
        activeTabRef.current = null;
        setActiveTab(null);
        setPortalStatus(PortalStatus.NotConnected);
      } else if (rawMsg.type === 'BG_ERROR') {
        setBgError({
          code: rawMsg.code,
          message: rawMsg.message,
          timestamp: rawMsg.timestamp,
        });
        setErrorDetail(`[${rawMsg.code}] ${rawMsg.message}`);
        setPortalStatus(PortalStatus.Error);
      }
    });

    // Initial SP_GET_CURRENT_STATE dispatch
    void (async () => {
      try {
        const win = await chrome.windows.getCurrent();
        if (
          isMountedRef.current &&
          currentGen === connectionGenerationRef.current &&
          portRef.current === port
        ) {
          const windowId = win.id;
          if (typeof windowId === 'number' && Number.isInteger(windowId) && windowId >= 0) {
            try {
              port.postMessage({
                type: 'SP_GET_CURRENT_STATE',
                windowId,
                timestamp: Date.now(),
              });
            } catch {
              // Port error handled by onDisconnect
            }
          } else {
            scheduleWindowRetry(port, currentGen);
          }
        }
      } catch {
        if (
          isMountedRef.current &&
          currentGen === connectionGenerationRef.current &&
          portRef.current === port
        ) {
          scheduleWindowRetry(port, currentGen);
        }
      }
    })();
  }, [clearActiveTimer, schedulePortReconnect, scheduleWindowRetry]);

  /**
   * Manual Reconnect callback exposed to the UI.
   */
  const manualReconnect = useCallback((): void => {
    clearActiveTimer();
    retryCountRef.current = 0;
    connectPort();
  }, [clearActiveTimer, connectPort]);

  /**
   * Complete React Effect Lifecycle Management.
   * Fully resilient to React Strict Mode setup -> cleanup -> setup execution.
   */
  useEffect(() => {
    isMountedRef.current = true;
    const instanceId = ++globalEffectInstanceCounter;
    activeEffectInstanceRef.current = instanceId;

    connectPort();

    return () => {
      // Execute cleanup strictly if this cleanup belongs to the active effect instance
      if (activeEffectInstanceRef.current === instanceId) {
        isMountedRef.current = false;
        clearActiveTimer();
        connectionGenerationRef.current += 1;

        if (portRef.current) {
          const activePort = portRef.current;
          portRef.current = null;
          try {
            activePort.disconnect();
          } catch {
            // Teardown error ignored
          }
        }
      }
    };
  }, [clearActiveTimer, connectPort]);

  return {
    portalStatus,
    activeTab,
    latestPreflight,
    bgError,
    errorDetail,
    manualReconnect,
  };
}

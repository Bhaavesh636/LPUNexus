/**
 * LpuNexus — Content Script Engine
 * Phase 2: UMS Portal Detection, Preflight Modal Auto-Dismissal, and Typed IPC.
 *
 * Responsibilities:
 * 1. Initial UMS hostname & page-state detection on mount.
 * 2. Event-driven typed IPC reporting to Background Service Worker (CS_PAGE_STATE_CHANGED).
 * 3. Debounced 150ms MutationObserver tracking dynamic ASP.NET DOM updates.
 * 4. Cloudflare passivity invariant: zero DOM interaction during challenges.
 * 5. Preflight modal dismissal integration restricted strictly to authenticated states.
 * 6. Idempotent lifecycle teardown & Back/Forward Cache (BFCache) restoration support.
 */

import { UmsPageState } from '../shared/types';
import { ContentToBackgroundMessage } from '../shared/messages';
import { detectUmsPageState, isUmsHostname } from './umsDetector';
import { checkAndDismissPreflightModal } from './umsPreflight';

/* ==========================================================================
   State & Configuration
   ========================================================================== */

const DEBOUNCE_MS = 150;

let lastReportedState: UmsPageState | null = null;
let lastReportedUrl: string = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let mutationObserver: MutationObserver | null = null;
let isCleanedUp = false;

/* ==========================================================================
   Safe IPC Dispatcher
   ========================================================================== */

/**
 * Safely dispatches a typed message to the background service worker.
 * Catches transient disconnection errors when the service worker is idle.
 */
function sendBackgroundMessage(message: ContentToBackgroundMessage): void {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage(message).catch(() => {
      // Background service worker may be dormant or reloading.
      // Handled gracefully without logging noisy console errors.
    });
  }
}

/* ==========================================================================
   Core Evaluation Engine
   ========================================================================== */

/**
 * Evaluates current page state, reports changes to background,
 * and executes safe preflight modal dismissal when permitted.
 *
 * @param forceReport When true, forces dispatch of CS_PAGE_STATE_CHANGED even if state/URL unchanged (e.g. after BFCache restoration).
 */
function evaluatePageState(forceReport = false): void {
  const currentState = detectUmsPageState();
  const currentUrl = window.location.href;

  // 1. Report state change to Background if state or URL has transitioned, or if forced
  if (forceReport || currentState !== lastReportedState || currentUrl !== lastReportedUrl) {
    lastReportedState = currentState;
    lastReportedUrl = currentUrl;

    sendBackgroundMessage({
      type: 'CS_PAGE_STATE_CHANGED',
      state: currentState,
      url: currentUrl,
      timestamp: Date.now(),
    });
  }

  // 2. Preflight Guard Execution
  // CRITICAL INVARIANT: Permit preflight dismissal ONLY on verified authenticated states.
  // Explicitly forbidden in CLOUDFLARE_VERIFICATION, LOGIN_PAGE, and UNKNOWN.
  const isPreflightAllowed =
    currentState === 'DASHBOARD_READY' ||
    currentState === 'ATTENDANCE_MODAL_MOUNTED' ||
    currentState === 'EXAMINATION_PAGE' ||
    currentState === 'TIMETABLE_PAGE';

  if (isPreflightAllowed) {
    // Execute preflight check for blocking campus drive modals
    const preflightResult = checkAndDismissPreflightModal(document, currentState);
    if (preflightResult.handled && preflightResult.actionTaken === 'DISMISSED') {
      sendBackgroundMessage({
        type: 'CS_PREFLIGHT_DISMISSED',
        modalSelector: preflightResult.modalIdentifier || 'campus-drive-modal',
        timestamp: preflightResult.timestamp,
      });

      // Schedule re-evaluation after modal dismissal to detect newly revealed dashboard/attendance state
      scheduleEvaluation();
    }
  }
}

/**
 * Schedules a debounced evaluation to batch rapid DOM mutations.
 */
function scheduleEvaluation(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    evaluatePageState();
  }, DEBOUNCE_MS);
}

/* ==========================================================================
   Lifecycle & DOM Mutation Observer
   ========================================================================== */

/**
 * Initializes the debounced MutationObserver on the active document body.
 */
function startObserver(): void {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    return;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver(() => {
    scheduleEvaluation();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'id', 'hidden', 'role'],
  });
}

/**
 * Cleans up timers, observers, and informs background of content-script disconnection.
 * Idempotent: guaranteed to execute at most once per suspension or teardown cycle.
 *
 * @param event Optional event triggering cleanup (beforeunload or PageTransitionEvent on pagehide).
 */
function cleanup(event?: Event): void {
  if (isCleanedUp) {
    return;
  }
  isCleanedUp = true;

  // Distinguish BFCache suspension from permanent page unload
  const isBfCacheSuspension =
    typeof PageTransitionEvent !== 'undefined' &&
    event instanceof PageTransitionEvent &&
    event.persisted;

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  window.removeEventListener('popstate', scheduleEvaluation);
  window.removeEventListener('hashchange', scheduleEvaluation);

  sendBackgroundMessage({
    type: 'CS_DISCONNECTED',
    url: window.location.href,
    timestamp: Date.now(),
  });

  // If suspended into BFCache, monitoring will cleanly re-arm upon pageshow
  if (isBfCacheSuspension) {
    lastReportedState = null;
  }
}

/**
 * Handles browser Back/Forward Cache (BFCache) restoration.
 * When a suspended page is restored from cache, re-arms monitoring and reports state.
 */
function handlePageShow(event: PageTransitionEvent): void {
  // Only handle BFCache restoration (initial page loads are handled during initializeContentScript)
  if (!event.persisted) {
    return;
  }

  // 1. Reset cleanup latch for the revived page lifecycle
  isCleanedUp = false;

  // 2. Re-register one-time teardown listeners for the next transition/unload
  window.addEventListener('beforeunload', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });

  // 3. Ensure navigation listeners are cleanly attached exactly once
  window.removeEventListener('popstate', scheduleEvaluation);
  window.removeEventListener('hashchange', scheduleEvaluation);
  window.addEventListener('popstate', scheduleEvaluation);
  window.addEventListener('hashchange', scheduleEvaluation);

  // 4. Restart MutationObserver on the restored DOM
  startObserver();

  // 5. Force-report current portal state so background can restore its active-tab state
  evaluatePageState(true);
}

/* ==========================================================================
   Initialization (Singleton Guard)
   ========================================================================== */

function initializeContentScript(): void {
  // Guard against duplicate injection
  const globalScope = window as unknown as { __LPUNEXUS_CONTENT_INITIALIZED__?: boolean };
  if (globalScope.__LPUNEXUS_CONTENT_INITIALIZED__) {
    return;
  }
  globalScope.__LPUNEXUS_CONTENT_INITIALIZED__ = true;

  // Validate UMS Hostname
  if (!isUmsHostname(window.location.hostname)) {
    return;
  }

  // Register one-time teardown listeners
  window.addEventListener('beforeunload', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });

  // Register persistent BFCache restoration listener
  window.addEventListener('pageshow', handlePageShow);

  // Non-invasive same-document navigation listeners
  window.addEventListener('popstate', scheduleEvaluation);
  window.addEventListener('hashchange', scheduleEvaluation);

  // Initial detection and observation
  evaluatePageState();
  startObserver();
}

initializeContentScript();

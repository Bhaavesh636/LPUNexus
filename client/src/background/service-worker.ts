/**
 * LpuNexus — Background Service Worker
 * Phase 2: Central state orchestrator connecting Content Scripts <-> Side Panel.
 *
 * Responsibilities:
 * 1. Tracks authoritative UMS tab state across multiple browser windows.
 * 2. Manages side-panel port lifecycles using WeakMap to prevent retention leaks.
 * 3. Enforces two-phase atomic window binding with dedicated error boundaries.
 * 4. Dispatches monotonic sequences (seq) stamped with a unique runtime sessionId.
 * 5. Guarantees atomic tab tracking with double-checked sequence validation on rapid switching.
 * 6. Handles independent non-UMS navigation cleanup and rehydration mutex with session storage.
 * 7. Enforces strict content-script sender authorization and canonical URL correspondence.
 */

import {
  ActiveUmsTabInfo,
  UmsPageState,
} from '../shared/types';
import {
  NEXUS_PORT_NAME,
  BackgroundToSidepanelMessage,
  CsPreflightDismissedMessage,
} from '../shared/messages';

/* ==========================================================================
   1. Service Worker Session Identity & Message Sequencing
   ========================================================================== */

/** Unique identifier generated at service worker startup */
const BG_SESSION_ID = `nexus_bg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/** Monotonically increasing sequence number scoped to this background session */
let globalMessageSequence = 0;

// Configure the side panel to open when the user clicks the extension's toolbar action icon
if (typeof chrome !== 'undefined' && chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error('[LpuNexus BG] Failed to set side panel behavior:', err);
  });
}

/* ==========================================================================
   2. In-Memory State, Port Lifecycles & Storage Keys
   ========================================================================== */

const SESSION_KEY_TAB_ENTRIES = 'nexus_session_tab_entries';
const SESSION_KEY_WINDOW_ACTIVE = 'nexus_session_window_active';

/** Map of all known UMS tabs: tabId -> ActiveUmsTabInfo */
const tabStateMap = new Map<number, ActiveUmsTabInfo>();

/** Map of active UMS tabs per browser window: windowId -> active tabId (or null) */
const windowActiveTabMap = new Map<number, number | null>();

/** Map of the latest activated tabId per browser window to prevent activation races: windowId -> tabId */
const latestActivatedTabMap = new Map<number, number>();

/** Explicit four-state lifecycle for Side Panel connections */
export type PortLifecycleState = 'unbound' | 'binding' | 'bound' | 'disconnected';

/**
 * WeakMap tracks port lifecycle without retaining disconnected port references.
 * When the port object is released by Chrome and async closures resolve,
 * it is garbage-collected automatically without memory leaks.
 */
const portLifecycleMap = new WeakMap<chrome.runtime.Port, PortLifecycleState>();

/**
 * Active Side Panel ports and their associated browser window IDs.
 * Explicitly purged on port disconnection or communication failure.
 */
const portToWindowMap = new Map<chrome.runtime.Port, number>();

/* ==========================================================================
   3. Helpers & Runtime Validation
   ========================================================================== */

/** Complete set of authoritative UmsPageState values */
const VALID_UMS_PAGE_STATES: ReadonlySet<string> = new Set<UmsPageState>([
  'LOGIN_PAGE',
  'CLOUDFLARE_VERIFICATION',
  'DASHBOARD_READY',
  'ATTENDANCE_MODAL_MOUNTED',
  'EXAMINATION_PAGE',
  'TIMETABLE_PAGE',
  'UNKNOWN',
]);

/**
 * Validates whether an unknown value is a generic object record.
 */
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Validates whether an unknown value is a non-negative integer (>= 0).
 */
function isValidNonNegativeInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
}

/**
 * Validates whether a value is a legitimate UmsPageState union member.
 */
function isValidUmsPageState(state: unknown): state is UmsPageState {
  return typeof state === 'string' && VALID_UMS_PAGE_STATES.has(state);
}

/**
 * Validates whether a timestamp is a finite positive number.
 */
function isValidTimestamp(ts: unknown): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0;
}

/**
 * Validates whether a URL strictly belongs to an authorized UMS portal hostname.
 */
function isUmsUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'ums.lpu.in' || host === 'studentums.lpu.in';
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL for canonical comparison:
 * parses via URL, lowercases protocol and hostname, removes default ports (80/443),
 * strips trailing slashes on pathname (except root "/"), preserves exact query parameter
 * ordering and duplicate keys without sorting, and optionally strips fragments.
 */
function normalizeUrl(rawUrl: string, stripHash = false): string | null {
  try {
    const parsed = new URL(rawUrl);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    if (stripHash) {
      parsed.hash = '';
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Verifies whether two URLs correspond to the exact same document after normalization.
 */
function areUrlsEquivalent(urlA: string, urlB: string): boolean {
  const normA = normalizeUrl(urlA);
  const normB = normalizeUrl(urlB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const noHashA = normalizeUrl(urlA, true);
  const noHashB = normalizeUrl(urlB, true);
  return noHashA !== null && noHashA === noHashB;
}

/**
 * Pure type guard validating CsPreflightDismissedMessage without type assertions.
 */
function isCsPreflightDismissedMessage(val: unknown): val is CsPreflightDismissedMessage {
  if (!isRecord(val)) return false;
  return (
    val.type === 'CS_PREFLIGHT_DISMISSED' &&
    typeof val.modalSelector === 'string' &&
    val.modalSelector.trim().length > 0 &&
    isValidTimestamp(val.timestamp)
  );
}

/* ==========================================================================
   4. Rehydration Mutex & Session Storage Coordination
   ========================================================================== */

let isRehydrated = false;
let rehydrationPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Ensures session state rehydration from chrome.storage.session has completed
 * before any event handler reads or mutates the in-memory tab state.
 */
async function ensureRehydrated(): Promise<void> {
  if (isRehydrated) return;
  if (!rehydrationPromise) {
    rehydrationPromise = (async () => {
      try {
        const data = await chrome.storage.session.get([
          SESSION_KEY_TAB_ENTRIES,
          SESSION_KEY_WINDOW_ACTIVE,
        ]);

        if (Array.isArray(data[SESSION_KEY_TAB_ENTRIES])) {
          for (const item of data[SESSION_KEY_TAB_ENTRIES]) {
            if (
              item &&
              typeof item.tabId === 'number' &&
              typeof item.url === 'string' &&
              isValidUmsPageState(item.state) &&
              isValidTimestamp(item.timestamp)
            ) {
              tabStateMap.set(item.tabId, {
                tabId: item.tabId,
                url: item.url,
                title: typeof item.title === 'string' ? item.title : undefined,
                state: item.state,
                timestamp: item.timestamp,
              });
            }
          }
        }

        if (data[SESSION_KEY_WINDOW_ACTIVE] && typeof data[SESSION_KEY_WINDOW_ACTIVE] === 'object') {
          for (const [key, val] of Object.entries(data[SESSION_KEY_WINDOW_ACTIVE])) {
            const winId = Number(key);
            if (isValidNonNegativeInteger(winId)) {
              if (val === null || (typeof val === 'number' && isValidNonNegativeInteger(val))) {
                windowActiveTabMap.set(winId, val);
              }
            }
          }
        }

        await reconcileWithOpenTabs();
      } catch (err) {
        console.error('[LpuNexus BG] Failed to rehydrate session storage:', err);
      } finally {
        isRehydrated = true;
      }
    })();
  }
  return rehydrationPromise;
}

/**
 * Reconciles in-memory state against live open tabs on worker startup.
 */
async function reconcileWithOpenTabs(): Promise<void> {
  try {
    const liveTabs = await chrome.tabs.query({});
    const liveTabIdSet = new Set<number>();

    for (const tab of liveTabs) {
      if (tab.id !== undefined && isValidNonNegativeInteger(tab.id)) {
        liveTabIdSet.add(tab.id);
        if (tab.url && isUmsUrl(tab.url)) {
          const existing = tabStateMap.get(tab.id);
          if (!existing) {
            tabStateMap.set(tab.id, {
              tabId: tab.id,
              url: tab.url,
              title: tab.title,
              state: 'UNKNOWN',
              timestamp: Date.now(),
            });
          } else {
            existing.url = tab.url;
            existing.title = tab.title ?? existing.title;
          }
          if (tab.active && tab.windowId !== undefined && isValidNonNegativeInteger(tab.windowId)) {
            windowActiveTabMap.set(tab.windowId, tab.id);
          }
        }
      }
    }

    // Prune closed tabs
    for (const cachedTabId of tabStateMap.keys()) {
      if (!liveTabIdSet.has(cachedTabId)) {
        tabStateMap.delete(cachedTabId);
      }
    }

    // Clean window mappings
    for (const [winId, activeId] of windowActiveTabMap.entries()) {
      if (activeId !== null && !liveTabIdSet.has(activeId)) {
        windowActiveTabMap.set(winId, null);
      }
    }
  } catch (err) {
    console.error('[LpuNexus BG] Tab reconciliation failed:', err);
  }
}

/**
 * Serializes and schedules persistence of active UMS state to chrome.storage.session.
 */
function schedulePersistSession(): void {
  writeQueue = writeQueue
    .then(async () => {
      const tabEntries = Array.from(tabStateMap.values());
      const windowEntries: Record<number, number | null> = {};
      for (const [winId, tabId] of windowActiveTabMap.entries()) {
        windowEntries[winId] = tabId;
      }

      await chrome.storage.session.set({
        [SESSION_KEY_TAB_ENTRIES]: tabEntries,
        [SESSION_KEY_WINDOW_ACTIVE]: windowEntries,
      });
    })
    .catch((err) => {
      console.error('[LpuNexus BG] Failed to persist session state:', err);
    });
}

/* ==========================================================================
   5. Port Management & Communication Safeguards
   ========================================================================== */

/**
 * Unified terminal disconnect handler invoked by onDisconnect,
 * safePostMessage failure, and authorization rejection.
 */
function handlePortTermination(port: chrome.runtime.Port): void {
  portLifecycleMap.set(port, 'disconnected');
  portToWindowMap.delete(port);
}

/**
 * Safely posts a message to a side panel port, catching communication errors
 * and permanently transitioning dead ports to 'disconnected'.
 */
function safePostMessage(port: chrome.runtime.Port, message: BackgroundToSidepanelMessage): boolean {
  try {
    port.postMessage(message);
    return true;
  } catch {
    handlePortTermination(port);
    return false;
  }
}

/**
 * Dispatches a message exclusively to Side Panel ports belonging to a specific window.
 */
function broadcastToWindow(windowId: number, message: BackgroundToSidepanelMessage): void {
  if (!isValidNonNegativeInteger(windowId)) return;
  for (const [port, portWindowId] of portToWindowMap.entries()) {
    if (portWindowId === windowId) {
      safePostMessage(port, message);
    }
  }
}

/**
 * Dedicated tab inspection helper: queries active tab in window and dispatches
 * state snapshot without reverting window binding if tabs query fails.
 */
async function dispatchCurrentTabState(
  targetPort: chrome.runtime.Port,
  windowId: number,
  isInitialSnapshot: boolean
): Promise<void> {
  let activeTab: chrome.tabs.Tab | undefined;

  try {
    const activeTabs = await chrome.tabs.query({ active: true, windowId });
    if (portLifecycleMap.get(targetPort) !== 'bound') {
      return; // Disconnected while querying tabs
    }
    activeTab = activeTabs[0];
  } catch {
    // Tab query error: does NOT revert window binding or report WINDOW_NOT_FOUND.
    if (portLifecycleMap.get(targetPort) !== 'bound') {
      return;
    }
    safePostMessage(targetPort, {
      type: 'BG_UMS_DISCONNECTED',
      reason: 'NO_ACTIVE_UMS_TAB',
      isInitialSnapshot,
      sessionId: BG_SESSION_ID,
      seq: ++globalMessageSequence,
      timestamp: Date.now(),
    });
    return;
  }

  if (portLifecycleMap.get(targetPort) !== 'bound') {
    return;
  }

  let outboundMsg: BackgroundToSidepanelMessage;

  if (activeTab && isValidNonNegativeInteger(activeTab.id) && activeTab.url && isUmsUrl(activeTab.url)) {
    const cachedState = tabStateMap.get(activeTab.id);
    if (cachedState) {
      outboundMsg = {
        type: 'BG_TAB_STATE_CHANGED',
        tab: {
          ...cachedState,
          windowId,
          preflight: null,
        },
        isInitialSnapshot,
        sessionId: BG_SESSION_ID,
        seq: ++globalMessageSequence,
        timestamp: Date.now(),
      };
    } else {
      const initial: ActiveUmsTabInfo = {
        tabId: activeTab.id,
        url: activeTab.url,
        title: activeTab.title,
        state: 'UNKNOWN',
        timestamp: Date.now(),
      };
      tabStateMap.set(activeTab.id, initial);
      windowActiveTabMap.set(windowId, activeTab.id);
      schedulePersistSession();

      outboundMsg = {
        type: 'BG_TAB_STATE_CHANGED',
        tab: {
          ...initial,
          windowId,
          preflight: null,
        },
        isInitialSnapshot,
        sessionId: BG_SESSION_ID,
        seq: ++globalMessageSequence,
        timestamp: Date.now(),
      };
    }
  } else {
    outboundMsg = {
      type: 'BG_UMS_DISCONNECTED',
      reason: 'NO_ACTIVE_UMS_TAB',
      isInitialSnapshot,
      sessionId: BG_SESSION_ID,
      seq: ++globalMessageSequence,
      timestamp: Date.now(),
    };
  }

  if (portLifecycleMap.get(targetPort) !== 'bound') {
    return;
  }

  safePostMessage(targetPort, outboundMsg);
}

/* ==========================================================================
   6. Side Panel Port Connection Lifecycle
   ========================================================================== */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== NEXUS_PORT_NAME) return;

  // Verify sender identity strictly belongs to this extension
  if (port.sender?.id !== chrome.runtime.id) {
    handlePortTermination(port);
    try {
      port.disconnect();
    } catch {
      // Ignore disconnect error on rejected port
    }
    return;
  }

  // Register initial unbound state
  portLifecycleMap.set(port, 'unbound');

  // Immediately register disconnect listener to enforce terminal disconnection
  port.onDisconnect.addListener(() => {
    handlePortTermination(port);
  });

  // Register message listener handling two-phase window binding handshake
  port.onMessage.addListener(async (rawMsg: unknown) => {
    if (!isRecord(rawMsg) || typeof rawMsg.type !== 'string' || !isValidTimestamp(rawMsg.timestamp)) {
      return;
    }

    const currentLifecycle = portLifecycleMap.get(port);

    if (currentLifecycle === 'disconnected') {
      return; // Permanently unusable
    }

    if (currentLifecycle === 'binding') {
      return; // Handshake already in progress; drop duplicate
    }

    if (currentLifecycle === 'bound') {
      // Accept only SP_GET_CURRENT_STATE and SP_REFRESH_TAB_REQUEST
      if (rawMsg.type !== 'SP_GET_CURRENT_STATE' && rawMsg.type !== 'SP_REFRESH_TAB_REQUEST') {
        return;
      }

      if (!isValidTimestamp(rawMsg.timestamp)) {
        return;
      }

      if (!isValidNonNegativeInteger(rawMsg.windowId)) {
        return;
      }

      const boundWindowId = portToWindowMap.get(port);
      if (typeof boundWindowId !== 'number' || rawMsg.windowId !== boundWindowId) {
        // Missing, invalid, or mismatched windowId rejected; do not trigger dispatch
        return;
      }

      // Repeated request for SAME window: deliver current state as standard update (NOT initial snapshot)
      await dispatchCurrentTabState(port, boundWindowId, false);
      return;
    }

    // Port is 'unbound': Begin Phase 1 (Window Binding)
    if (rawMsg.type === 'SP_GET_CURRENT_STATE' || rawMsg.type === 'SP_REFRESH_TAB_REQUEST') {
      portLifecycleMap.set(port, 'binding');

      let validatedWindowId: number;

      // --- Boundary 1: Window Validation (Transport Layer) ---
      try {
        if (!isValidNonNegativeInteger(rawMsg.windowId)) {
          throw new Error('Invalid windowId parameter');
        }
        const windowInfo = await chrome.windows.get(rawMsg.windowId);
        if (!isValidNonNegativeInteger(windowInfo.id)) {
          throw new Error('Window does not exist');
        }
        validatedWindowId = windowInfo.id;
      } catch {
        // ONLY chrome.windows.get failure triggers WINDOW_NOT_FOUND
        if (portLifecycleMap.get(port) === 'binding') {
          portLifecycleMap.set(port, 'unbound');
        }
        if (portLifecycleMap.get(port) !== 'disconnected') {
          safePostMessage(port, {
            type: 'BG_UMS_DISCONNECTED',
            reason: 'WINDOW_NOT_FOUND',
            isInitialSnapshot: true,
            sessionId: BG_SESSION_ID,
            seq: ++globalMessageSequence,
            timestamp: Date.now(),
          });
        }
        return;
      }

      // Lifecycle check immediately after chrome.windows.get resolves
      if (portLifecycleMap.get(port) !== 'binding') {
        return; // Port disconnected while window lookup was in flight
      }

      // Establish Authoritative Window Binding
      portLifecycleMap.set(port, 'bound');
      portToWindowMap.set(port, validatedWindowId);

      await ensureRehydrated();

      // --- Boundary 2: Active Tab Lookup (Application Layer) ---
      await dispatchCurrentTabState(port, validatedWindowId, true);
    }
  });
});

/* ==========================================================================
   7. Content-to-Background Message Handling
   ========================================================================== */

chrome.runtime.onMessage.addListener((rawMsg: unknown, sender) => {
  // 1. Frame Isolation: Require top-level main frame strictly (frameId === 0)
  if (sender.frameId !== 0) {
    console.warn('[LpuNexus BG] Rejected message: sender is not main frame (frameId !== 0)', sender.frameId);
    return;
  }

  // 2. Document URL Verification: sender.url must be present and on an authorized UMS hostname
  const senderDocUrl = sender.url;
  if (!senderDocUrl || !isUmsUrl(senderDocUrl)) {
    console.warn('[LpuNexus BG] Rejected message: sender.url is missing or not an authorized UMS page', senderDocUrl);
    return;
  }

  // 3. Tab Context Verification: sender.tab.id and sender.tab.windowId must be valid non-negative integers
  const tabId = sender.tab?.id;
  if (!isValidNonNegativeInteger(tabId)) {
    console.warn('[LpuNexus BG] Rejected message: sender.tab.id is missing or not a non-negative integer', tabId);
    return;
  }

  const windowId = sender.tab?.windowId;
  if (!isValidNonNegativeInteger(windowId)) {
    console.warn('[LpuNexus BG] Rejected message: sender.tab.windowId is missing or not a non-negative integer', windowId);
    return;
  }

  // 4. Tab URL Verification: sender.tab.url must independently be an authorized UMS URL
  const senderTabUrl = sender.tab?.url;
  if (!senderTabUrl || !isUmsUrl(senderTabUrl)) {
    console.warn('[LpuNexus BG] Rejected message: sender.tab.url is not an authorized UMS page', senderTabUrl);
    return;
  }

  // 5. Document-to-Tab URL Correspondence Verification:
  // sender.url must correspond to sender.tab.url using the canonical equivalence helper
  // (preserving exact query parameter order and duplicate keys without sorting)
  if (!areUrlsEquivalent(senderDocUrl, senderTabUrl)) {
    console.warn('[LpuNexus BG] Rejected message: sender.url does not correspond to sender.tab.url', {
      senderDocUrl,
      senderTabUrl,
    });
    return;
  }

  // 6. Runtime Message Structural Verification (Zero Type Assertions)
  if (!isRecord(rawMsg) || typeof rawMsg.type !== 'string') {
    return;
  }

  void (async () => {
    await ensureRehydrated();

    if (rawMsg.type === 'CS_PAGE_STATE_CHANGED') {
      if (!isValidUmsPageState(rawMsg.state)) {
        console.warn('[LpuNexus BG] Rejected CS_PAGE_STATE_CHANGED: invalid state', rawMsg.state);
        return;
      }
      if (typeof rawMsg.url !== 'string' || !isUmsUrl(rawMsg.url)) {
        console.warn('[LpuNexus BG] Rejected CS_PAGE_STATE_CHANGED: invalid UMS url', rawMsg.url);
        return;
      }
      if (!isValidTimestamp(rawMsg.timestamp)) {
        console.warn('[LpuNexus BG] Rejected CS_PAGE_STATE_CHANGED: invalid timestamp', rawMsg.timestamp);
        return;
      }

      // Verify that rawMsg.url corresponds to the actual sender document URL
      if (!areUrlsEquivalent(rawMsg.url, senderDocUrl)) {
        console.warn('[LpuNexus BG] Rejected CS_PAGE_STATE_CHANGED: URL does not correspond to sender document URL', {
          msgUrl: rawMsg.url,
          senderDocUrl,
        });
        return;
      }

      const tabInfo: ActiveUmsTabInfo = {
        tabId,
        url: rawMsg.url,
        title: sender.tab?.title,
        state: rawMsg.state,
        timestamp: rawMsg.timestamp,
      };

      tabStateMap.set(tabId, tabInfo);

      const currentActiveInWindow = windowActiveTabMap.get(windowId);
      if (currentActiveInWindow === tabId || sender.tab?.active) {
        windowActiveTabMap.set(windowId, tabId);
        broadcastToWindow(windowId, {
          type: 'BG_TAB_STATE_CHANGED',
          tab: {
            ...tabInfo,
            windowId,
            preflight: null,
          },
          timestamp: Date.now(),
          sessionId: BG_SESSION_ID,
          seq: ++globalMessageSequence,
        });
      }

      schedulePersistSession();
    } else if (rawMsg.type === 'CS_PREFLIGHT_DISMISSED') {
      if (!isCsPreflightDismissedMessage(rawMsg)) {
        console.warn('[LpuNexus BG] Rejected CS_PREFLIGHT_DISMISSED: malformed payload', rawMsg);
        return;
      }

      // Only broadcast if the sender tab is currently the active tab for its verified window
      if (windowActiveTabMap.get(windowId) === tabId) {
        broadcastToWindow(windowId, {
          type: 'BG_PREFLIGHT_NOTIFICATION',
          modalSelector: rawMsg.modalSelector.trim(),
          // tabId and windowId are derived EXCLUSIVELY from validated sender context
          tabId,
          windowId,
          timestamp: rawMsg.timestamp,
          sessionId: BG_SESSION_ID,
          seq: ++globalMessageSequence,
        });
      } else {
        console.log(`[LpuNexus BG] Ignored CS_PREFLIGHT_DISMISSED from non-active tab ${tabId} in window ${windowId}`);
      }
    } else if (rawMsg.type === 'CS_DISCONNECTED') {
      if (typeof rawMsg.url !== 'string' || !isUmsUrl(rawMsg.url)) {
        console.warn('[LpuNexus BG] Rejected CS_DISCONNECTED: invalid UMS url');
        return;
      }
      if (!isValidTimestamp(rawMsg.timestamp)) {
        console.warn('[LpuNexus BG] Rejected CS_DISCONNECTED: invalid timestamp');
        return;
      }

      console.log(`[LpuNexus BG] CS_DISCONNECTED received for tab ${tabId}; state retained pending authoritative lifecycle event.`);
    }
  })();
});

/* ==========================================================================
   8. Tab Lifecycle Event Handlers (Authoritative State Transitions)
   ========================================================================== */

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const { tabId, windowId } = activeInfo;
  if (!isValidNonNegativeInteger(windowId) || !isValidNonNegativeInteger(tabId)) return;

  // Track the latest requested activation for this window synchronously
  latestActivatedTabMap.set(windowId, tabId);

  await ensureRehydrated();

  try {
    const tab = await chrome.tabs.get(tabId);

    // Guard against race conditions from rapid tab switching:
    // 1. Verify this invocation still matches the latest activation event in this window.
    if (latestActivatedTabMap.get(windowId) !== tabId) {
      return;
    }

    // 2. Verify with live tabs that this tab is still the active tab in the specified window.
    const activeTabs = await chrome.tabs.query({ active: true, windowId });
    if (!activeTabs[0] || activeTabs[0].id !== tabId) {
      return;
    }

    // 3. Re-verify latestActivatedTabMap immediately before any mutation or broadcast,
    // ensuring no newer tab activation occurred while chrome.tabs.query was pending.
    if (latestActivatedTabMap.get(windowId) !== tabId) {
      return;
    }

    if (isUmsUrl(tab.url)) {
      windowActiveTabMap.set(windowId, tabId);
      const existing = tabStateMap.get(tabId);

      if (existing) {
        broadcastToWindow(windowId, {
          type: 'BG_TAB_STATE_CHANGED',
          tab: {
            ...existing,
            windowId,
            preflight: null,
          },
          timestamp: Date.now(),
          sessionId: BG_SESSION_ID,
          seq: ++globalMessageSequence,
        });
      } else {
        const initial: ActiveUmsTabInfo = {
          tabId,
          url: tab.url || '',
          title: tab.title,
          state: 'UNKNOWN',
          timestamp: Date.now(),
        };
        tabStateMap.set(tabId, initial);
        broadcastToWindow(windowId, {
          type: 'BG_TAB_STATE_CHANGED',
          tab: {
            ...initial,
            windowId,
            preflight: null,
          },
          timestamp: Date.now(),
          sessionId: BG_SESSION_ID,
          seq: ++globalMessageSequence,
        });
      }
    } else {
      windowActiveTabMap.set(windowId, null);
      broadcastToWindow(windowId, {
        type: 'BG_UMS_DISCONNECTED',
        reason: 'NO_ACTIVE_UMS_TAB',
        timestamp: Date.now(),
        sessionId: BG_SESSION_ID,
        seq: ++globalMessageSequence,
      });
    }

    schedulePersistSession();
  } catch {
    // Tab closed before handler completed
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await ensureRehydrated();
  const windowId = tab.windowId;
  if (!isValidNonNegativeInteger(windowId) || !isValidNonNegativeInteger(tabId)) return;

  const currentUrl = changeInfo.url ?? (changeInfo.status === 'complete' ? tab.url : undefined);

  if (currentUrl) {
    if (!isUmsUrl(currentUrl)) {
      let stateChanged = false;

      // 1. Independent tabStateMap cleanup
      if (tabStateMap.has(tabId)) {
        tabStateMap.delete(tabId);
        stateChanged = true;
      }

      // 2. Independent windowActiveTabMap cleanup
      if (windowActiveTabMap.get(windowId) === tabId) {
        windowActiveTabMap.set(windowId, null);
        stateChanged = true;
        broadcastToWindow(windowId, {
          type: 'BG_UMS_DISCONNECTED',
          reason: 'NAVIGATED_AWAY',
          timestamp: Date.now(),
          sessionId: BG_SESSION_ID,
          seq: ++globalMessageSequence,
        });
      }

      if (stateChanged) {
        schedulePersistSession();
      }

      return;
    }

    // Navigated to another UMS page: update URL and title in place
    const existing = tabStateMap.get(tabId);
    if (existing) {
      existing.url = currentUrl;
      existing.title = tab.title ?? existing.title;
      existing.timestamp = Date.now();

      if (windowActiveTabMap.get(windowId) === tabId) {
        broadcastToWindow(windowId, {
          type: 'BG_TAB_STATE_CHANGED',
          tab: {
            ...existing,
            windowId,
            preflight: null,
          },
          timestamp: Date.now(),
          sessionId: BG_SESSION_ID,
          seq: ++globalMessageSequence,
        });
      }
      schedulePersistSession();
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await ensureRehydrated();
  const windowId = removeInfo.windowId;
  tabStateMap.delete(tabId);

  if (latestActivatedTabMap.get(windowId) === tabId) {
    latestActivatedTabMap.delete(windowId);
  }

  if (windowActiveTabMap.get(windowId) === tabId) {
    windowActiveTabMap.set(windowId, null);
    broadcastToWindow(windowId, {
      type: 'BG_UMS_DISCONNECTED',
      reason: 'TAB_CLOSED',
      timestamp: Date.now(),
      sessionId: BG_SESSION_ID,
      seq: ++globalMessageSequence,
    });
  }

  schedulePersistSession();
});

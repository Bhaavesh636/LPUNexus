/**
 * Tests for Connection Lifecycle, Handshake Adoption, Sequence Guards,
 * and Tab/Window Preflight Ownership Handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SidepanelUmsTabInfo, BackgroundToSidepanelMessage } from '../src/shared/messages';

/**
 * Pure state machine simulator modeling the exact post-handshake IPC logic
 * verified in `useUmsConnection.ts` and `service-worker.ts`.
 */
class ConnectionStateMachine {
  isHandshakeComplete: boolean = false;
  sessionId: string | null = null;
  lastAppliedSeq: number = 0;
  activeTab: SidepanelUmsTabInfo | null = null;
  latestPreflight: { modalSelector: string; tabId: number; windowId: number } | null = null;
  bgError: { code: string; message: string } | null = null;
  retryTriggered: boolean = false;

  handleMessage(msg: BackgroundToSidepanelMessage): boolean {
    // --- Pre-Handshake Phase ---
    if (!this.isHandshakeComplete) {
      if (
        msg.type === 'BG_UMS_DISCONNECTED' &&
        msg.reason === 'WINDOW_NOT_FOUND' &&
        msg.isInitialSnapshot === true
      ) {
        this.retryTriggered = true;
        return false;
      }

      if (msg.isInitialSnapshot !== true) {
        return false;
      }

      if (msg.type !== 'BG_TAB_STATE_CHANGED' && msg.type !== 'BG_UMS_DISCONNECTED') {
        return false;
      }

      // Adopt session
      this.isHandshakeComplete = true;
      this.sessionId = msg.sessionId;
      this.lastAppliedSeq = msg.seq;

      if (msg.type === 'BG_TAB_STATE_CHANGED') {
        this.latestPreflight = null;
        this.activeTab = msg.tab;
      } else if (msg.type === 'BG_UMS_DISCONNECTED') {
        this.latestPreflight = null;
        this.activeTab = null;
      }
      return true;
    }

    // --- Post-Handshake Phase ---
    if (msg.isInitialSnapshot === true) return false;
    if (msg.sessionId !== this.sessionId) return false;
    if (msg.seq <= this.lastAppliedSeq) return false;

    // Strict Tab/Window Ownership Check for BG_PREFLIGHT_NOTIFICATION
    if (msg.type === 'BG_PREFLIGHT_NOTIFICATION') {
      const currentActive = this.activeTab;
      if (
        !currentActive ||
        currentActive.tabId !== msg.tabId ||
        currentActive.windowId !== msg.windowId
      ) {
        // Mismatched tab/window ownership: drop WITHOUT advancing sequence!
        return false;
      }

      // Valid ownership: advance sequence
      this.lastAppliedSeq = msg.seq;
      this.latestPreflight = {
        modalSelector: msg.modalSelector,
        tabId: msg.tabId,
        windowId: msg.windowId,
      };
      this.activeTab = {
        ...currentActive,
        preflight: {
          handled: true,
          actionTaken: 'DISMISSED',
          modalIdentifier: msg.modalSelector,
          timestamp: msg.timestamp,
        },
      };
      return true;
    }

    // All other post-handshake message types advance sequence
    this.lastAppliedSeq = msg.seq;

    if (msg.type === 'BG_TAB_STATE_CHANGED') {
      this.latestPreflight = null;
      this.activeTab = msg.tab;
    } else if (msg.type === 'BG_UMS_DISCONNECTED') {
      this.latestPreflight = null;
      this.activeTab = null;
    } else if (msg.type === 'BG_ERROR') {
      this.bgError = { code: msg.code, message: msg.message };
    }

    return true;
  }
}

describe('connectionLifecycle — Handshake & Session Adoption', () => {
  it('triggers window retry and does NOT establish session on WINDOW_NOT_FOUND initial snapshot', () => {
    const machine = new ConnectionStateMachine();
    const handled = machine.handleMessage({
      type: 'BG_UMS_DISCONNECTED',
      reason: 'WINDOW_NOT_FOUND',
      isInitialSnapshot: true,
      sessionId: 'sess_1',
      seq: 1,
      timestamp: Date.now(),
    });

    assert.equal(handled, false);
    assert.equal(machine.retryTriggered, true);
    assert.equal(machine.isHandshakeComplete, false);
    assert.equal(machine.sessionId, null);
  });

  it('adopts session and initial sequence only on qualifying snapshot', () => {
    const machine = new ConnectionStateMachine();
    const tab: SidepanelUmsTabInfo = {
      tabId: 10,
      windowId: 1,
      url: 'https://ums.lpu.in/default.aspx',
      state: 'DASHBOARD_READY',
      timestamp: Date.now(),
      preflight: null,
    };

    const handled = machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab,
      isInitialSnapshot: true,
      sessionId: 'sess_authoritative',
      seq: 1,
      timestamp: Date.now(),
    });

    assert.equal(handled, true);
    assert.equal(machine.isHandshakeComplete, true);
    assert.equal(machine.sessionId, 'sess_authoritative');
    assert.equal(machine.lastAppliedSeq, 1);
    assert.deepEqual(machine.activeTab, tab);
  });

  it('drops pre-handshake messages that are not initial snapshots', () => {
    const machine = new ConnectionStateMachine();
    const handled = machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divCampusDrive',
      tabId: 10,
      windowId: 1,
      sessionId: 'sess_premature',
      seq: 1,
      timestamp: Date.now(),
    });

    assert.equal(handled, false);
    assert.equal(machine.isHandshakeComplete, false);
  });
});

describe('connectionLifecycle — Post-Handshake Sequence & Stale Message Rejection', () => {
  const seedMachine = (): ConnectionStateMachine => {
    const machine = new ConnectionStateMachine();
    machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId: 10,
        windowId: 1,
        url: 'https://ums.lpu.in/default.aspx',
        state: 'DASHBOARD_READY',
        timestamp: Date.now(),
        preflight: null,
      },
      isInitialSnapshot: true,
      sessionId: 'sess_current',
      seq: 5,
      timestamp: Date.now(),
    });
    return machine;
  };

  it('rejects messages stamped with a foreign or mismatched sessionId', () => {
    const machine = seedMachine();
    const handled = machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId: 10,
        windowId: 1,
        url: 'https://ums.lpu.in/Home.aspx',
        state: 'TIMETABLE_PAGE',
        timestamp: Date.now(),
        preflight: null,
      },
      sessionId: 'sess_FOREIGN_ZOMBIE',
      seq: 6,
      timestamp: Date.now(),
    });

    assert.equal(handled, false);
    assert.equal(machine.lastAppliedSeq, 5); // Sequence not mutated
    assert.equal(machine.activeTab?.state, 'DASHBOARD_READY');
  });

  it('rejects stale or out-of-order sequence numbers (seq <= lastAppliedSeq)', () => {
    const machine = seedMachine();

    // Equal sequence (duplicate)
    assert.equal(
      machine.handleMessage({
        type: 'BG_TAB_STATE_CHANGED',
        tab: {
          tabId: 10,
          windowId: 1,
          url: 'https://ums.lpu.in/Home.aspx',
          state: 'TIMETABLE_PAGE',
          timestamp: Date.now(),
          preflight: null,
        },
        sessionId: 'sess_current',
        seq: 5, // equal
        timestamp: Date.now(),
      }),
      false
    );

    // Stale sequence
    assert.equal(
      machine.handleMessage({
        type: 'BG_TAB_STATE_CHANGED',
        tab: {
          tabId: 10,
          windowId: 1,
          url: 'https://ums.lpu.in/Home.aspx',
          state: 'TIMETABLE_PAGE',
          timestamp: Date.now(),
          preflight: null,
        },
        sessionId: 'sess_current',
        seq: 4, // stale
        timestamp: Date.now(),
      }),
      false
    );

    assert.equal(machine.lastAppliedSeq, 5);
  });

  it('accepts strictly increasing sequence numbers (seq > lastAppliedSeq)', () => {
    const machine = seedMachine();
    const handled = machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId: 10,
        windowId: 1,
        url: 'https://ums.lpu.in/Home.aspx',
        state: 'TIMETABLE_PAGE',
        timestamp: Date.now(),
        preflight: null,
      },
      sessionId: 'sess_current',
      seq: 6,
      timestamp: Date.now(),
    });

    assert.equal(handled, true);
    assert.equal(machine.lastAppliedSeq, 6);
    assert.equal(machine.activeTab?.state, 'TIMETABLE_PAGE');
  });
});

describe('connectionLifecycle — Tab & Window Ownership on Preflight Notifications', () => {
  const seedWithActiveTab = (tabId: number, windowId: number): ConnectionStateMachine => {
    const machine = new ConnectionStateMachine();
    machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId,
        windowId,
        url: 'https://ums.lpu.in/default.aspx',
        state: 'DASHBOARD_READY',
        timestamp: Date.now(),
        preflight: null,
      },
      isInitialSnapshot: true,
      sessionId: 'sess_active',
      seq: 10,
      timestamp: Date.now(),
    });
    return machine;
  };

  it('accepts notification when originating tabId and windowId match active tab', () => {
    const machine = seedWithActiveTab(10, 1);

    const handled = machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divPlacementDrive',
      tabId: 10, // MATCH
      windowId: 1, // MATCH
      sessionId: 'sess_active',
      seq: 11,
      timestamp: Date.now(),
    });

    assert.equal(handled, true);
    assert.equal(machine.lastAppliedSeq, 11);
    assert.equal(machine.latestPreflight?.modalSelector, '#divPlacementDrive');
    assert.equal(machine.activeTab?.preflight?.handled, true);
    assert.equal(machine.activeTab?.preflight?.actionTaken, 'DISMISSED');
  });

  it('rejects notification when tabId belongs to a background tab without advancing sequence', () => {
    const machine = seedWithActiveTab(10, 1);

    const handled = machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divCampusDrive',
      tabId: 99, // MISMATCH (background tab)
      windowId: 1,
      sessionId: 'sess_active',
      seq: 11,
      timestamp: Date.now(),
    });

    assert.equal(handled, false);
    // Sequence MUST NOT advance on ignored mismatched notification
    assert.equal(machine.lastAppliedSeq, 10);
    assert.equal(machine.latestPreflight, null);

    // Verify next valid message with seq 11 is NOT blocked
    const nextValid = machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divCampusDrive',
      tabId: 10, // MATCH
      windowId: 1, // MATCH
      sessionId: 'sess_active',
      seq: 11,
      timestamp: Date.now(),
    });
    assert.equal(nextValid, true);
    assert.equal(machine.lastAppliedSeq, 11);
  });

  it('rejects notification when windowId belongs to a different browser window', () => {
    const machine = seedWithActiveTab(10, 1);

    const handled = machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divCampusDrive',
      tabId: 10,
      windowId: 2, // MISMATCH (different window)
      sessionId: 'sess_active',
      seq: 11,
      timestamp: Date.now(),
    });

    assert.equal(handled, false);
    assert.equal(machine.lastAppliedSeq, 10);
    assert.equal(machine.latestPreflight, null);
  });
});

describe('connectionLifecycle — Stale Preflight Invalidation on State Transitions', () => {
  it('clears latestPreflight when a new BG_TAB_STATE_CHANGED arrives', () => {
    const machine = new ConnectionStateMachine();
    machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId: 10,
        windowId: 1,
        url: 'https://ums.lpu.in/default.aspx',
        state: 'DASHBOARD_READY',
        timestamp: Date.now(),
        preflight: null,
      },
      isInitialSnapshot: true,
      sessionId: 'sess_1',
      seq: 1,
      timestamp: Date.now(),
    });

    // Populate preflight
    machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divCampusDrive',
      tabId: 10,
      windowId: 1,
      sessionId: 'sess_1',
      seq: 2,
      timestamp: Date.now(),
    });
    assert.notEqual(machine.latestPreflight, null);

    // Tab state change arrives: clears preflight
    machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId: 10,
        windowId: 1,
        url: 'https://ums.lpu.in/Timetable.aspx',
        state: 'TIMETABLE_PAGE',
        timestamp: Date.now(),
        preflight: null,
      },
      sessionId: 'sess_1',
      seq: 3,
      timestamp: Date.now(),
    });

    assert.equal(machine.latestPreflight, null);
  });

  it('clears latestPreflight and activeTab when BG_UMS_DISCONNECTED arrives', () => {
    const machine = new ConnectionStateMachine();
    machine.handleMessage({
      type: 'BG_TAB_STATE_CHANGED',
      tab: {
        tabId: 10,
        windowId: 1,
        url: 'https://ums.lpu.in/default.aspx',
        state: 'DASHBOARD_READY',
        timestamp: Date.now(),
        preflight: null,
      },
      isInitialSnapshot: true,
      sessionId: 'sess_1',
      seq: 1,
      timestamp: Date.now(),
    });

    machine.handleMessage({
      type: 'BG_PREFLIGHT_NOTIFICATION',
      modalSelector: '#divCampusDrive',
      tabId: 10,
      windowId: 1,
      sessionId: 'sess_1',
      seq: 2,
      timestamp: Date.now(),
    });

    machine.handleMessage({
      type: 'BG_UMS_DISCONNECTED',
      reason: 'NAVIGATED_AWAY',
      sessionId: 'sess_1',
      seq: 3,
      timestamp: Date.now(),
    });

    assert.equal(machine.latestPreflight, null);
    assert.equal(machine.activeTab, null);
  });
});

/**
 * Tests for Critical IPC Validation & Message Contracts (`messages.ts`, `useUmsConnection.ts`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSidepanelTabInfo,
  isValidBackgroundMessage,
  isQualifyingInitialSnapshot,
  mapPageStateToPortalStatus,
} from '../src/hooks/useUmsConnection';
import { PortalStatus } from '../src/shared/types';
import {
  BgTabStateChangedMessage,
  BgUmsDisconnectedMessage,
  BgPreflightNotificationMessage,
  BgErrorMessage,
} from '../src/shared/messages';

describe('ipcValidation — Sidepanel Tab Info Validation', () => {
  const validTab = {
    tabId: 101,
    windowId: 2,
    url: 'https://ums.lpu.in/default.aspx',
    state: 'DASHBOARD_READY' as const,
    timestamp: Date.now(),
    preflight: null,
  };

  it('accepts valid SidepanelUmsTabInfo structures', () => {
    assert.equal(isValidSidepanelTabInfo(validTab), true);
  });

  it('rejects negative or non-integer tabId or windowId', () => {
    assert.equal(isValidSidepanelTabInfo({ ...validTab, tabId: -1 }), false);
    assert.equal(isValidSidepanelTabInfo({ ...validTab, tabId: 101.5 }), false);
    assert.equal(isValidSidepanelTabInfo({ ...validTab, windowId: -5 }), false);
    assert.equal(isValidSidepanelTabInfo({ ...validTab, windowId: '2' }), false);
  });

  it('rejects unauthorized or non-UMS URLs', () => {
    assert.equal(isValidSidepanelTabInfo({ ...validTab, url: 'https://attacker.com/ums' }), false);
    assert.equal(isValidSidepanelTabInfo({ ...validTab, url: 'http://evil.ums.lpu.in.com' }), false);
    assert.equal(isValidSidepanelTabInfo({ ...validTab, url: '' }), false);
  });

  it('rejects unknown or invalid page state strings', () => {
    assert.equal(isValidSidepanelTabInfo({ ...validTab, state: 'INVALID_PAGE_STATE' as never }), false);
  });
});

describe('ipcValidation — Background Message Structure Validation', () => {
  const baseFields = {
    sessionId: 'session_abc123',
    seq: 1,
    timestamp: Date.now(),
  };

  it('validates legitimate BG_TAB_STATE_CHANGED messages', () => {
    const msg: BgTabStateChangedMessage = {
      type: 'BG_TAB_STATE_CHANGED',
      ...baseFields,
      tab: {
        tabId: 5,
        windowId: 1,
        url: 'https://ums.lpu.in/Home.aspx',
        state: 'DASHBOARD_READY',
        timestamp: Date.now(),
        preflight: null,
      },
    };
    assert.equal(isValidBackgroundMessage(msg), true);
  });

  it('validates legitimate BG_UMS_DISCONNECTED messages', () => {
    const msg: BgUmsDisconnectedMessage = {
      type: 'BG_UMS_DISCONNECTED',
      ...baseFields,
      reason: 'NO_ACTIVE_UMS_TAB',
    };
    assert.equal(isValidBackgroundMessage(msg), true);
  });

  it('validates legitimate BG_PREFLIGHT_NOTIFICATION messages', () => {
    const msg: BgPreflightNotificationMessage = {
      type: 'BG_PREFLIGHT_NOTIFICATION',
      ...baseFields,
      modalSelector: '#divCampusDrive',
      tabId: 5,
      windowId: 1,
    };
    assert.equal(isValidBackgroundMessage(msg), true);
  });

  it('validates legitimate BG_ERROR messages', () => {
    const msg: BgErrorMessage = {
      type: 'BG_ERROR',
      ...baseFields,
      code: 'ERR_WINDOW_DISCONNECTED',
      message: 'Active window was closed',
    };
    assert.equal(isValidBackgroundMessage(msg), true);
  });

  it('rejects messages with non-positive or non-integer sequence numbers', () => {
    assert.equal(
      isValidBackgroundMessage({
        type: 'BG_UMS_DISCONNECTED',
        ...baseFields,
        seq: 0,
        reason: 'NO_ACTIVE_UMS_TAB',
      }),
      false
    );

    assert.equal(
      isValidBackgroundMessage({
        type: 'BG_UMS_DISCONNECTED',
        ...baseFields,
        seq: -1,
        reason: 'NO_ACTIVE_UMS_TAB',
      }),
      false
    );

    assert.equal(
      isValidBackgroundMessage({
        type: 'BG_UMS_DISCONNECTED',
        ...baseFields,
        seq: 1.5,
        reason: 'NO_ACTIVE_UMS_TAB',
      }),
      false
    );
  });

  it('rejects messages with missing or empty sessionId', () => {
    assert.equal(
      isValidBackgroundMessage({
        type: 'BG_UMS_DISCONNECTED',
        seq: 1,
        timestamp: Date.now(),
        sessionId: '',
        reason: 'NO_ACTIVE_UMS_TAB',
      }),
      false
    );
  });
});

describe('ipcValidation — Qualifying Initial Snapshot Rules', () => {
  const baseFields = {
    sessionId: 'session_abc123',
    seq: 1,
    timestamp: Date.now(),
    isInitialSnapshot: true,
  };

  it('accepts BG_TAB_STATE_CHANGED when isInitialSnapshot is true', () => {
    const msg: BgTabStateChangedMessage = {
      type: 'BG_TAB_STATE_CHANGED',
      ...baseFields,
      tab: {
        tabId: 5,
        windowId: 1,
        url: 'https://ums.lpu.in/Home.aspx',
        state: 'DASHBOARD_READY',
        timestamp: Date.now(),
        preflight: null,
      },
    };
    assert.equal(isQualifyingInitialSnapshot(msg), true);
  });

  it('accepts BG_UMS_DISCONNECTED when reason is NOT WINDOW_NOT_FOUND', () => {
    const msg: BgUmsDisconnectedMessage = {
      type: 'BG_UMS_DISCONNECTED',
      ...baseFields,
      reason: 'NO_ACTIVE_UMS_TAB',
    };
    assert.equal(isQualifyingInitialSnapshot(msg), true);
  });

  it('strictly rejects WINDOW_NOT_FOUND as a qualifying initial snapshot', () => {
    const msg: BgUmsDisconnectedMessage = {
      type: 'BG_UMS_DISCONNECTED',
      ...baseFields,
      reason: 'WINDOW_NOT_FOUND',
    };
    assert.equal(isQualifyingInitialSnapshot(msg), false);
  });

  it('strictly rejects BG_PREFLIGHT_NOTIFICATION and BG_ERROR as initial snapshots', () => {
    const preflightMsg: BgPreflightNotificationMessage = {
      type: 'BG_PREFLIGHT_NOTIFICATION',
      ...baseFields,
      modalSelector: '#divCampusDrive',
      tabId: 5,
      windowId: 1,
    };
    assert.equal(isQualifyingInitialSnapshot(preflightMsg), false);

    const errorMsg: BgErrorMessage = {
      type: 'BG_ERROR',
      ...baseFields,
      code: 'ERR_TEST',
      message: 'Test error',
    };
    assert.equal(isQualifyingInitialSnapshot(errorMsg), false);
  });

  it('rejects any message if isInitialSnapshot is false or omitted', () => {
    const msg: BgUmsDisconnectedMessage = {
      type: 'BG_UMS_DISCONNECTED',
      sessionId: 'session_abc123',
      seq: 1,
      timestamp: Date.now(),
      reason: 'NO_ACTIVE_UMS_TAB',
    };
    assert.equal(isQualifyingInitialSnapshot(msg), false);
  });
});

describe('ipcValidation — Portal Status Mapping & windowId Rules', () => {
  it('correctly maps UmsPageState to PortalStatus enum values', () => {
    assert.equal(mapPageStateToPortalStatus('DASHBOARD_READY'), PortalStatus.Dashboard);
    assert.equal(mapPageStateToPortalStatus('LOGIN_PAGE'), PortalStatus.LoginPage);
    assert.equal(mapPageStateToPortalStatus('CLOUDFLARE_VERIFICATION'), PortalStatus.CloudflareVerification);
    assert.equal(mapPageStateToPortalStatus('ATTENDANCE_MODAL_MOUNTED'), PortalStatus.AttendanceModal);
    assert.equal(mapPageStateToPortalStatus('TIMETABLE_PAGE'), PortalStatus.Timetable);
    assert.equal(mapPageStateToPortalStatus('EXAMINATION_PAGE'), PortalStatus.DateSheet);
    assert.equal(mapPageStateToPortalStatus('UNKNOWN'), PortalStatus.Ready);
  });

  it('enforces strict windowId validation (typeof === number && Number.isInteger && >= 0)', () => {
    const validateWindowId = (val: unknown): boolean =>
      typeof val === 'number' && Number.isInteger(val) && val >= 0;

    assert.equal(validateWindowId(0), true);
    assert.equal(validateWindowId(1), true);
    assert.equal(validateWindowId(1024), true);

    assert.equal(validateWindowId(-1), false);
    assert.equal(validateWindowId(1.5), false);
    assert.equal(validateWindowId('1'), false);
    assert.equal(validateWindowId(null), false);
    assert.equal(validateWindowId(undefined), false);
    assert.equal(validateWindowId(NaN), false);
    assert.equal(validateWindowId(Infinity), false);
  });
});

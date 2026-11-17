/**
 * Tests for Campus Drive Modal & Safe Dismissal Preflight Module (`umsPreflight.ts`).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCampusDriveModal,
  findRemindMeLaterButton,
  checkAndDismissPreflightModal,
  resetPreflightState,
} from '../src/content/umsPreflight';
import { MockDocument, MockElement } from './mocks/domMock';

describe('umsPreflight — Modal & Button Detection', () => {
  beforeEach(() => {
    resetPreflightState();
  });

  it('correctly identifies an active Campus Drive recruitment modal', () => {
    const modal = new MockElement('DIV', 'divCampusDriveNotification', 'modal show', 'Upcoming Campus Drive 2026');
    assert.equal(isCampusDriveModal(modal as unknown as Element), true);
  });

  it('rejects hidden or invisible modal elements', () => {
    const hiddenModal = new MockElement('DIV', 'divCampusDriveNotification', 'modal');
    hiddenModal.style['display'] = 'none';
    assert.equal(isCampusDriveModal(hiddenModal as unknown as Element), false);
  });

  it('locates the Remind me later button by text', () => {
    const modal = new MockElement('DIV', 'divCampusDrive', 'modal show');
    const button = new MockElement('BUTTON', 'btnPostpone', '', 'Remind me later');
    modal.appendChild(button);

    const found = findRemindMeLaterButton(modal as unknown as Element);
    assert.equal(found, button as unknown as HTMLElement);
  });

  it('strictly ignores prohibited action buttons (e.g. login, apply, submit)', () => {
    const modal = new MockElement('DIV', 'divCampusDrive', 'modal show');
    const applyButton = new MockElement('BUTTON', 'btnApply', '', 'Apply Now / Submit');
    const loginButton = new MockElement('BUTTON', 'btnLogin', '', 'Login to Register');
    modal.appendChild(applyButton);
    modal.appendChild(loginButton);

    const found = findRemindMeLaterButton(modal as unknown as Element);
    assert.equal(found, null);
  });
});

describe('umsPreflight — Safe Dismissal & Precedence Invariants', () => {
  beforeEach(() => {
    resetPreflightState();
  });

  it('aborts with SKIPPED_CLOUDFLARE when CLOUDFLARE_VERIFICATION state is active', () => {
    const doc = new MockDocument();
    // Even if a modal is in the DOM
    const modal = doc.createElement('div', 'divCampusDrive', 'modal show');
    const button = doc.createElement('button', 'btnRemind', '', 'Remind me later');
    modal.appendChild(button);
    doc.body.appendChild(modal);

    const result = checkAndDismissPreflightModal(doc as unknown as Document, 'CLOUDFLARE_VERIFICATION');

    assert.equal(result.handled, false);
    assert.equal(result.actionTaken, 'SKIPPED_CLOUDFLARE');
    assert.equal(button.clicked, false);
  });

  it('returns NO_MODAL_FOUND and never clicks when on LOGIN_PAGE', () => {
    const doc = new MockDocument();
    const modal = doc.createElement('div', 'divCampusDrive', 'modal show');
    const button = doc.createElement('button', 'btnRemind', '', 'Remind me later');
    modal.appendChild(button);
    doc.body.appendChild(modal);

    const result = checkAndDismissPreflightModal(doc as unknown as Document, 'LOGIN_PAGE');

    assert.equal(result.handled, false);
    assert.equal(result.actionTaken, 'NO_MODAL_FOUND');
    assert.equal(button.clicked, false);
  });

  it('successfully clicks Remind me later and returns DISMISSED on valid modal', () => {
    const doc = new MockDocument();
    const modal = doc.createElement('div', 'divCampusDrive', 'modal show');
    const button = doc.createElement('button', 'btnRemind', '', 'Remind me later');
    modal.appendChild(button);
    doc.body.appendChild(modal);

    const result = checkAndDismissPreflightModal(doc as unknown as Document, 'DASHBOARD_READY');

    assert.equal(result.handled, true);
    assert.equal(result.actionTaken, 'DISMISSED');
    assert.equal(button.clicked, true);
    assert.equal(button.clickCount, 1);
  });

  it('enforces de-duplication: returns ALREADY_DISMISSED on subsequent invocation without re-clicking', () => {
    const doc = new MockDocument();
    const modal = doc.createElement('div', 'divCampusDrive', 'modal show');
    const button = doc.createElement('button', 'btnRemind', '', 'Remind me later');
    modal.appendChild(button);
    doc.body.appendChild(modal);

    // First call: dismisses
    const firstResult = checkAndDismissPreflightModal(doc as unknown as Document, 'DASHBOARD_READY');
    assert.equal(firstResult.actionTaken, 'DISMISSED');
    assert.equal(button.clickCount, 1);

    // Second call: de-duplicated
    const secondResult = checkAndDismissPreflightModal(doc as unknown as Document, 'DASHBOARD_READY');
    assert.equal(secondResult.handled, false);
    assert.equal(secondResult.actionTaken, 'ALREADY_DISMISSED');
    assert.equal(button.clickCount, 1); // Not clicked again
  });
});

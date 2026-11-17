/**
 * Tests for UMS Hostname & Page State Detection Engine (`umsDetector.ts`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isUmsHostname, detectUmsPageState } from '../src/content/umsDetector';
import { MockDocument } from './mocks/domMock';

describe('umsDetector — Hostname Validation', () => {
  it('accepts authorized UMS hostnames case-insensitively', () => {
    assert.equal(isUmsHostname('ums.lpu.in'), true);
    assert.equal(isUmsHostname('studentums.lpu.in'), true);
    assert.equal(isUmsHostname('UMS.LPU.IN'), true);
    assert.equal(isUmsHostname('StudentUMS.lpu.in'), true);
  });

  it('rejects unauthorized or lookalike hostnames', () => {
    assert.equal(isUmsHostname('google.com'), false);
    assert.equal(isUmsHostname('lpu.in'), false);
    assert.equal(isUmsHostname('fakeums.lpu.in'), false);
    assert.equal(isUmsHostname('ums.lpu.in.attacker.com'), false);
    assert.equal(isUmsHostname('evil-ums.lpu.in'), false);
    assert.equal(isUmsHostname(''), false);
  });
});

describe('umsDetector — Page State Precedence & Detection', () => {
  const validLoc = {
    hostname: 'ums.lpu.in',
    pathname: '/default.aspx',
    href: 'https://ums.lpu.in/default.aspx',
  };

  it('returns UNKNOWN if document body is missing or hostname is unauthorized', () => {
    const doc = new MockDocument();
    assert.equal(
      detectUmsPageState(doc as unknown as Document, {
        hostname: 'unauthorized.com',
        pathname: '/',
        href: 'https://unauthorized.com/',
      }),
      'UNKNOWN'
    );
  });

  it('detects CLOUDFLARE_VERIFICATION with absolute priority over login controls', () => {
    const doc = new MockDocument();
    doc.title = 'Just a moment...';

    // Even if login elements are present, Cloudflare MUST take precedence
    const userInput = doc.createElement('input', 'txtUserName');
    userInput.setAttribute('name', 'txtUserName');
    doc.body.appendChild(userInput);

    const state = detectUmsPageState(doc as unknown as Document, validLoc);
    assert.equal(state, 'CLOUDFLARE_VERIFICATION');
  });

  it('detects CLOUDFLARE_VERIFICATION via challenge containers or ray-id', () => {
    const doc1 = new MockDocument();
    doc1.body.appendChild(doc1.createElement('div', 'challenge-running'));
    assert.equal(detectUmsPageState(doc1 as unknown as Document, validLoc), 'CLOUDFLARE_VERIFICATION');

    const doc2 = new MockDocument();
    doc2.body.appendChild(doc2.createElement('div', '', 'ray-id'));
    assert.equal(detectUmsPageState(doc2 as unknown as Document, validLoc), 'CLOUDFLARE_VERIFICATION');
  });

  it('detects LOGIN_PAGE with username, password, and login path', () => {
    const doc = new MockDocument();

    const userInput = doc.createElement('input', 'txtUserName');
    userInput.setAttribute('name', 'txtUserName');
    doc.body.appendChild(userInput);

    const passInput = doc.createElement('input', 'txtPassword');
    passInput.setAttribute('type', 'password');
    doc.body.appendChild(passInput);

    const state = detectUmsPageState(doc as unknown as Document, {
      hostname: 'ums.lpu.in',
      pathname: '/login.aspx',
      href: 'https://ums.lpu.in/login.aspx',
    });
    assert.equal(state, 'LOGIN_PAGE');
  });

  it('rejects LOGIN_PAGE if authenticated shell markers are present', () => {
    const doc = new MockDocument();

    const userInput = doc.createElement('input', 'txtUserName');
    userInput.setAttribute('name', 'txtUserName');
    doc.body.appendChild(userInput);

    const passInput = doc.createElement('input', 'txtPassword');
    passInput.setAttribute('type', 'password');
    doc.body.appendChild(passInput);

    // Authenticated shell marker present
    doc.body.appendChild(doc.createElement('div', 'divMainMenu'));

    const state = detectUmsPageState(doc as unknown as Document, validLoc);
    assert.notEqual(state, 'LOGIN_PAGE');
  });

  it('detects ATTENDANCE_MODAL_MOUNTED when visible attendance modal is open', () => {
    const doc = new MockDocument();

    const modal = doc.createElement('div', 'AttendanceModal', 'modal show');
    modal.style['display'] = 'block';

    const table = doc.createElement('table', 'gvAttendance');
    modal.appendChild(table);
    doc.body.appendChild(modal);

    const state = detectUmsPageState(doc as unknown as Document, validLoc);
    assert.equal(state, 'ATTENDANCE_MODAL_MOUNTED');
  });

  it('detects EXAMINATION_PAGE with seating plan or date sheet markers', () => {
    const doc = new MockDocument();
    doc.body.appendChild(doc.createElement('table', 'gvDateSheet'));

    const state = detectUmsPageState(doc as unknown as Document, {
      hostname: 'studentums.lpu.in',
      pathname: '/datesheet.aspx',
      href: 'https://studentums.lpu.in/datesheet.aspx',
    });
    assert.equal(state, 'EXAMINATION_PAGE');
  });

  it('detects TIMETABLE_PAGE with SSRS ReportViewer or timesheet tables', () => {
    const doc = new MockDocument();
    doc.body.appendChild(doc.createElement('div', 'ReportViewerControl'));

    const state = detectUmsPageState(doc as unknown as Document, {
      hostname: 'studentums.lpu.in',
      pathname: '/studenttimesheet.aspx',
      href: 'https://studentums.lpu.in/studenttimesheet.aspx',
    });
    assert.equal(state, 'TIMETABLE_PAGE');
  });

  it('detects DASHBOARD_READY when 2 or more distinct authenticated signals corroborate', () => {
    const doc = new MockDocument();

    // Signal 1: Main navigation
    doc.body.appendChild(doc.createElement('div', 'divMainMenu'));
    // Signal 2: Logout control
    const logoutLink = doc.createElement('a', 'lnkLogout');
    logoutLink.setAttribute('href', '/logout.aspx');
    doc.body.appendChild(logoutLink);

    const state = detectUmsPageState(doc as unknown as Document, {
      hostname: 'studentums.lpu.in',
      pathname: '/Home.aspx',
      href: 'https://studentums.lpu.in/Home.aspx',
    });
    assert.equal(state, 'DASHBOARD_READY');
  });

  it('returns UNKNOWN if only a single ambiguous signal exists', () => {
    const doc = new MockDocument();
    // Only one signal (e.g. just a logout link without nav or dashboard container)
    const logoutLink = doc.createElement('a', 'lnkLogout');
    logoutLink.setAttribute('href', '/logout.aspx');
    doc.body.appendChild(logoutLink);

    const state = detectUmsPageState(doc as unknown as Document, {
      hostname: 'studentums.lpu.in',
      pathname: '/Home.aspx',
      href: 'https://studentums.lpu.in/Home.aspx',
    });
    assert.equal(state, 'UNKNOWN');
  });
});

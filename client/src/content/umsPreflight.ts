/**
 * LpuNexus — UMS Preflight Modal Detection and Dismissal Module
 * Phase 2: Safeguarded detection and dismissal of blocking Campus Drive recruitment modals.
 *
 * Requirements & Boundaries:
 * - Detects the specific blocking Campus Drive / Placement recruitment modal.
 * - Targets strictly the "Remind me later" dismissal action.
 * - Invariant: Zero interaction when CLOUDFLARE_VERIFICATION is active.
 * - Invariant: Never clicks login, logout, generic close, or security elements.
 * - Zero Chrome API dependencies — pure DOM implementation safe for unit tests.
 */

import { UmsPageState } from '../shared/types';
import { detectUmsPageState } from './umsDetector';

/**
 * Result structure returned by preflight execution.
 */
export interface PreflightResult {
  handled: boolean;
  actionTaken: 'DISMISSED' | 'SKIPPED_CLOUDFLARE' | 'ALREADY_DISMISSED' | 'NO_MODAL_FOUND';
  modalIdentifier?: string;
  buttonText?: string;
  timestamp: number;
}

/**
 * Tracks already dismissed modal elements in memory to avoid duplicate clicks.
 */
const dismissedModals = new WeakSet<Element>();
const dismissedModalIds = new Set<string>();

/* ==========================================================================
   Helper Functions (Safety Checks & Visibility)
   ========================================================================== */

/**
 * Checks whether an element is visible in the active document.
 */
function isElementVisible(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement) {
    if (el.style.display === 'none' || el.style.visibility === 'hidden') {
      return false;
    }
    if (el.hidden) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && el.children.length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Safely extracts normalized lowercase text content from an element.
 */
function getNormalizedText(el: Element | null): string {
  if (!el) return '';
  return (el.textContent || '').trim().toLowerCase();
}

/**
 * Checks whether an element contains prohibited keywords (login, logout, submit).
 */
function isProhibitedButton(btn: HTMLElement): boolean {
  const text = getNormalizedText(btn);
  const id = (btn.id || '').toLowerCase();
  const name = (btn.getAttribute('name') || '').toLowerCase();

  // Guard: Never click authentication or submission controls
  const prohibitedPatterns = [
    'login',
    'log in',
    'sign in',
    'signin',
    'logout',
    'log out',
    'sign out',
    'btnlogin',
    'btnlogout',
    'submit',
    'apply',
    'register',
  ];

  for (const pattern of prohibitedPatterns) {
    if (text.includes(pattern) || id.includes(pattern) || name.includes(pattern)) {
      // Allow if it's explicitly "remind me later"
      if (text.includes('remind') || id.includes('remind') || name.includes('remind')) {
        continue;
      }
      return true;
    }
  }

  return false;
}

/* ==========================================================================
   Modal & Button Detection Rules
   ========================================================================== */

/**
 * Identifies whether a given modal element represents a blocking Campus Drive / Placement modal.
 */
export function isCampusDriveModal(el: Element): boolean {
  if (!isElementVisible(el)) {
    return false;
  }

  const id = (el.id || '').toLowerCase();
  const className = (el.className || '').toString().toLowerCase();
  const text = getNormalizedText(el);

  // Signal 1: ID or class contains campus/placement drive markers
  const idOrClassMatch =
    id.includes('campusdrive') ||
    id.includes('placementdrive') ||
    id.includes('divplacement') ||
    id.includes('drivenotification') ||
    className.includes('campus-drive') ||
    className.includes('placement-drive');

  // Signal 2: Content text explicitly refers to Campus Drive or Placement Notifications
  const textMatch =
    text.includes('campus drive') ||
    text.includes('placement drive') ||
    text.includes('recruitment drive') ||
    text.includes('drive notification') ||
    text.includes('campus recruitment') ||
    text.includes('placement notification');

  // Signal 3: Must be a modal, dialog, or overlay wrapper
  const isModalContainer =
    className.includes('modal') ||
    id.includes('modal') ||
    el.getAttribute('role') === 'dialog' ||
    id.includes('popup') ||
    (el instanceof HTMLElement && el.style.position === 'fixed');

  return (idOrClassMatch || textMatch) && (isModalContainer || textMatch);
}

/**
 * Locates the specific "Remind me later" button inside the verified Campus Drive modal.
 */
export function findRemindMeLaterButton(modal: Element): HTMLElement | null {
  // Query all interactive buttons and links inside the verified modal
  const candidates = modal.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"], a');

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate || !isElementVisible(candidate)) {
      continue;
    }

    // Safety guard against prohibited buttons
    if (isProhibitedButton(candidate)) {
      continue;
    }

    const text = getNormalizedText(candidate);
    const id = (candidate.id || '').toLowerCase();
    const name = (candidate.getAttribute('name') || '').toLowerCase();
    const value = (candidate.getAttribute('value') || '').toLowerCase();

    // Check for exact "Remind me later" or close variants
    const isRemindText =
      text.includes('remind me later') ||
      text.includes('remind later') ||
      text === 'remind me' ||
      value.includes('remind me later') ||
      value.includes('remind later');

    const isRemindAttribute =
      id.includes('remindlater') ||
      id.includes('btnremind') ||
      name.includes('remindlater') ||
      name.includes('btnremind');

    if (isRemindText || isRemindAttribute) {
      return candidate;
    }
  }

  return null;
}

/**
 * Scans the document for any active, visible Campus Drive recruitment modals.
 */
export function findActiveCampusDriveModal(doc: Document): Element | null {
  // Scan common modal dialog containers
  const selectors = [
    '.modal.show',
    '.modal.in',
    'div[id*="CampusDrive" i]',
    'div[id*="PlacementDrive" i]',
    'div[id*="divPlacement" i]',
    'div[id*="Modal"][style*="block"]',
    'div[id*="modal"][style*="block"]',
    'div[role="dialog"]',
    '.modal',
  ];

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el && isCampusDriveModal(el)) {
        return el;
      }
    }
  }

  return null;
}

/* ==========================================================================
   Preflight Execution Engine
   ========================================================================== */

/**
 * Resets memory state of dismissed modals (used during testing and page reloads).
 */
export function resetPreflightState(): void {
  dismissedModalIds.clear();
}

/**
 * Safely inspects the page and dismisses a blocking Campus Drive modal if present.
 *
 * CRITICAL SAFETY RULES:
 * 1. Cloudflare Guard: If the page is in CLOUDFLARE_VERIFICATION, immediately aborts.
 * 2. Unauthenticated Guard: Never runs on LOGIN_PAGE to avoid interfering with auth.
 * 3. Scope Guard: Dispatches click strictly to the verified "Remind me later" button.
 * 4. De-duplication: Remembers dismissed modal IDs and elements to prevent re-clicks.
 *
 * @param doc Target Document (defaults to window.document)
 * @param currentState Optional known UmsPageState to bypass redundant detection
 * @returns PreflightResult
 */
export function checkAndDismissPreflightModal(
  doc?: Document,
  currentState?: UmsPageState
): PreflightResult {
  const currentDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  const now = Date.now();

  if (!currentDoc || !currentDoc.body) {
    return {
      handled: false,
      actionTaken: 'NO_MODAL_FOUND',
      timestamp: now,
    };
  }

  // Guard 1: Verify current page state
  const pageState = currentState ?? detectUmsPageState(currentDoc);

  // STRICT INVARIANT: Complete passivity during Cloudflare verification
  if (pageState === 'CLOUDFLARE_VERIFICATION') {
    return {
      handled: false,
      actionTaken: 'SKIPPED_CLOUDFLARE',
      timestamp: now,
    };
  }

  // Never run preflight clicks on login page
  if (pageState === 'LOGIN_PAGE') {
    return {
      handled: false,
      actionTaken: 'NO_MODAL_FOUND',
      timestamp: now,
    };
  }

  // Find any active, visible Campus Drive recruitment modal
  const modal = findActiveCampusDriveModal(currentDoc);
  if (!modal) {
    return {
      handled: false,
      actionTaken: 'NO_MODAL_FOUND',
      timestamp: now,
    };
  }

  // Check if this modal was already dismissed
  const modalId = modal.id || modal.getAttribute('data-nexus-modal-id') || 'campus-drive-modal';
  if (dismissedModals.has(modal) || dismissedModalIds.has(modalId)) {
    return {
      handled: false,
      actionTaken: 'ALREADY_DISMISSED',
      modalIdentifier: modalId,
      timestamp: now,
    };
  }

  // Find the exact "Remind me later" button inside this verified modal
  const button = findRemindMeLaterButton(modal);
  if (!button) {
    return {
      handled: false,
      actionTaken: 'NO_MODAL_FOUND',
      modalIdentifier: modalId,
      timestamp: now,
    };
  }

  // Double-check modal containment safety
  if (!modal.contains(button)) {
    return {
      handled: false,
      actionTaken: 'NO_MODAL_FOUND',
      timestamp: now,
    };
  }

  // Execute safe targeted click
  try {
    button.click();

    // Mark as dismissed
    dismissedModals.add(modal);
    dismissedModalIds.add(modalId);
    modal.setAttribute('data-nexus-dismissed', 'true');

    return {
      handled: true,
      actionTaken: 'DISMISSED',
      modalIdentifier: modalId,
      buttonText: button.textContent?.trim() || 'Remind me later',
      timestamp: now,
    };
  } catch (error) {
    console.error('[LpuNexus] Failed to dispatch click to preflight modal button:', error);
    return {
      handled: false,
      actionTaken: 'NO_MODAL_FOUND',
      modalIdentifier: modalId,
      timestamp: now,
    };
  }
}

import React, { useState, useEffect } from 'react';
import { PortalStatus, Theme } from '../shared/types';
import { useUmsConnection } from '../hooks/useUmsConnection';
import styles from './App.module.css';

const THEME_STORAGE_KEY = 'nexus_theme';

/**
 * Lightweight inline SVG icons adhering to the strict zero-external-dependency policy.
 */
const NexusLogoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 4v16M20 4v16M4 4l16 16" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
  </svg>
);

const TerminalIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const ShieldIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const SunIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const AlertTriangleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export const App: React.FC = () => {
  // Theme state: defaults to 'light' (Warm Cream) per design requirements
  const [theme, setTheme] = useState<Theme>('light');

  // Phase 2 Step 7: Live Service Worker IPC Connection Hook
  const {
    portalStatus,
    activeTab,
    latestPreflight,
    bgError,
    errorDetail,
    manualReconnect,
  } = useUmsConnection();

  // Restore persisted theme on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
        const savedTheme = result[THEME_STORAGE_KEY] as Theme | undefined;
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme);
          document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      });
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [THEME_STORAGE_KEY]: nextTheme });
    }
  };

  const getStatusLabel = (status: PortalStatus): string => {
    switch (status) {
      case PortalStatus.Ready:
        return 'Connected';
      case PortalStatus.Connecting:
        return 'Connecting...';
      case PortalStatus.Dashboard:
        return 'Dashboard Active';
      case PortalStatus.LoginPage:
        return 'Login Page';
      case PortalStatus.CloudflareVerification:
        return 'Cloudflare Verification';
      case PortalStatus.AttendanceModal:
        return 'Attendance Modal';
      case PortalStatus.Timetable:
        return 'Timetable';
      case PortalStatus.DateSheet:
        return 'Date Sheet';
      case PortalStatus.Error:
        return 'Connection Error';
      case PortalStatus.NotConnected:
      default:
        return 'UMS Disconnected';
    }
  };

  const getStatusClass = (status: PortalStatus): string => {
    switch (status) {
      case PortalStatus.Ready:
      case PortalStatus.Dashboard:
      case PortalStatus.AttendanceModal:
      case PortalStatus.Timetable:
      case PortalStatus.DateSheet:
        return styles.statusReady ?? '';
      case PortalStatus.Connecting:
      case PortalStatus.LoginPage:
      case PortalStatus.CloudflareVerification:
        return styles.statusConnecting ?? '';
      case PortalStatus.Error:
        return styles.statusError ?? '';
      case PortalStatus.NotConnected:
      default:
        return styles.statusNotConnected ?? '';
    }
  };

  return (
    <div className={styles.container}>
      {/* ── Compact Nexus Bar ────────────────────────────────────────────── */}
      <header className={styles.nexusBar}>
        <div className={styles.brand}>
          <NexusLogoIcon className={styles.logoIcon} />
          <h1 className={styles.brandTitle}>LpuNexus</h1>
          <span className={styles.versionBadge}>v0.2.0</span>
        </div>

        <div className={styles.headerRight}>
          <div
            className={`${styles.statusBadge} ${getStatusClass(portalStatus)}`}
            role="status"
            aria-live="polite"
          >
            <span className={styles.statusDot} aria-hidden="true" />
            <span>{getStatusLabel(portalStatus)}</span>
          </div>

          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>

      {/* ── Main Content Viewport ────────────────────────────────────────── */}
      <main className={styles.content}>
        {/* Error / Reconnect State */}
        {portalStatus === PortalStatus.Error && (
          <div className={styles.errorCard} role="alert">
            <div className={styles.errorIconWrapper}>
              <AlertTriangleIcon className={styles.errorIcon} />
            </div>
            <h2 className={styles.errorTitle}>Connection Required</h2>
            <p className={styles.errorDescription}>
              {errorDetail ||
                (bgError ? `[${bgError.code}] ${bgError.message}` : null) ||
                'The background service worker is disconnected or sleeping. Open Lovely Professional University Management System (UMS) in an active tab and click Reconnect.'}
            </p>
            <button
              type="button"
              className={styles.reconnectButton}
              onClick={manualReconnect}
            >
              <RefreshIcon className={styles.buttonIcon} />
              <span>Reconnect</span>
            </button>
          </div>
        )}

        {/* Active UMS Tab Information */}
        {activeTab && portalStatus !== PortalStatus.Error && (
          <div className={styles.activeTabCard}>
            <div className={styles.activeTabHeader}>
              <div className={styles.tabBadge}>UMS Active Tab</div>
              <span className={styles.tabStateBadge}>{activeTab.state}</span>
            </div>

            <div className={styles.tabDetails}>
              <div className={styles.tabTitle} title={activeTab.title || activeTab.url}>
                {activeTab.title || 'Lovely Professional University UMS'}
              </div>
              <div className={styles.tabUrl} title={activeTab.url}>
                {activeTab.url}
              </div>
              <div className={styles.tabMeta}>
                <span>Tab #{activeTab.tabId}</span>
                <span>&bull;</span>
                <span>Window #{activeTab.windowId}</span>
              </div>
            </div>

            {/* Scoped Preflight Dismissal Notification */}
            {latestPreflight && (
              <div className={styles.preflightNotice} role="status">
                <CheckCircleIcon className={styles.noticeIcon} />
                <div className={styles.noticeBody}>
                  <span className={styles.noticeTitle}>Campus Drive Modal Auto-Dismissed</span>
                  <span className={styles.noticeDetail}>
                    Selector: {latestPreflight.modalSelector}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Ready Card (shown when disconnected or waiting for UMS) */}
        {!activeTab && portalStatus !== PortalStatus.Error && (
          <div className={styles.card}>
            <div className={styles.iconWrapper}>
              <TerminalIcon />
            </div>
            <h2 className={styles.cardTitle}>LpuNexus Ready</h2>
            <p className={styles.cardDescription}>
              Extension core mounted successfully. Open Lovely Professional University
              Management System (UMS) in a browser tab to begin session synchronization.
            </p>

            <div className={styles.featureList}>
              <div className={styles.featureItem}>
                <CheckCircleIcon className={styles.featureIcon} />
                <span>Manifest V3 Side Panel IPC active</span>
              </div>
              <div className={styles.featureItem}>
                <ShieldIcon className={styles.featureIcon} />
                <span>Zero-knowledge client architecture active</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── System Footer ────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        Academic Command &bull; Phase 2 Active
      </footer>
    </div>
  );
};

export default App;

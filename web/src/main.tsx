import { createRoot } from 'react-dom/client';
import './index.css';

import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from './lib/supabase';
import { initializeOneSignal } from './lib/onesignal';
import { applyRoomieTheme } from './config/customization';

console.log('[main.tsx] Starting app initialization...');
applyRoomieTheme();

// Initialize PWA Elements (needed for Capacitor Camera on web)
defineCustomElements(window);

// Initialize OneSignal for push notifications (native only)
initializeOneSignal();

// ============================================================
// DEEP LINK LISTENER (MUST be set up BEFORE React renders)
// This ensures the listener is active when app reopens from OAuth
// ============================================================
if (Capacitor.isNativePlatform()) {
  console.log('[main.tsx] Setting up deep link listener (pre-React)...');

  CapacitorApp.addListener('appUrlOpen', async (data: any) => {
    console.log('[main.tsx] 🔗 DEEP LINK RECEIVED:', data.url);

    try {
      const url = new URL(data.url);

      console.log('[main.tsx] URL parts:', {
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
      });

      // Try extracting tokens from HASH first
      let access_token: string | null = null;
      let refresh_token: string | null = null;

      // Method 1: Check URL hash
      if (url.hash && url.hash.length > 1) {
        const hashParams = new URLSearchParams(url.hash.substring(1));
        access_token = hashParams.get('access_token');
        refresh_token = hashParams.get('refresh_token');
        console.log('[main.tsx] Tokens from HASH:', { access_token: !!access_token, refresh_token: !!refresh_token });
      }

      // Method 2: Check query params
      if (!access_token && url.search) {
        const searchParams = new URLSearchParams(url.search);
        access_token = searchParams.get('access_token');
        refresh_token = searchParams.get('refresh_token');
        console.log('[main.tsx] Tokens from QUERY:', { access_token: !!access_token, refresh_token: !!refresh_token });
      }

      if (access_token && refresh_token) {
        console.log('[main.tsx] ✅ Setting Supabase session...');

        // Close the in-app browser (SFSafariViewController) if it was used for OAuth
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch { /* Browser may not be open */ }

        // Wait for setSession with timeout
        const setSessionPromise = supabase.auth.setSession({
          access_token,
          refresh_token
        });

        // Also set up a timeout in case setSession hangs
        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            console.log('[main.tsx] setSession timeout, reloading anyway...');
            resolve();
          }, 3000);
        });

        // Race - wait for setSession or timeout
        await Promise.race([setSessionPromise, timeoutPromise]);

        console.log('[main.tsx] Reloading page...');
        window.location.reload();
      } else {
        console.log('[main.tsx] ❌ No tokens found in URL');
      }
    } catch (e) {
      console.error('[main.tsx] Deep link parse error:', e);
    }
  });

  console.log('[main.tsx] ✅ Deep link listener registered');
}

// Log errors but don't show raw stack traces to users
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.error);
  // Don't replace body - let React error boundary handle it
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
  // Don't crash - just log and continue
});

// Fallback UI for fatal errors that happen before React mounts
const showFatalError = () => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #0f172a, #1e293b, #0f172a);
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <div style="max-width: 400px; text-align: center; padding: 24px;">
          <div style="
            width: 80px;
            height: 80px;
            margin: 0 auto 24px;
            border-radius: 50%;
            background: rgba(248, 113, 113, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="40" height="40" fill="none" stroke="#f87171" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 style="color: white; font-size: 24px; font-weight: bold; margin-bottom: 8px;">
            Unable to Load
          </h1>
          <p style="color: #94a3b8; margin-bottom: 32px;">
            We're having trouble loading the app. Please check your connection and try again.
          </p>
          <button onclick="window.location.reload()" style="
            padding: 12px 24px;
            background: #22c55e;
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
          ">
            Try Again
          </button>
        </div>
      </div>
    `;
  }
};

(async () => {
  try {
    console.log('[main.tsx] Importing App component...');
    const { default: App } = await import('./App');
    const { ErrorBoundary } = await import('./components/ErrorBoundary');
    console.log('[main.tsx] App component imported successfully');

    const rootElement = document.getElementById('root');
    console.log('[main.tsx] Root element:', rootElement);

    if (!rootElement) {
      throw new Error('Root element not found! Make sure index.html has <div id="root"></div>');
    }

    console.log('[main.tsx] Creating React root...');
    const root = createRoot(rootElement);
    console.log('[main.tsx] React root created, rendering...');

    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    console.log('[main.tsx] ✅ App rendered successfully!');
  } catch (error) {
    console.error('[main.tsx] ❌ FATAL ERROR:', error);
    showFatalError();
  }
})();

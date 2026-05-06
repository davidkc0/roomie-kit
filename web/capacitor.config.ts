import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.VITE_CAPACITOR_APP_ID || 'app.roomie.starter',
  appName: process.env.VITE_APP_NAME || 'Roomie',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'none', // Prevents webview resize when keyboard opens
      style: 'DARK',
      resizeOnFullScreen: false,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
  },
};

export default config;

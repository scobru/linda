import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shogun.linda',
  appName: 'Linda',
  // Point to Vite build output
  webDir: 'dist',

  // Server configuration
  server: {
    // Allow mixed content (needed for WebSocket / P2P connections during dev)
    // In production, all connections should be HTTPS/WSS
    androidScheme: 'https',
    // Allow navigating to external URLs (needed for Zen relay connections)
    allowNavigation: [
      'localhost',
      '*.shogun.network',
    ],
  },

  // Android-specific configuration
  android: {
    // Allow the WebView to use cleartext traffic for local relay connections
    // This can be disabled if all connections are WSS in production
    allowMixedContent: true,
    // Capture input through WebView for better UX
    captureInput: true,
    // Enable WebRTC (required for P2P file transfers)
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    // SplashScreen configuration
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    // Camera plugin — required for QR code scanner (html5-qrcode)
    Camera: {
      resultType: 'uri',
    },

    // Network plugin — detect connectivity on mobile
    Network: {},

    // Push notifications placeholder — configure with Firebase later
    // PushNotifications: {},
  },
};

export default config;

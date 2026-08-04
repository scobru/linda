import 'webrtc-adapter';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register Service Worker for PWA and Notifications (unsupported on file:// — Electron/Capacitor builds)
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    // Resolve against the app base, not the current route: './sw.js' on a deep
    // route like /chat/<pub> resolved to /chat/sw.js and always 404'd.
    const swUrl = new URL('sw.js', new URL(import.meta.env.BASE_URL, window.location.origin)).href;
    navigator.serviceWorker.register(swUrl)
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

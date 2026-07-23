export interface AppNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  renotify?: boolean;
  data?: any;
}

/**
 * Request notification permissions seamlessly across Web, Electron, and Mobile (Capacitor).
 */
export async function requestNotificationPermission(): Promise<PermissionState | "granted" | "denied" | "default"> {
  // 1. Mobile (Capacitor)
  if (typeof window !== "undefined" && (window as any).Capacitor) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const status = await LocalNotifications.requestPermissions();
      return status.display === "granted" ? "granted" : "denied";
    } catch (e) {
      console.warn("[Notifications] Capacitor LocalNotifications permission request failed:", e);
    }
  }

  // 2. Web / Electron
  if (typeof window !== "undefined" && "Notification" in window) {
    return await Notification.requestPermission();
  }

  return "denied";
}

/**
 * Send a notification seamlessly across Web, Desktop (Electron), and Mobile (Capacitor/Android).
 */
export async function sendAppNotification(title: string, options: AppNotificationOptions = {}) {
  try {
    // 1. Mobile (Capacitor / Android)
    if (typeof window !== "undefined" && (window as any).Capacitor) {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body: options.body || "",
              id: Math.floor(Math.random() * 100000),
              extra: options.data,
            },
          ],
        });
        return;
      } catch (e) {
        console.warn("[Notifications] Capacitor LocalNotifications send failed:", e);
      }
    }

    // 2. Desktop Electron (Bypasses ServiceWorker promise hangs, uses HTML5 Notification directly)
    const isElectron = typeof window !== "undefined" && (
      (window as any).electronAPI || 
      navigator.userAgent.includes("Electron")
    );

    if (isElectron) {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, options);
      }
      return;
    }

    // 3. Standard Web Browser
    if ("serviceWorker" in navigator && Notification.permission === "granted") {
      try {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, options);
        return;
      } catch (e) {
        console.warn("[Notifications] ServiceWorker showNotification failed, using fallback:", e);
      }
    }

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, options);
    }
  } catch (err) {
    console.warn("[Notifications] Failed to send notification:", err);
  }
}

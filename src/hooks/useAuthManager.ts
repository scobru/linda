import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DataBase } from "../zen/db";

export interface Notification {
  msg: string;
  type: "info" | "error";
}

export const useAuthManager = (db: DataBase, isLoggedIn: boolean, userPub: string | null) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const magicLoginAttempted = useRef(false);
  const [isProcessingMagicLink, setIsProcessingMagicLink] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  const showNotification = useCallback(
    (msg: string, type: "info" | "error" = "info") => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
    },
    [],
  );

  const processUniversalLogin = useCallback(
    async (data: string, context: string = "Login") => {
      if (!data) return;
      try {
        console.log(`[Login] ${context} context, processing data...`);
        let payload = data.trim();
        if (payload.endsWith("/")) payload = payload.slice(0, -1);

        if (payload.includes("?session=") || payload.includes("?magic_login=")) {
          try {
            const url = new URL(
              payload.startsWith("http") ? payload : `https://dummy.com/${payload}`
            );
            payload = url.searchParams.get("session") || url.searchParams.get("magic_login") || payload;
          } catch (e) {
            if (payload.includes("?session=")) payload = payload.split("?session=")[1].split("&")[0];
            else if (payload.includes("?magic_login=")) payload = payload.split("?magic_login=")[1].split("&")[0];
          }
        }

        let jsonStr = "";
        let cleanPayload = payload.trim().replace(/ /g, "+");

        try {
          jsonStr = decodeURIComponent(escape(window.atob(cleanPayload)));
        } catch (e) {
          try {
            jsonStr = window.atob(cleanPayload);
          } catch (e2) {
            jsonStr = payload;
          }
        }

        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          throw new Error(`Invalid data format (JSON parse error)`);
        }
        let pair = parsed;
        let usernameToUse = "";

        if (parsed.type === "shogun-auth-pair" && parsed.pair) {
          pair = parsed.pair;
          usernameToUse = parsed.username || "";
        }

        if (pair.pub && pair.priv) {
          let finalUsername = usernameToUse || pair.username || pair.pub;
          if (finalUsername.length > 64) finalUsername = finalUsername.slice(0, 64);

          const displayName = finalUsername.length > 20
            ? `${finalUsername.slice(0, 8)}...${finalUsername.slice(-4)}`
            : finalUsername;

          showNotification("Authenticating...", "info");
          db.logout();
          await db.loginWithPair(finalUsername, pair);

          const gun = db.zen || (window as any).gun;
          let authenticated = false;
          for (let i = 0; i < 30; i++) {
            if (gun && gun.user().is) {
              authenticated = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 100));
          }

          showNotification(`Welcome back, ${displayName}!`, "info");
          return true;
        } else {
          throw new Error("Invalid key pair structure");
        }
      } catch (err: any) {
        showNotification(`Login failed: ${err.message || "Invalid or expired link"}`, "error");
        return false;
      }
    },
    [db, showNotification]
  );

  // Magic Login Hook
  useEffect(() => {
    const magic_login = searchParams.get("magic_login");
    const session = searchParams.get("session");

    if ((magic_login || session) && !isLoggedIn && !magicLoginAttempted.current) {
      magicLoginAttempted.current = true;
      setIsProcessingMagicLink(true);
      processUniversalLogin(magic_login || session!, "Magic Link").then((success) => {
        if (!success) {
          setIsProcessingMagicLink(false);
          magicLoginAttempted.current = false;
        } else {
          setTimeout(() => {
            setIsProcessingMagicLink(false);
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete("magic_login");
            nextUrl.searchParams.delete("session");
            window.history.replaceState({}, document.title, nextUrl.toString());
          }, 1500);
        }
      });
    }
  }, [isLoggedIn, searchParams, processUniversalLogin]);

  // Session Cleanup
  useEffect(() => {
    if (isLoggedIn && isProcessingMagicLink) {
      setIsProcessingMagicLink(false);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("magic_login");
      nextUrl.searchParams.delete("session");
      window.history.replaceState({}, document.title, nextUrl.toString());
    }
  }, [isLoggedIn, isProcessingMagicLink]);

  // Session Restore
  useEffect(() => {
    if (!isLoggedIn && !magicLoginAttempted.current && !isProcessingMagicLink && db && !sessionStorage.getItem("restored_tried")) {
      sessionStorage.setItem("restored_tried", "true");
      if (typeof db.restoreSession === "function") {
        db.restoreSession().catch((e: any) => console.error("Restore failed:", e));
      }
    }
  }, [isLoggedIn, db, isProcessingMagicLink]);

  return {
    isProcessingMagicLink,
    notification,
    showNotification,
    processUniversalLogin
  };
};

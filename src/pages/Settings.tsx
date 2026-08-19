import React from "react";
import { useNavigate } from "react-router-dom";
import type { DataBase } from "linda-core";
import { requestNotificationPermission } from "../utils/notifications";
import { resolveRootOpt, type ZenPeer } from "../utils/connectionHealth";

interface SettingsProps {
  showNotification: (msg: string, type?: "info" | "error") => void;
  db: DataBase;
}

interface RelayStatus {
  url: string;
  state: "connected" | "connecting" | "disconnected";
}

// readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
function relayState(peer: ZenPeer): RelayStatus["state"] {
  const rs = peer.wire?.readyState;
  if (rs === 1) return "connected";
  if (rs === 0 || rs === 2) return "connecting";
  return "disconnected";
}

function useRelayStatuses(db: DataBase): RelayStatus[] {
  const [relays, setRelays] = React.useState<RelayStatus[]>([]);

  React.useEffect(() => {
    const read = () => {
      const opt = resolveRootOpt((db as any).zen);
      const peers: Record<string, ZenPeer> = opt?.peers || {};
      setRelays(
        Object.keys(peers)
          .filter((url) => peers[url]?.url)
          .map((url) => ({ url, state: relayState(peers[url]) })),
      );
    };
    read();
    const interval = setInterval(read, 5000);
    return () => clearInterval(interval);
  }, [db]);

  return relays;
}

const RELAY_STATE_LABEL: Record<RelayStatus["state"], string> = {
  connected: "Connesso",
  connecting: "Connessione...",
  disconnected: "Disconnesso",
};

const RELAY_STATE_DOT: Record<RelayStatus["state"], string> = {
  connected: "bg-success",
  connecting: "bg-warning animate-pulse",
  disconnected: "bg-error",
};

export const Settings: React.FC<SettingsProps> = ({ showNotification, db }) => {
  const navigate = useNavigate();
  const [currentTheme, setCurrentTheme] = React.useState(localStorage.getItem("linda-theme") || "linda");
  const relays = useRelayStatuses(db);

  const logout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/";
  };

  const setTheme = (theme: string) => {
    localStorage.setItem("linda-theme", theme);
    document.documentElement.dataset.theme = theme;
    setCurrentTheme(theme);
    const themeName = theme === "linda" ? "Scuro" : theme === "linda-light" ? "Chiaro" : "Grigio";
    showNotification(`Tema impostato su ${themeName}`, "info");
  };

  const handleReset = () => {
    if (
      window.confirm(
        "Sei sicuro di voler cancellare tutta la cache, localStorage e sessionStorage? Verrai disconnesso."
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  const handleEnableNotifications = () => {
    requestNotificationPermission().then((permission) => {
      showNotification(
        `Notifiche impostate su: ${permission}`,
        permission === "granted" ? "info" : "error"
      );
    });
  };

  return (
    <div className="p-6 sm:p-12 lg:p-16 max-w-2xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto pb-24 scrollbar-hide">
      <div className="flex items-center gap-6 relative z-10">
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate("/")}
          aria-label="Torna indietro"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-4xl font-black tracking-tight text-base-content">Impostazioni</h1>
      </div>

      <div className="space-y-8">
        {/* Notifiche */}
        <div>
          <h2 className="premium-section-title">Notifiche</h2>
          <div className="premium-card-container">
            <div className="premium-card-row">
              <div className="premium-row-left">
                <div className="premium-row-icon bg-primary/10 text-primary">🔔</div>
                <div className="premium-row-info">
                  <div className="premium-row-title">Notifiche Push</div>
                  <div className="premium-row-desc">Rimani aggiornato sui nuovi messaggi e attività.</div>
                </div>
              </div>
              <button className="btn btn-primary btn-sm rounded-xl px-5 font-bold transition-all active:scale-95" onClick={handleEnableNotifications}>
                Abilita
              </button>
            </div>
          </div>
        </div>

        {/* Gestione Dati */}
        <div>
          <h2 className="premium-section-title">Dati e Gestione</h2>
          <div className="premium-card-container">
            <div className="premium-card-row">
              <div className="premium-row-left">
                <div className="premium-row-icon bg-error/10 text-error">⚙️</div>
                <div className="premium-row-info">
                  <div className="premium-row-title">Ripristino Totale</div>
                  <div className="premium-row-desc">Svuota memoria locale, chiavi e sessioni.</div>
                </div>
              </div>
              <button className="btn btn-error btn-outline btn-sm px-5 rounded-xl font-bold transition-all active:scale-95" onClick={handleReset}>
                Ripristina
              </button>
            </div>
          </div>
        </div>

        {/* Relay */}
        <div>
          <h2 className="premium-section-title">Relay</h2>
          <div className="premium-card-container">
            {relays.length === 0 ? (
              <div className="premium-card-row">
                <div className="premium-row-desc">Nessun relay configurato.</div>
              </div>
            ) : (
              relays.map((relay) => (
                <div className="premium-card-row" key={relay.url}>
                  <div className="premium-row-left">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${RELAY_STATE_DOT[relay.state]}`}
                    />
                    <div className="premium-row-info">
                      <div className="premium-row-title break-all">{relay.url}</div>
                      <div className="premium-row-desc">{RELAY_STATE_LABEL[relay.state]}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Aspetto */}
        <div>
          <h2 className="premium-section-title">Aspetto</h2>
          <div className="premium-card-container">
            <div className="premium-card-row flex-col items-stretch gap-4 p-5">
              <div className="flex items-center gap-4">
                <div className="premium-row-icon bg-info/10 text-info">🎨</div>
                <div className="premium-row-info">
                  <div className="premium-row-title">Tema dell'applicazione</div>
                  <div className="premium-row-desc">Personalizza lo stile visivo di Linda.</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 p-1 bg-base-300 rounded-2xl border border-base-content/5 mt-2">
                <button 
                  className={`btn btn-sm rounded-xl transition-all font-bold ${currentTheme === "linda" ? "btn-primary shadow-lg" : "btn-ghost opacity-60"}`}
                  onClick={() => setTheme("linda")}
                >
                  Scuro
                </button>
                <button 
                  className={`btn btn-sm rounded-xl transition-all font-bold ${currentTheme === "linda-gray" ? "btn-primary shadow-lg" : "btn-ghost opacity-60"}`}
                  onClick={() => setTheme("linda-gray")}
                >
                  Grigio
                </button>
                <button 
                  className={`btn btn-sm rounded-xl transition-all font-bold ${currentTheme === "linda-light" ? "btn-primary shadow-lg" : "btn-ghost opacity-60"}`}
                  onClick={() => setTheme("linda-light")}
                >
                  Chiaro
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-8">
        <button className="btn btn-ghost text-error/60 hover:text-error transition-all font-bold text-sm" onClick={() => logout()}>
          Disconnetti sessione
        </button>
      </div>
    </div>
  );
};

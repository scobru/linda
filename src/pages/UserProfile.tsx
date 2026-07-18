import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DataBase } from "../zen/db";
import { truncatePub } from "../utils/names";
import { UserAvatar } from "../components/UserAvatar";
import { QRCodeSVG } from "qrcode.react";

interface UserProfileProps {
  db: DataBase;
  username: string;
  currentNick: string;
  currentUniqueUsername: string;
  handleLogout: () => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  db,
  username,
  currentNick,
  currentUniqueUsername,
  handleLogout,
  showNotification,
}) => {
  const navigate = useNavigate();
  const [nick, setNick] = useState(currentNick);
  const [uniqueName, setUniqueName] = useState(currentUniqueUsername);

  useEffect(() => {
    if (currentNick && (!nick || nick.length > 40)) {
      setNick(currentNick);
    }
  }, [currentNick]);

  useEffect(() => {
    if (currentUniqueUsername && !uniqueName) {
      setUniqueName(currentUniqueUsername);
    }
  }, [currentUniqueUsername]);
  const [showPrivateKeys, setShowPrivateKeys] = useState(false);
  const [showSyncMobile, setShowSyncMobile] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const [keys, setKeys] = useState("");

  useEffect(() => {
    const pair = ((db.user as any) as any)?._?.sea;
    if (pair) {
      setKeys(JSON.stringify(pair, null, 2));
    }
  }, [db]);

  // Stable Magic Link for the QR
  const magicLinkValue = useMemo(() => {
    const pair = ((db.user as any) as any)?._?.sea || {};
    const sessionData = {
      type: "shogun-auth-pair",
      version: "1.0",
      pair,
      username,
      exportedAt: Date.now(),
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sessionData))));
    return `${window.location.origin}/?magic_login=${encodeURIComponent(encoded)}`;
  }, [db, username]);

  const contactCount = useMemo(() => {
    try {
      const cachedRaw = localStorage.getItem("linda_contact_profiles_v2");
      return cachedRaw ? Object.keys(JSON.parse(cachedRaw)).length : 0;
    } catch {
      return 0;
    }
  }, []);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 100;
        const MAX_HEIGHT = 100;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        
        const pub = db.getUserPub();
        if (pub) {
          localStorage.setItem(`linda_avatar_${pub}`, dataUrl);
        }

        Promise.all([
          db.userPut("profile/avatar", dataUrl),
          pub ? db.Put(`linda_public_profiles/${pub}/avatar`, dataUrl) : Promise.resolve()
        ])
          .then(() => showNotification("Avatar aggiornato!", "info"))
          .catch((err) => {
            console.error("Failed to save avatar:", err);
            showNotification("Impossibile salvare l'avatar", "error");
          });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCopyKeys = () => {
    if (!keys) return;
    navigator.clipboard.writeText(keys).then(() => {
      setCopyStatus("Copiato!");
      setTimeout(() => setCopyStatus(""), 2000);
    });
  };

  const handleSaveNick = async () => {
    if (!nick || nick === currentNick) return;
    const pub = db.getUserPub();
    if (!pub) return;
    try {
      await db.Put(`linda_global_nicknames/${nick}`, pub);
      await db.Put(`linda_aliases/${pub}`, { alias: nick });
      await db.Put(`linda_pub_to_nickname/${pub}`, nick);
      await db.userPut("profile/nickname", nick);
      await db.userPut("alias", nick);
      
      const cachedRaw = localStorage.getItem("linda_contact_profiles_v2");
      const cached = cachedRaw ? JSON.parse(cachedRaw) : {};
      cached[pub] = { ...cached[pub], nickname: nick };
      localStorage.setItem("linda_contact_profiles_v2", JSON.stringify(cached));

      showNotification("Nome aggiornato!", "info");
    } catch (e) {
      showNotification("Impossibile salvare il nome", "error");
    }
  };

  const handleSaveUniqueUsername = async () => {
    if (!uniqueName || uniqueName === currentUniqueUsername) return;
    const pub = db.getUserPub();
    if (!pub) return;
    let normalized = uniqueName.trim();
    if (!normalized.startsWith("@")) normalized = `@${normalized}`;
    if (!/^@[a-zA-Z0-9]+$/.test(normalized)) {
      showNotification("Lo username deve essere del tipo @nome123", "error");
      return;
    }
    try {
      await db.Put(`linda_unique_usernames/${normalized}`, pub);
      await db.Put(`linda_pub_to_handle/${pub}`, normalized);
      await db.userPut("profile/uniqueUsername", normalized);
      localStorage.setItem("linda_user_unique_username", normalized);
      showNotification("Username unico aggiornato!", "info");
    } catch (e) {
      showNotification("Impossibile salvare lo username", "error");
    }
  };

  return (
    <div className="p-6 sm:p-12 lg:p-16 max-w-2xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto pb-24 scrollbar-hide">
      {/* Intestazione */}
      <div className="flex items-center justify-between relative z-10">
        <h1 className="text-4xl font-black tracking-tight text-base-content">Panoramica</h1>
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center"
          onClick={() => navigate("/settings")}
          aria-label="Impostazioni"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-6 h-6 opacity-70">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Profilo Section */}
      <div>
        <div className="flex justify-between items-center mb-3 px-1">
          <span className="text-xl font-black text-base-content">Profilo</span>
          <button 
            className="text-primary hover:text-primary-focus transition-all font-bold text-sm"
            onClick={() => {
              const pub = ((db.user as any) as any)?._?.sea?.pub;
              if (!pub) return;
              navigator.clipboard.writeText(`${window.location.origin}/?add=${pub}`);
              showNotification("Link di contatto copiato!", "info");
            }}
          >
            Condividi
          </button>
        </div>
        
        <div className="premium-card-container">
          <div className="premium-card-row p-6">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <UserAvatar 
                  pub={db.getUserPub() || ""} 
                  db={db} 
                  className="w-16 h-16 rounded-full border-2 border-primary/20 ring-2 ring-primary/10 bg-base-300 overflow-hidden" 
                />
                <label className="btn btn-primary btn-circle btn-xs absolute -bottom-1 -right-1 border-2 border-base-200 hover:scale-110 active:scale-90 transition-all cursor-pointer p-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
                </label>
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight text-base-content">{truncatePub(currentNick || username)}</div>
                <div className="text-sm text-primary font-bold mt-1 tracking-wide">{currentUniqueUsername || "@non_impostato"}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="text-xs text-base-content/40 font-bold px-2 mt-2">
          {contactCount} contatti • Linda P2P • Rete Sicura
        </div>
      </div>

      {/* Modifica Section */}
      <div>
        <h2 className="premium-section-title">Modifica</h2>
        <div className="premium-card-container">
          <div className="premium-card-row flex-col items-stretch gap-3 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Nome Visualizzato</h3>
            <div className="flex gap-2 w-full">
              <input
                className="input input-bordered grow focus:ring-1 focus:ring-primary h-12 bg-base-content/5 border-base-content/5 rounded-xl px-5 font-bold"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="Es. Francesco"
              />
              <button onClick={handleSaveNick} className="btn btn-primary h-12 w-12 rounded-xl p-0 transition-transform active:scale-90 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          <div className="premium-card-row flex-col items-stretch gap-3 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Username Unico</h3>
            <div className="flex gap-2 w-full">
              <input
                className="input input-bordered grow focus:ring-1 focus:ring-primary h-12 bg-base-content/5 border-base-content/5 rounded-xl px-5 font-bold"
                value={uniqueName}
                onChange={(e) => setUniqueName(e.target.value)}
                placeholder="@username"
              />
              <button onClick={handleSaveUniqueUsername} className="btn btn-primary h-12 w-12 rounded-xl p-0 transition-transform active:scale-90 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backup & Sicurezza */}
      <div>
        <h2 className="premium-section-title">Backup & Sicurezza</h2>
        <div className="premium-card-container">
          {/* Sync Mobile */}
          <div 
            className="premium-card-row premium-card-row-interactive"
            onClick={() => setShowSyncMobile(!showSyncMobile)}
          >
            <div className="premium-row-left">
              <div className="premium-row-icon bg-primary/10 text-primary">⭐</div>
              <div className="premium-row-info">
                <div className="premium-row-title">Sincronizza Dispositivo</div>
                <div className="premium-row-desc">Esporta la sessione su mobile o altro client.</div>
              </div>
            </div>
            <span className="chevron-arrow">{showSyncMobile ? "▼" : "▶"}</span>
          </div>

          {showSyncMobile && (
            <div className="p-5 bg-base-300/40 border-t border-base-content/5 space-y-5 animate-fadeIn">
              <p className="text-xs opacity-60 font-bold leading-relaxed">
                Scansiona questo Magic Link dalla fotocamera del telefono per trasferire sessione e chiavi.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 p-4 bg-base-200/80 rounded-2xl border border-base-content/5">
                <div className="shrink-0 bg-white p-2.5 rounded-xl shadow-md border border-primary/10 flex justify-center">
                   <QRCodeSVG 
                    value={`${window.location.origin}/?add=${((db.user as any) as any)?._?.sea?.pub || ""}`} 
                    size={90} 
                    level="H"
                    fgColor="#1b1b1f"
                    bgColor="#ffffff"
                  />
                </div>
                <div className="flex-1 space-y-2">
                   <h4 className="text-xs font-bold uppercase tracking-wider text-primary">QR Contatto Pubblico</h4>
                   <p className="text-[10px] font-bold opacity-40 uppercase leading-normal">Condividi questo QR per farti aggiungere dagli amici.</p>
                   <button 
                    className="btn btn-primary btn-xs rounded-lg px-4 font-bold"
                    onClick={() => {
                      const pub = ((db.user as any) as any)?._?.sea?.pub;
                      if (!pub) return;
                      navigator.clipboard.writeText(`${window.location.origin}/?add=${pub}`);
                      showNotification("Link copiato!", "info");
                    }}
                  >
                    Copia Link
                  </button>
                </div>
              </div>

              <div className="p-3 bg-error/10 rounded-xl border border-error/20 flex gap-3 items-start">
                <span className="text-md">⚠️</span>
                <div className="text-[10px] font-bold text-error uppercase tracking-wider leading-relaxed">
                  <span className="font-black">Attenzione:</span> Il QR principale di sincronizzazione contiene le tue chiavi private. Non mostrarlo in pubblico.
                </div>
              </div>

              <div className="flex flex-col lg:flex-row items-center gap-6 pt-2">
                <div className="shrink-0 bg-white p-4 rounded-2xl shadow-xl border-4 border-primary/10 flex justify-center">
                  <QRCodeSVG
                    value={magicLinkValue}
                    size={140}
                    level="H"
                    fgColor="#1b1b1f"
                    bgColor="#ffffff"
                  />
                </div>
                <div className="flex-1 w-full space-y-3">
                  <button 
                    className="btn btn-primary rounded-xl w-full h-11 font-bold shadow-md shadow-primary/10 transition-transform active:scale-95 text-xs"
                    onClick={() => {
                      const pair = ((db.user as any) as any)?._?.sea;
                      if (!pair) return;
                      const sessionData = { 
                        type: "shogun-auth-pair",
                        version: "1.0",
                        pair: pair,
                        username: username,
                        exportedAt: Date.now()
                      };
                      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sessionData))));
                      const link = `${window.location.origin}/?magic_login=${encodeURIComponent(encoded)}`;
                      navigator.clipboard.writeText(link);
                      showNotification("Magic Link copiato!", "info");
                    }}
                  >
                    Copia Magic Link di Sincronizzazione
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Private Keys */}
          <div 
            className="premium-card-row premium-card-row-interactive"
            onClick={() => setShowPrivateKeys(!showPrivateKeys)}
          >
            <div className="premium-row-left">
              <div className="premium-row-icon bg-info/10 text-info">🔑</div>
              <div className="premium-row-info">
                <div className="premium-row-title">Chiavi Private SEA</div>
                <div className="premium-row-desc">Esporta il backup delle chiavi JSON crittografiche.</div>
              </div>
            </div>
            <span className="chevron-arrow">{showPrivateKeys ? "▼" : "▶"}</span>
          </div>

          {showPrivateKeys && (
            <div className="p-5 bg-base-300/40 border-t border-base-content/5 space-y-4 animate-fadeIn">
              <div className="flex justify-end">
                <button className="btn btn-ghost bg-base-content/5 opacity-60 hover:opacity-100 btn-xs rounded-lg px-4 font-bold transition-all" onClick={handleCopyKeys}>
                  {copyStatus || "Copia JSON"}
                </button>
              </div>
              <div className="mockup-code bg-base-300 shadow-inner text-xs border border-base-content/5 max-h-40 overflow-y-auto rounded-xl">
                <pre className="px-5 py-3"><code>{keys}</code></pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disconnessione */}
      <div className="premium-card-container border-error/20 bg-error/5 hover:bg-error/10 transition-all">
        <div className="premium-card-row p-5 flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h3 className="text-sm font-bold text-error mb-0.5">Uscita di Emergenza</h3>
            <p className="text-xs text-error/60 font-bold">Disconnetti la sessione ed elimina le chiavi locali.</p>
          </div>
          <button 
            className="btn btn-error btn-outline btn-sm rounded-xl px-8 font-bold transition-all active:scale-95" 
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

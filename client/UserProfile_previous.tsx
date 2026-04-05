import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DataBase } from "shogun-core";
import { getDiceBearAvatar } from "../utils/avatar";
import { QRCodeSVG } from "qrcode.react";

interface UserProfileProps {
  db: DataBase;
  username: string;
  currentNick: string;
  currentUniqueUsername: string;
  currentAvatar: string | null;
  handleLogout: () => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  db,
  username,
  currentNick,
  currentUniqueUsername,
  currentAvatar,
  handleLogout,
  showNotification,
}) => {
  const navigate = useNavigate();
  const [nick, setNick] = useState(currentNick);
  const [uniqueName, setUniqueName] = useState(currentUniqueUsername);
  const [keys, setKeys] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const pair = (db.getCurrentUser()?.user as any)?._?.sea;
    if (pair) {
      setKeys(JSON.stringify(pair, null, 2));
    }
  }, [db]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        db.userPut("profile/avatar", dataUrl)
          .then(() => showNotification("Avatar updated!", "info"))
          .catch(() => showNotification("Failed to save avatar", "error"));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCopyKeys = () => {
    if (!keys) return;
    navigator.clipboard.writeText(keys).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(""), 2000);
    });
  };

  const handleSaveNick = async () => {
    if (!nick || nick === currentNick) return;
    const pub = db.getUserPub();
    if (!pub) return;
    try {
      // Nickname doesn't need to be unique, we just store the association
      // so others can see it when they look up this user.
      await db.Put(`signal_global_nicknames/${nick}`, pub);
      await db.userPut("profile/nickname", nick);
      showNotification("Nickname updated", "info");
    } catch (e) {
      showNotification("Failed to save nickname", "error");
    }
  };

  const handleSaveUniqueUsername = async () => {
    if (!uniqueName || uniqueName === currentUniqueUsername) return;
    const pub = db.getUserPub();
    if (!pub) return;
    let normalized = uniqueName.trim();
    if (!normalized.startsWith("@")) normalized = `@${normalized}`;
    if (!/^@[a-zA-Z0-9]+$/.test(normalized)) {
      showNotification("Username must be @name1234 format", "error");
      return;
    }
    try {
      let takenPub: any = undefined;
      try {
        takenPub = await db.Get(`signal_unique_usernames/${normalized}`);
      } catch (e) {}
      if (takenPub && takenPub !== pub) {
        showNotification("Unique username already taken", "error");
      } else {
        await db.Put(`signal_unique_usernames/${normalized}`, pub);
        await db.userPut("profile/uniqueUsername", normalized);
        showNotification("Unique username updated", "info");
      }
    } catch (e) {
      showNotification("Failed to save unique username", "error");
    }
  };

  return (
    <div className="p-6 sm:p-12 lg:p-16 max-w-5xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto">
      <div className="flex items-center gap-6 relative z-10">
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate("/")}
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-3xl font-black tracking-tight">Public Profile</h1>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-14 bg-base-200 p-10 rounded-2xl border border-base-content/5 shadow-sm relative overflow-hidden group">
        <div className="relative z-10 shrink-0">
          <div className="avatar">
            <div className="w-32 sm:w-40 rounded-full border-4 border-base-content/10 ring-2 ring-primary/20 bg-base-300">
              {currentAvatar ? (
                <img src={currentAvatar} alt="Avatar" className="object-cover" />
              ) : (
                <img 
                  src={getDiceBearAvatar(username || currentNick)} 
                  alt="Avatar" 
                  className="object-cover bg-base-300" 
                />
              )}
            </div>
          </div>
          <label className="btn btn-primary btn-circle absolute bottom-2 right-2 border-4 border-base-200 hover:scale-110 active:scale-90 transition-all cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
          </label>
        </div>

        <div className="text-center sm:text-left z-10 flex-1 min-w-0">
          <h2 className="text-2xl font-black mb-2 truncate tracking-tight">{currentNick || username}</h2>
          <div className="badge badge-primary font-black tracking-widest text-[10px] h-7 px-4 rounded-full border-none">{currentUniqueUsername || "ID NOT SET"}</div>
        </div>

        <div className="shrink-0 bg-white p-4 rounded-[2rem] shadow-2xl border-4 border-primary/20 animate-fadeIn hover:scale-105 transition-transform duration-500">
           <QRCodeSVG 
            value={db.getUserPub() || ""} 
            size={120} 
            level="H"
            includeMargin={false}
            fgColor="#1b1b1f"
            bgColor="#ffffff"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
          <div className="card-body p-8 gap-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Display Name</h3>
            <div className="flex gap-2 w-full">
              <input
                className="input input-bordered grow focus:ring-1 focus:ring-primary h-12 bg-base-content/5 border-base-content/5 rounded-2xl px-5 font-bold"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="Ex. Linda"
              />
              <button onClick={handleSaveNick} className="btn btn-primary h-12 w-12 rounded-2xl p-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
          <div className="card-body p-8 gap-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Unique Handle</h3>
            <div className="flex gap-2 w-full">
              <input
                className="input input-bordered grow focus:ring-1 focus:ring-primary h-12 bg-base-content/5 border-base-content/5 rounded-2xl px-5 font-bold"
                value={uniqueName}
                onChange={(e) => setUniqueName(e.target.value)}
                placeholder="@username"
              />
              <button onClick={handleSaveUniqueUsername} className="btn btn-primary h-12 w-12 rounded-2xl p-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
        <div className="card-body p-8 gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-1">Security & Keys</h3>
              <p className="text-xs opacity-40 font-bold">Management of your private encryption keys.</p>
            </div>
            <div className="flex gap-2">
              <button 
                className={`btn btn-sm rounded-xl px-6 font-black text-xs ${showKeys ? "btn-neutral" : "btn-ghost bg-base-content/5 opacity-60 hover:opacity-100"}`}
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? "Hide Keys" : "Reveal Keys"}
              </button>
              <button className="btn btn-ghost bg-base-content/5 opacity-60 hover:opacity-100 btn-sm rounded-xl px-6 font-black text-xs" onClick={handleCopyKeys}>
                {copyStatus || "Export JSON"}
              </button>
            </div>
          </div>
          
          {showKeys && (
            <div className="relative animate-fadeIn pt-4">
              <div className="mockup-code bg-base-300 shadow-inner text-xs border border-base-content/5 max-h-60 overflow-y-auto rounded-2xl">
                <pre className="px-6 py-4"><code>{keys}</code></pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Magic Link Login Sync */}
      <div className="card bg-primary/5 border border-primary/20 overflow-hidden rounded-[2rem] shadow-xl">
        <div className="card-body p-8 sm:p-10 flex flex-col lg:flex-row items-center gap-10">
            </div>

            <div className="flex flex-col sm:flex-row gap-4 p-6 bg-base-200/50 rounded-3xl border border-base-content/5">
              <div className="shrink-0 bg-white p-4 rounded-2xl shadow-xl border-4 border-primary/20">
                <QRCodeSVG 
                  value={`${window.location.origin}/?add=${(db.getCurrentUser()?.user as any)?._?.sea?.pub || ""}`} 
                  size={140} 
                  level="H"
                  fgColor="#1b1b1f"
                  bgColor="#ffffff"
                />
              </div>
              <div className="flex-1 space-y-3">
                <h4 className="text-sm font-black uppercase tracking-widest text-primary">Your Contact QR</h4>
                <p className="text-[10px] font-bold opacity-50 leading-relaxed uppercase">
                  Show this to a friend to let them add you instantly. Works with any phone camera!
                </p>
                <button 
                  className="btn btn-primary btn-xs rounded-lg px-4 font-black"
                  onClick={() => {
                    const pub = (db.getCurrentUser()?.user as any)?._?.sea?.pub;
                    if (!pub) return;
                    navigator.clipboard.writeText(`${window.location.origin}/?add=${pub}`);
                    showNotification("Contact link copied!", "info");
                  }}
                >
                  Copy Contact Link
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-error/10 rounded-2xl border border-error/20 flex gap-4 items-start text-left">
              <span className="text-xl">ÔÜá´©Å</span>
              <div className="text-[10px] font-bold text-error uppercase tracking-wider leading-relaxed">
                <span className="font-black">Security Warning:</span> This QR contains your private keys. Never share it, show it on a public screen, or send it to anyone.
              </div>
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3">
               <button 
                className="btn btn-primary rounded-xl px-8 font-black shadow-lg shadow-primary/20"
                onClick={() => {
                  const pair = (db.getCurrentUser()?.user as any)?._?.sea;
                  if (!pair) return;
                  const sessionData = { ...pair, username };
                  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sessionData))));
                  const link = `${window.location.origin}/?session=${encoded}`;
                  navigator.clipboard.writeText(link);
                  showNotification("Magic Link copied!", "info");
                }}
              >
                Copy Magic Link
              </button>
            </div>
          </div>

          <div className="shrink-0 bg-white p-6 rounded-[2.5rem] shadow-2xl border-8 border-primary/10 hover:scale-105 transition-transform duration-500 group relative">
             <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem] pointer-events-none"></div>
             <QRCodeSVG 
              value={`${window.location.origin}/?session=${btoa(unescape(encodeURIComponent(JSON.stringify({ ...((db.getCurrentUser()?.user as any)?._?.sea || {}), username }))))}`} 
              size={220} 
              level="H"
              includeMargin={false}
              fgColor="#1b1b1f"
              bgColor="#ffffff"
            />
          </div>
        </div>
      </div>

      <div className="card bg-error/5 border border-error/20 hover:bg-error/10 transition-all overflow-hidden rounded-2xl">
        <div className="card-body p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-error mb-1">Emergency Sign Out</h3>
            <p className="text-xs opacity-40 font-bold">Instantly sign out and destroy session data.</p>
          </div>
          <button 
            className="btn btn-error btn-outline btn-sm rounded-xl px-10 font-black transition-all active:scale-95" 
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

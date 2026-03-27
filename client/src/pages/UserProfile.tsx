import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DataBase } from "shogun-core";

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
      let takenPub: any = undefined;
      try {
        takenPub = await db.Get(`signal_global_nicknames/${nick}`);
      } catch (e) {}
      if (takenPub && takenPub !== pub) {
        showNotification("Nickname already taken", "error");
      } else {
        await db.Put(`signal_global_nicknames/${nick}`, pub);
        await db.userPut("profile/nickname", nick);
        showNotification("Nickname updated", "info");
      }
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
    <div className="p-6 sm:p-12 lg:p-16 max-w-5xl mx-auto space-y-10 sm:space-y-16 animate-fadeIn overflow-y-auto h-full">
      <div className="flex items-center gap-6 sm:gap-8 relative z-10">
        <button 
          className="btn btn-ghost btn-circle shadow-2xl bg-base-200/90 backdrop-blur-xl border border-white/10 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate("/")}
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-4xl sm:text-5xl font-black text-primary tracking-tighter">Public Profile</h1>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-14 bg-base-200/60 backdrop-blur-3xl p-10 sm:p-14 rounded-[3.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        
        <div className="relative z-10 shrink-0">
          <div className="avatar">
            <div className="w-32 sm:w-44 rounded-full ring-8 ring-primary/10 ring-offset-base-100 ring-offset-8 shadow-2full shadow-primary/20">
              {currentAvatar ? (
                <img src={currentAvatar} alt="Avatar" className="object-cover" />
              ) : (
                <div className="bg-primary text-primary-content flex items-center justify-center text-5xl sm:text-6xl font-black h-full w-full">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <label className="btn btn-primary btn-circle absolute bottom-2 right-2 shadow-2xl border-4 border-base-200 hover:scale-110 active:scale-90 transition-all cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
          </label>
        </div>

        <div className="text-center sm:text-left z-10 flex-1 min-w-0">
          <h2 className="text-3xl sm:text-4xl font-black mb-3 truncate tracking-tight">{currentNick || username}</h2>
          <div className="badge badge-primary badge-outline font-black tracking-[0.3em] text-[10px] h-8 px-6 bg-primary/5 rounded-full border-2">{currentUniqueUsername || "ID NOT SET"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10">
        <div className="card bg-base-200/60 backdrop-blur-2xl shadow-2xl border border-white/10 overflow-hidden hover:border-primary/30 transition-all rounded-[3rem]">
          <div className="card-body p-8 sm:p-10 gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 text-primary">Display Name</h3>
            <div className="flex gap-2 w-full">
              <input
                className="input input-bordered grow focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all h-14 bg-base-300/30 border-white/5 rounded-2xl px-6 font-bold"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="Ex. Linda"
              />
              <button onClick={handleSaveNick} className="btn btn-primary h-14 w-14 rounded-2xl shadow-lg shadow-primary/20 p-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <p className="text-[11px] opacity-40 font-medium leading-relaxed px-1">Your public name visible to other users in groups and encrypted chats.</p>
          </div>
        </div>

        <div className="card bg-base-200/60 backdrop-blur-2xl shadow-2xl border border-white/10 overflow-hidden hover:border-primary/30 transition-all rounded-[3rem]">
          <div className="card-body p-8 sm:p-10 gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 text-primary">Unique Handle</h3>
            <div className="flex gap-2 w-full">
              <input
                className="input input-bordered grow focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all h-14 bg-base-300/30 border-white/5 rounded-2xl px-6 font-bold"
                value={uniqueName}
                onChange={(e) => setUniqueName(e.target.value)}
                placeholder="@username"
              />
              <button onClick={handleSaveUniqueUsername} className="btn btn-primary h-14 w-14 rounded-2xl shadow-lg shadow-primary/20 p-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <p className="text-[11px] opacity-40 font-medium leading-relaxed px-1">A unique handle that others can use to find and message you directly.</p>
          </div>
        </div>
      </div>

      <div className="card bg-base-200/60 backdrop-blur-2xl shadow-2xl border border-white/10 overflow-hidden rounded-[3rem]">
        <div className="card-body p-8 sm:p-12 gap-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8">
            <div className="flex-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2 text-primary">Security & Keys</h3>
              <p className="text-sm opacity-70 font-medium">Management of your private end-to-end encryption keys.</p>
            </div>
            <div className="flex gap-3">
              <button 
                className={`btn btn-md rounded-full px-8 font-black text-xs ${showKeys ? "btn-neutral" : "btn-outline border-white/10"}`}
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? "Hide Details" : "Reveal Keys"}
              </button>
              <button className="btn btn-outline border-white/10 btn-md rounded-full px-8 font-black text-xs" onClick={handleCopyKeys}>
                {copyStatus || "Export JSON"}
              </button>
            </div>
          </div>
          
          {showKeys && (
            <div className="relative animate-fadeIn pt-4">
              <div className="mockup-code bg-base-300/80 backdrop-blur-md shadow-inner text-xs border border-white/5 max-h-60 overflow-y-auto before:bg-primary/20 rounded-3xl">
                <pre className="px-6 py-4"><code>{keys}</code></pre>
              </div>
              <div className="absolute top-8 right-8 badge badge-warning font-black shadow-2xl animate-pulse rounded-full text-[10px] tracking-widest border-2">SECRET KEYS</div>
            </div>
          )}
        </div>
      </div>

      <div className="card bg-error/5 border border-error/20 shadow-2xl group hover:bg-error/10 transition-all overflow-hidden rounded-[3rem]">
        <div className="card-body p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="text-center sm:text-left">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-error mb-2">Emergency Sign Out</h3>
            <p className="text-sm opacity-60 font-medium">Instantly sign out and destroy session data in this browser.</p>
          </div>
          <button 
            className="btn btn-error btn-outline rounded-full px-12 font-black transition-all border-2 active:scale-95" 
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

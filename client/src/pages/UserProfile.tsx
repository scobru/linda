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
    <div className="p-4 lg:p-12 max-w-5xl mx-auto space-y-12 animate-fadeIn overflow-y-auto h-full">
      <div className="flex items-center gap-6">
        <button className="btn btn-ghost btn-circle shadow-lg bg-base-200 border-white/5" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1 className="text-4xl font-black text-primary tracking-tight">User Profile</h1>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-10 bg-base-200 p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        <div className="relative z-10">
          <div className="avatar">
            <div className="w-32 rounded-full ring ring-primary ring-offset-base-100 ring-offset-4 shadow-2xl shadow-primary/20">
              {currentAvatar ? (
                <img src={currentAvatar} alt="Avatar" />
              ) : (
                <div className="bg-primary text-primary-content flex items-center justify-center text-4xl font-black h-full w-full">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <label className="btn btn-primary btn-circle btn-sm absolute bottom-0 right-0 shadow-lg border-2 border-base-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
          </label>
        </div>

        <div className="text-center md:text-left z-10 flex-1">
          <h2 className="text-3xl font-bold mb-2">{currentNick || username}</h2>
          <div className="badge badge-primary badge-outline font-bold tracking-widest text-xs h-6">{currentUniqueUsername || "NO USERNAME"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="card bg-base-200 shadow-xl border border-white/5 overflow-visible">
          <div className="card-body gap-4">
            <h3 className="card-title text-sm font-black uppercase tracking-widest opacity-50">Display Name</h3>
            <div className="join w-full shadow-lg">
              <input
                className="input input-bordered join-item grow focus:border-primary transition-colors h-12"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="Nickname"
              />
              <button onClick={handleSaveNick} className="btn btn-primary join-item h-12 px-6">
                Update
              </button>
            </div>
            <p className="text-[10px] opacity-40">Your public name visible to other users in groups and 1:1 chats.</p>
          </div>
        </div>

        <div className="card bg-base-200 shadow-xl border border-white/5 overflow-visible">
          <div className="card-body gap-4">
            <h3 className="card-title text-sm font-black uppercase tracking-widest opacity-50">Unique Username</h3>
            <div className="join w-full shadow-lg">
              <input
                className="input input-bordered join-item grow focus:border-primary transition-colors h-12"
                value={uniqueName}
                onChange={(e) => setUniqueName(e.target.value)}
                placeholder="@username1234"
              />
              <button onClick={handleSaveUniqueUsername} className="btn btn-primary join-item h-12 px-6">
                Update
              </button>
            </div>
            <p className="text-[10px] opacity-40">A unique handle that others can use to find and message you.</p>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 shadow-xl border border-white/5">
        <div className="card-body gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title text-sm font-black uppercase tracking-widest opacity-50 mb-1 text-primary">Security & Backup</h3>
              <p className="text-xs opacity-60">Management of your private encryption keys.</p>
            </div>
            <div className="flex gap-2">
              <button 
                className={`btn btn-sm ${showKeys ? "btn-neutral" : "btn-outline"} px-4`}
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? "Hide Keys" : "Show Keys"}
              </button>
              <button className="btn btn-outline btn-sm px-4" onClick={handleCopyKeys}>
                {copyStatus || "Copy JSON"}
              </button>
            </div>
          </div>
          
          {showKeys && (
            <div className="relative animate-fadeIn">
              <div className="mockup-code bg-base-300 text-xs border border-white/5 max-h-60 overflow-y-auto before:bg-primary/20">
                <pre><code>{keys}</code></pre>
              </div>
              <div className="absolute top-4 right-4 badge badge-warning badge-sm font-bold shadow-lg">SENSITIVE DATA</div>
            </div>
          )}
        </div>
      </div>

      <div className="card bg-error/10 border border-error/20 shadow-xl">
        <div className="card-body flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-error opacity-80 decoration-error/30 mb-1">Account Destruction</h3>
            <p className="text-xs opacity-60">Sign out and remove session data from this browser.</p>
          </div>
          <button 
            className="btn btn-error btn-outline btn-sm px-8" 
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

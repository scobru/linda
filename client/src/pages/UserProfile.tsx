import React, { useState } from "react";
import { DataBase } from "shogun-core";
import { useShogun } from "shogun-button-react";
import { getDiceBearAvatar } from "../utils/avatar";
import { QRCodeSVG } from "qrcode.react";

interface UserProfileProps {
  db: DataBase;
  username: string;
  currentNick: string;
  currentUniqueUsername?: string | null;
  currentAvatar?: string | null;
  handleLogout: () => Promise<void>;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ 
  db, 
  username, 
  currentNick, 
  currentAvatar,
  handleLogout, 
  showNotification 
}) => {
  const { userPub } = useShogun();
  const [showKeys, setShowKeys] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(currentAvatar || localStorage.getItem("linda_user_avatar"));
  const [userNickname, setUserNickname] = useState<string>(currentNick || localStorage.getItem("linda_user_nick") || "");

  const keys = JSON.stringify((db.getCurrentUser()?.user as any)?._?.sea || {}, null, 2);

  const handleExport = () => {
    navigator.clipboard.writeText(keys);
    setCopyStatus("Copied!");
    showNotification("Credentials copied to clipboard", "info");
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const updateAvatar = async (url: string) => {
    try {
      await db.Put("profile/avatar", url);
      setUserAvatar(url);
      showNotification("Avatar updated", "info");
    } catch (err) {
      showNotification("Failed to update avatar", "error");
    }
  };

  const updateNickname = async (name: string) => {
    try {
      await db.Put("profile/nickname", name);
      setUserNickname(name);
      showNotification("Nickname updated", "info");
    } catch (err) {
      showNotification("Failed to update nickname", "error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8 animate-fadeIn pb-24">
      <header className="flex flex-col sm:flex-row items-center gap-8 mb-12">
        <div className="relative group">
          <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 border-primary/20 shadow-2xl relative">
            {userAvatar ? (
              <img src={userAvatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                <img src={getDiceBearAvatar(userNickname || username)} alt="avatar" className="w-24 h-24" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
               <label className="cursor-pointer text-white text-[10px] font-black uppercase tracking-widest text-center px-4">
                  Cambia
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => updateAvatar(reader.result as string);
                      reader.readAsDataURL(file);
                    }}
                  />
               </label>
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-primary text-white p-2 rounded-2xl shadow-lg">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
               <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
               <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
             </svg>
          </div>
        </div>
        
        <div className="flex-1 text-center sm:text-left space-y-4">
          <div className="space-y-1">
            <input 
              type="text" 
              value={userNickname} 
              onChange={(e) => updateNickname(e.target.value)}
              placeholder="Inserisci Nickname"
              className="text-4xl font-black bg-transparent border-none focus:ring-0 p-0 placeholder:opacity-20 text-base-content"
            />
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="text-xs font-black uppercase tracking-widest opacity-40">@{username}</span>
              <div className="badge badge-primary badge-sm font-black rounded-lg">PRO</div>
            </div>
          </div>
          
          <div className="p-4 bg-primary/5 rounded-3xl border border-primary/10 inline-flex items-center gap-4">
             <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Public Key</span>
                <span className="text-xs font-bold font-mono opacity-80">{userPub?.substring(0, 16)}...</span>
             </div>
             <button 
                className="btn btn-ghost btn-circle btn-sm hover:bg-primary/20"
                onClick={() => {
                  navigator.clipboard.writeText(userPub || "");
                  showNotification("Pubkey copied!", "info");
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.903 12.316a48.408 48.408 0 00-1.213-1.213m-2.222 2.222a48.403 48.403 0 01-1.213-1.213m-2.222-2.222a48.408 48.408 0 00-1.213-1.213m-2.222 2.222a48.403 48.403 0 01-1.213-1.213" />
                </svg>
             </button>
          </div>
        </div>
      </header>

      <div className="card bg-base-200/50 backdrop-blur-xl border border-base-content/5 overflow-hidden rounded-[2.5rem] shadow-xl">
        <div className="card-body p-8 sm:p-12 space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-primary uppercase tracking-tight">Security & Credentials</h3>
            <div className="flex gap-2">
              <button 
                className={`btn btn-sm rounded-xl px-6 font-black transition-all ${showKeys ? "btn-primary shadow-lg shadow-primary/20" : "btn-ghost bg-base-content/5 opacity-50"}`}
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? "Hide Keys" : "Show Private Keys"}
              </button>
              <button 
                className="btn btn-sm btn-ghost bg-base-content/5 rounded-xl px-6 font-black opacity-50"
                onClick={handleExport}
              >
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

      {/* Universal Links Section */}
      <div className="card bg-primary/5 border border-primary/20 overflow-hidden rounded-[2rem] shadow-xl">
        <div className="card-body p-8 sm:p-10 space-y-10">
          {/* Add Friend QR */}
          <div className="flex flex-col lg:flex-row items-center gap-10">
            <div className="flex-1 space-y-6 text-center lg:text-left">
              <div>
                <h3 className="text-xl font-black text-primary uppercase tracking-tight mb-2">Universal Add Contact</h3>
                <p className="text-sm opacity-60 font-bold leading-relaxed">
                  Show this QR to a friend. Works directly with your **system camera app** (iOS/Android) or from within Linda.
                </p>
              </div>
              <button 
                className="btn btn-primary rounded-xl px-8 font-black shadow-lg shadow-primary/20"
                onClick={() => {
                  const pub = (db.getCurrentUser()?.user as any)?._?.sea?.pub;
                  if (!pub) return;
                  const link = `${window.location.origin}/?add=${pub}`;
                  navigator.clipboard.writeText(link);
                  showNotification("Contact link copied!", "info");
                }}
              >
                Copy Contact Link
              </button>
            </div>
            <div className="shrink-0 bg-white p-6 rounded-[2.5rem] shadow-2xl border-8 border-primary/10 hover:scale-105 transition-transform duration-500">
               <QRCodeSVG 
                value={`${window.location.origin}/?add=${(db.getCurrentUser()?.user as any)?._?.sea?.pub || ""}`} 
                size={180} 
                level="H"
                fgColor="#1b1b1f"
                bgColor="#ffffff"
              />
            </div>
          </div>

          <div className="divider opacity-10"></div>

          {/* Magic Link Login */}
          <div className="flex flex-col lg:flex-row items-center gap-10">
            <div className="flex-1 space-y-6 text-center lg:text-left">
              <div>
                <h3 className="text-xl font-black text-primary uppercase tracking-tight mb-2">Transfer Session to Mobile</h3>
                <p className="text-sm opacity-60 font-bold leading-relaxed">
                  Scan to instantly sync your account to another device. Contains your **Private Keys**.
                </p>
              </div>
              <div className="p-4 bg-error/10 rounded-2xl border border-error/20 flex gap-4 items-start text-left">
                <span className="text-xl">⚠️</span>
                <div className="text-[10px] font-bold text-error uppercase tracking-wider leading-relaxed">
                  <span className="font-black">Security Warning:</span> This QR contains your private keys. Never share it or show it on a public screen.
                </div>
              </div>
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
            <div className="shrink-0 bg-white p-6 rounded-[2.5rem] shadow-2xl border-8 border-primary/10 hover:scale-105 transition-transform duration-500 group relative">
               <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem] pointer-events-none"></div>
               <QRCodeSVG 
                value={`${window.location.origin}/?session=${btoa(unescape(encodeURIComponent(JSON.stringify({ ...((db.getCurrentUser()?.user as any)?._?.sea || {}), username }))))}`} 
                size={200} 
                level="H"
                includeMargin={false}
                fgColor="#1b1b1f"
                bgColor="#ffffff"
              />
            </div>
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

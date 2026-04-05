import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getDiceBearAvatar } from "../lib/utils";
import { SignalService } from "../SignalService";
import { GroupService } from "../GroupService";
import { QrScannerModal } from "./QrScannerModal";

interface SidebarProps {
  userPub: string | null;
  username: string;
  userNick: string;
  userAvatar: string | null;
  contacts: string[];
  recipient: string;
  setRecipient: (id: string) => void;
  contactProfiles: Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>;
  unreadCounts: Record<string, number>;
  handleDeleteContact: (id: string, e: React.MouseEvent) => void;
  signalService: SignalService | null;
  groupService: GroupService | null;
  showNotification: (msg: string, type?: "info" | "error") => void;
  saveContact: (id: string) => void;
  requestNotifications: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userPub,
  username,
  userNick,
  userAvatar,
  contacts,
  recipient,
  setRecipient,
  contactProfiles,
  unreadCounts,
  handleDeleteContact,
  signalService,
  groupService,
  showNotification,
  saveContact,
  requestNotifications,
}) => {
  const navigate = useNavigate();
  const [showScanner, setShowScanner] = useState(false);

  const handleQrScan = async (data: string) => {
    setShowScanner(false);
    if (!data) return;

    try {
      let pubKey = data.trim();
      
      // Handle Linda Universal Links (?add=)
      if (pubKey.includes("?add=")) {
        const urlSplit = pubKey.split("?add=");
        const extracted = urlSplit[1]?.split("&")[0];
        if (extracted) pubKey = extracted;
      }

      if (pubKey.length < 30 || pubKey.startsWith("@")) {
        if (!signalService) return;
        pubKey = await signalService.getPubKeyFromUsername(pubKey);
      }

      saveContact(pubKey);
      setRecipient(pubKey);
      navigate(`/chat/${pubKey}`);
      showNotification(`Contact added via QR!`, "info");
    } catch (err: any) {
      showNotification("Invalid QR Code", "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-base-100 border-r border-base-content/5 w-full transition-all overflow-hidden font-narrow">
      {/* User info Header - Signal Style */}
      <div className="px-6 flex items-center justify-between border-b border-base-content/5 bg-base-200 h-16 shrink-0">
        <div
          className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-all grow mr-4 group"
          onClick={() => navigate("/profile")}
        >
          <div className="avatar relative">
            <div className="w-10 rounded-full border border-base-content/10 ring-1 ring-white/5 bg-base-300">
              {userAvatar ? (
                <img src={userAvatar} alt="avatar" className="object-cover" />
              ) : (
                <img 
                  src={getDiceBearAvatar(username || userNick)} 
                  alt="avatar" 
                  className="object-cover bg-primary/10" 
                />
              )}
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="font-bold truncate text-sm tracking-tight">{userNick || username}</div>
            <div className="flex items-center gap-2 text-[9px] opacity-40 font-semibold uppercase tracking-[0.1em] mt-0.5">
              <span className="status status-success status-xs scale-75"></span> Online
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="btn btn-ghost btn-circle btn-sm opacity-60 hover:opacity-100 transition-opacity"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          onClick={() => navigate("/create-group")}
          className="btn btn-ghost btn-circle btn-sm opacity-60 hover:opacity-100 transition-opacity"
          title="Create Group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <ul className="menu menu-md w-full p-0 gap-2">
          {/* My Cloud / Self Transfer Section */}
          {userPub && (
            <li key="self-transfer">
              <NavLink
                to={`/chat/${userPub}`}
                className={({ isActive }) => 
                  `flex items-center p-3 px-6 gap-4 transition-all relative group ${
                    isActive ? "bg-primary/10 text-primary border-r-2 border-primary" : "hover:bg-base-content/5 active:bg-base-content/10"
                  }`
                }
                onClick={() => {
                  setRecipient(userPub);
                  requestNotifications();
                }}
              >
                {({ isActive }) => (
                  <>
                    <div className="avatar">
                      <div className="w-10 rounded-full border border-base-content/5 bg-base-300 overflow-hidden">
                        <div className={`w-full h-full flex items-center justify-center ${isActive ? "bg-white/20" : "bg-secondary/10"}`}>
                           <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${isActive ? "text-primary" : "text-secondary"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                           </svg>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs tracking-tight uppercase">My Cloud</span>
                      </div>
                      <div className="text-[10px] opacity-40 font-bold truncate">Self-transfer & notes</div>
                    </div>
                  </>
                )}
              </NavLink>
            </li>
          )}

          {contacts.filter(c => c !== userPub).map((c) => (
            <li key={c}>
              <NavLink
                to={`/chat/${c}`}
                className={({ isActive }) => 
                  `flex items-center p-3 px-6 gap-4 transition-all relative group ${
                    isActive ? "bg-primary text-white shadow-lg shadow-primary/20" : "hover:bg-base-content/5 active:bg-base-content/10"
                  }`
                }
                onClick={() => {
                  setRecipient(c);
                  requestNotifications();
                }}
              >
                {({ isActive }) => (
                  <>
                    <div className="avatar">
                      <div className="w-10 rounded-full border border-base-content/5 bg-base-300 overflow-hidden">
                        {contactProfiles[c]?.avatar ? (
                          <img src={contactProfiles[c].avatar} alt="avatar" className="object-cover" />
                        ) : (
                          <img src={getDiceBearAvatar(contactProfiles[c]?.nickname || c)} alt="avatar" className="object-cover bg-primary/10" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate text-sm tracking-tight">
                          {contactProfiles[c]?.nickname || 
                            (c.length === 36 && c.includes("-") ? "Loading group..." :
                            c.length > 20 ? `${c.slice(0, 8)}...${c.slice(-4)}` : c)}
                        </span>
                        {unreadCounts[c] > 0 && (
                          <span className={`badge badge-sm font-bold shadow-lg rounded-full px-2 h-5 ${isActive ? "bg-white text-primary border-white" : "badge-primary shadow-primary/20"}`}>
                            {unreadCounts[c]}
                          </span>
                        )}
                      </div>
                      {c.length === 36 && c.includes("-") && (
                         <div className={`text-[9px] font-semibold uppercase tracking-[0.1em] mt-0.5 ${isActive ? "opacity-60" : "opacity-40"}`}>GROUP CHANNEL</div>
                      )}
                    </div>

                    <div 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        handleDeleteContact(c, e); 
                      }}
                      className={`btn btn-ghost btn-circle btn-xs opacity-0 group-hover:opacity-100 transition-all ml-1 ${isActive ? "text-slate-900/60 hover:text-slate-900" : "text-error hover:bg-error/10"}`}
                      title="Delete chat"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-base-200 border-t border-base-content/5 shrink-0 flex items-center gap-2">
        <label className="input input-sm h-11 flex-1 bg-base-content/10 border-none flex items-center gap-3 focus-within:ring-1 focus-within:ring-primary/20 rounded-2xl px-4 transition-all group">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 opacity-30 group-focus-within:opacity-100 transition-opacity"><path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" /></svg>
          <input
            type="text"
            className="grow font-semibold text-xs placeholder:opacity-30"
            placeholder="Search or join..."
            onKeyDown={async (e: any) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                if (!signalService || !groupService) {
                  showNotification("Services not ready", "error");
                  return;
                }
                const name = e.target.value.trim();
                const target = e.target;

                target.disabled = true;
                const origPlaceholder = target.placeholder;
                target.placeholder = "Resolving...";
                target.value = "";

                try {
                  // 1. Try to resolve as a public group name first
                  const publicGroup = await groupService.getPublicGroup(name);
                  if (publicGroup) {
                    const groupInfo = await groupService.joinPublicGroup(name);
                    setRecipient(groupInfo.id);
                    showNotification(`Joined public group: ${groupInfo.name}`, "info");
                    navigate(`/chat/${groupInfo.id}`);
                    return;
                  }

                  // 2. Try to resolve as an invite code if it's long
                  if (name.length > 50 && !name.startsWith("@")) {
                    try {
                      const groupInfo = await groupService.joinGroup(name);
                      setRecipient(groupInfo.id);
                      showNotification(`Joined group via invite: ${groupInfo.name}`, "info");
                      navigate(`/chat/${groupInfo.id}`);
                      return;
                    } catch (ge) {}
                  }

                  // 3. Resolve as a pubkey/username for 1:1 chat
                  let pubKey = name;
                  if (name.length < 30 || name.startsWith("@")) {
                    pubKey = await signalService.getPubKeyFromUsername(name);
                  }

                  saveContact(pubKey);
                  setRecipient(pubKey);
                  navigate(`/chat/${pubKey}`);
                } catch (err: any) {
                  showNotification(`Could not resolve: ${name}`, "error");
                } finally {
                  target.disabled = false;
                  target.placeholder = origPlaceholder;
                  target.focus();
                }
              }
            }}
          />
        </label>

        <button 
          onClick={() => setShowScanner(true)}
          className="btn btn-ghost btn-circle bg-base-content/5 hover:bg-base-content/10 h-11 w-11 min-h-0 border-none transition-all active:scale-95 flex items-center justify-center p-0"
          title="Scan QR"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
          </svg>
        </button>

        {showScanner && (
          <QrScannerModal 
            onScan={handleQrScan} 
            onClose={() => setShowScanner(false)} 
          />
        )}
      </div>
    </div>
  );
};

import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { getDiceBearAvatar } from "../utils/avatar";

interface SidebarProps {
  userPub: string | null;
  userNick: string;
  username: string;
  userAvatar: string | null;
  contacts: string[];
  recipient: string; // Keep for Layout logic if needed, but unused in Sidebar body
  setRecipient: (id: string) => void;
  contactProfiles: Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>;
  unreadCounts: Record<string, number>;
  handleDeleteContact: (id: string, e: React.MouseEvent) => Promise<void>;
  signalService: any;
  groupService: any;
  showNotification: (msg: string, type?: "info" | "error") => void;
  saveContact: (id: string) => void;
  requestNotifications: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userPub,
  userNick,
  username,
  userAvatar,
  contacts,
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

  return (
    <div className="flex flex-col h-full bg-base-200/95 backdrop-blur-3xl border-r border-white/5 w-full transition-all overflow-hidden shadow-2xl font-narrow">
      {/* User info Header - Telegram Style */}
      <div className="px-6 flex items-center justify-between border-b border-white/5 bg-base-300/20 h-16 shrink-0">
        <div
          className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-all grow mr-4 group"
          onClick={() => navigate("/profile")}
        >
          <div className="avatar relative">
            <div className="w-11 rounded-full ring-4 ring-primary/10 ring-offset-base-100 ring-offset-4 shadow-xl transition-transform group-hover:scale-105">
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
          className="btn btn-ghost btn-circle shadow-xl bg-base-300/50 hover:bg-base-300 border border-white/5"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="px-6 py-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 text-primary">Conversations</span>
        <button
          className="btn btn-ghost btn-circle btn-sm bg-primary/10 text-primary hover:bg-primary hover:text-primary-content transition-all shadow-lg shadow-primary/10"
          onClick={() => navigate("/create-group")}
          title="Create New Group"
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
                  `flex items-center p-4 gap-4 rounded-2xl transition-all relative group h-16 ${
                    isActive ? "bg-primary text-primary-content shadow-xl shadow-primary/20 border-white/10" : "hover:bg-white/5 border-transparent active:scale-[0.98]"
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
                      <div className={`w-12 rounded-full border-2 shadow-xl ring-4 ring-offset-4 ring-offset-transparent transition-all ${isActive ? "border-white/30 ring-white/10" : "border-secondary/20 ring-secondary/5"}`}>
                        <div className={`w-full h-full flex items-center justify-center ${isActive ? "bg-white/20" : "bg-secondary/10"}`}>
                           <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${isActive ? "text-white" : "text-secondary"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                           </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-2">
                        <span className={`font-bold truncate tracking-tight text-sm ${isActive ? "text-white" : ""}`}>
                          My Cloud
                        </span>
                        <div className={`text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-md ${isActive ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>SYNC</div>
                      </div>
                      <div className={`text-[9px] font-semibold uppercase tracking-[0.1em] mt-0.5 ${isActive ? "text-white/60" : "text-base-content/40"}`}>Personal Storage</div>
                    </div>
                  </>
                )}
              </NavLink>
            </li>
          )}

          {contacts.length === 0 && !userPub && (
            <div className="p-12 text-center opacity-20 text-xs italic font-medium">
              No conversations yet
            </div>
          )}
          {contacts.filter(c => c !== userPub).map((c) => (
            <li key={c}>
              <NavLink
                to={`/chat/${c}`}
                className={({ isActive }) => 
                  `flex items-center p-4 gap-4 rounded-2xl transition-all relative group h-16 ${
                    isActive ? "bg-primary text-primary-content shadow-xl shadow-primary/20 border border-white/10" : "hover:bg-white/5 border-transparent active:scale-[0.98]"
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
                      <div className={`w-12 rounded-full border-2 shadow-xl ring-4 ring-offset-4 ring-offset-transparent transition-all ${isActive ? "border-white/30 ring-white/10" : "border-white/5 ring-primary/5"}`}>
                        {contactProfiles[c]?.avatar ? (
                          <img src={contactProfiles[c].avatar} alt={c} className="object-cover" />
                        ) : (
                          <img 
                            src={getDiceBearAvatar(c, c.length === 36 && c.includes("-"))} 
                            alt={c} 
                            className={`object-cover ${isActive ? "bg-white/20" : "bg-neutral"}`} 
                          />
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-2">
                        <span className={`font-bold truncate tracking-tight text-sm ${isActive ? "text-white" : ""}`}>
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
                         <div className={`text-[9px] font-semibold uppercase tracking-[0.1em] mt-0.5 ${isActive ? "text-white/60" : "text-primary/60"}`}>GROUP CHANNEL</div>
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

      <div className="p-4 bg-base-300/40 border-t border-white/5 shrink-0">
        <label className="input input-sm h-12 w-full bg-base-100/40 border-white/5 flex items-center gap-3 focus-within:ring-4 focus-within:ring-primary/10 transition-all rounded-xl px-4 shadow-inner group">
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
      </div>
    </div>
  );
};

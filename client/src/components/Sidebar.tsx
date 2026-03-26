import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { getInitial } from "../utils/ui";

interface SidebarProps {
  userNick: string;
  username: string;
  userAvatar: string | null;
  contacts: string[];
  recipient: string; // Keep for Layout logic if needed, but unused in Sidebar body
  setRecipient: (id: string) => void;
  contactProfiles: Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>;
  unreadCounts: Record<string, number>;
  handleDeleteContact: (id: string, e: React.MouseEvent) => void;
  setShowCreateGroup: (show: boolean) => void;
  signalService: any;
  groupService: any;
  showNotification: (msg: string, type?: "info" | "error") => void;
  saveContact: (id: string) => void;
  requestNotifications: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userNick,
  username,
  userAvatar,
  contacts,
  setRecipient,
  contactProfiles,
  unreadCounts,
  handleDeleteContact,
  setShowCreateGroup,
  signalService,
  groupService,
  showNotification,
  saveContact,
  requestNotifications,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full bg-base-200 border-r border-white/5 w-80 lg:w-96 min-h-full transition-all">
      {/* User info Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-base-300/30">
        <div
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity grow mr-4"
          onClick={() => navigate("/profile")}
        >
          <div className="avatar">
            <div className="w-10 rounded-full ring ring-primary/20 ring-offset-base-100 ring-offset-2">
              {userAvatar ? (
                <img src={userAvatar} alt="avatar" />
              ) : (
                <div className="bg-primary text-primary-content flex items-center justify-center font-bold">
                  {getInitial(userNick || username)}
                </div>
              )}
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="font-bold truncate text-sm">{userNick || username}</div>
            <div className="flex items-center gap-1.5 text-[10px] opacity-60 uppercase tracking-wider">
              <span className="status status-success status-xs"></span> Online
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="btn btn-ghost btn-circle btn-sm"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-3 flex items-center justify-between opacity-50">
        <span className="text-xs font-bold uppercase tracking-widest">Conversations</span>
        <button
          className="btn btn-ghost btn-circle btn-xs"
          onClick={() => setShowCreateGroup(true)}
          title="Create New Group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="menu menu-md w-full p-2 gap-1">
          {contacts.length === 0 && (
            <div className="p-8 text-center opacity-30 text-xs italic">
              No conversations yet
            </div>
          )}
          {contacts.map((c) => (
            <li key={c}>
              <NavLink
                to={`/chat/${c}`}
                className={({ isActive }) => 
                  `flex items-center p-3 gap-3 rounded-lg transition-all ${
                    isActive ? "bg-primary/20 text-primary-content" : "hover:bg-primary/10 active:scale-[0.98]"
                  }`
                }
                onClick={requestNotifications}
              >
                <div className="avatar">
                  <div className="w-11 rounded-full border border-white/5 ring ring-primary/5">
                    {contactProfiles[c]?.avatar ? (
                      <img src={contactProfiles[c].avatar} alt={c} />
                    ) : (
                      <div className="bg-neutral text-neutral-content flex items-center justify-center font-bold">
                        {getInitial(contactProfiles[c]?.nickname || c)}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold truncate">
                      {contactProfiles[c]?.nickname ||
                        (c.length > 20 ? `${c.slice(0, 8)}...${c.slice(-4)}` : c)}
                    </span>
                    {unreadCounts[c] > 0 && (
                      <span className="badge badge-primary badge-sm font-bold shadow-lg shadow-primary/20 animate-pulse">{unreadCounts[c]}</span>
                    )}
                  </div>
                </div>

                <div 
                  onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    handleDeleteContact(c, e); 
                  }}
                  className="btn btn-ghost btn-circle btn-xs opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:text-error transition-all"
                  title="Delete chat"
                >
                  ✕
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4 bg-base-300/20">
        <label className="input input-sm h-10 w-full bg-base-200 border-white/5 flex items-center gap-2 focus-within:border-primary/50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 opacity-70"><path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" /></svg>
          <input
            type="text"
            className="grow"
            placeholder="Search or add..."
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
                  if (name.length > 50 && !name.startsWith("@")) {
                    try {
                      const groupInfo = await groupService.joinGroup(name);
                      setRecipient(groupInfo.id);
                      showNotification(`Joined group: ${groupInfo.name}`, "info");
                      return;
                    } catch (ge) {}
                  }

                  let pubKey = name;
                  if (name.length < 30 || name.startsWith("@")) {
                    pubKey = await signalService.getPubKeyFromUsername(name);
                  }

                  saveContact(pubKey);
                  setRecipient(pubKey);
                } catch (err: any) {
                  showNotification(`User not found: ${name}`, "error");
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

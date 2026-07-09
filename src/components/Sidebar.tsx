import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSmoothNavigate } from "../hooks/useSmoothNavigate";
import { UserAvatar } from "./UserAvatar";
import { CommunicationService } from "../services/CommunicationService";
import { GroupService } from "../services/GroupService";
import { QrScannerModal } from "./QrScannerModal";
import { DataBase } from "../zen/db";
import { getDisplayName } from "../utils/names";

interface SidebarProps {
  userPub: string | null;
  db: DataBase;
  contacts: string[];
  setRecipient: (id: string) => void;
  contactProfiles: Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>;
  unreadCounts: Record<string, number>;
  handleDeleteContact: (id: string, e: React.MouseEvent) => void;
  communicationService: CommunicationService | null;
  groupService: GroupService | null;
  showNotification: (msg: string, type?: "info" | "error") => void;
  saveContact: (id: string) => void;
  requestNotifications: () => void;
  blockedContacts: Set<string>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userPub,
  db,
  contacts,
  setRecipient,
  contactProfiles,
  unreadCounts,
  handleDeleteContact,
  communicationService,
  groupService,
  showNotification,
  saveContact,
  requestNotifications,
  blockedContacts,
}) => {
  const smoothNavigate = useSmoothNavigate();
  const [showScanner, setShowScanner] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const visibleContacts = contacts.filter((id) =>
    filter === "unread" ? (unreadCounts[id] || 0) > 0 : true,
  );

  const handleQrScan = async (data: string) => {
    setShowScanner(false);
    if (!data) return;

    try {
      let pubKey = data.trim();
      
      // 1. Handle Universal Links (?add=)
      if (pubKey.includes("?add=")) {
        const urlSplit = pubKey.split("?add=");
        const extracted = urlSplit[1]?.split("&")[0];
        if (extracted) pubKey = extracted;
      }
      // 2. Handle Magic Links (if scanned by mistake, extract pub from pair)
      else if (pubKey.includes("?magic_login=") || pubKey.includes("?session=")) {
        const url = new URL(pubKey);
        const encoded = url.searchParams.get("magic_login") || url.searchParams.get("session");
        if (encoded) {
          let jsonStr = "";
          const cleanEncoded = encoded.trim().replace(/ /g, "+");
          try {
            jsonStr = decodeURIComponent(escape(window.atob(cleanEncoded)));
          } catch (e) {
            try {
              jsonStr = window.atob(cleanEncoded);
            } catch (e2) {
              jsonStr = encoded;
            }
          }
          const payload = JSON.parse(jsonStr);
          const pair = payload.type === "shogun-auth-pair" ? payload.pair : payload;
          if (pair.pub) pubKey = pair.pub;
        }
      }

      // 3. Resolve username if needed
      if (pubKey.length < 30 || pubKey.startsWith("@")) {
        if (!communicationService) return;
        pubKey = await communicationService.getPubKeyFromUsername(pubKey);
      }

      if (!blockedContacts.has(pubKey)) {
        saveContact(pubKey);
        showNotification(`Contact added via QR!`, "info");
      } else {
        showNotification(`Opening chat with blocked contact`, "info");
      }
      smoothNavigate(`/chat/${pubKey}`, () => setRecipient(pubKey));
    } catch (err: any) {
      showNotification("Invalid QR Code", "error");
    }
  };

  const handleSearchSubmit = async (e: any) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      if (!communicationService || !groupService) {
        showNotification("Services not ready", "error");
        return;
      }
      const name = searchQuery.trim();
      
      try {
        // 1. Try to resolve as a public group name first
        const publicGroup = await groupService.getPublicGroup(name);
        if (publicGroup) {
          const groupInfo = await groupService.joinPublicGroup(name);
          smoothNavigate(`/chat/${groupInfo.id}`, () => {
            setRecipient(groupInfo.id);
            setShowSearch(false);
            setSearchQuery("");
          });
          showNotification(`Joined public group: ${groupInfo.name}`, "info");
          return;
        }

        // 2. Try to resolve as an invite code if it's long
        if (name.length > 50 && !name.startsWith("@")) {
          try {
            const groupInfo = await groupService.joinGroup(name);
            smoothNavigate(`/chat/${groupInfo.id}`, () => {
              setRecipient(groupInfo.id);
              setShowSearch(false);
              setSearchQuery("");
            });
            showNotification(`Joined group via invite: ${groupInfo.name}`, "info");
            return;
          } catch (ge) {}
        }

        // 3. Resolve as a pubkey/username for 1:1 chat
        let pubKey = name;
        if (name.length < 30 || name.startsWith("@")) {
          pubKey = await communicationService.getPubKeyFromUsername(name);
        }

        if (!blockedContacts.has(pubKey)) {
          saveContact(pubKey);
        } else {
          showNotification(`Opening chat with blocked contact`, "info");
        }
        smoothNavigate(`/chat/${pubKey}`, () => {
          setRecipient(pubKey);
          setShowSearch(false);
          setSearchQuery("");
        });
      } catch (err: any) {
        showNotification(`Could not resolve: ${name}`, "error");
      }
    } else if (e.key === "Escape") {
      setShowSearch(false);
      setSearchQuery("");
    }
  };

  return (
    <div className="flex flex-col h-full glass-panel border-r border-base-content/5 w-full transition-all overflow-hidden font-narrow">
      {/* Header - Signal Style */}
      <div className="px-6 pt-safe flex items-center justify-between bg-transparent min-h-20 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div 
            className="avatar cursor-pointer hover:opacity-80 transition-all pointer-events-auto"
            onClick={() => smoothNavigate("/profile")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") smoothNavigate("/profile"); }}
            role="button"
            tabIndex={0}
            aria-label="Profilo utente"
          >
            <UserAvatar 
              pub={userPub || ""} 
              db={db} 
              className="w-11 h-11" 
            />
          </div>
          {!showSearch && (
            <h1 className="text-[20px] font-bold tracking-tight text-base-content">
              Chat
            </h1>
          )}
        </div>

        <div className="flex items-center gap-1">
          {showSearch ? (
            <div className="flex items-center gap-2 w-full max-w-[200px]">
              <input
                 autoFocus
                 type="text"
                 className="input input-sm bg-base-300/50 border-none rounded-full w-full font-medium text-[14px]"
                 placeholder="Cerca..."
                 aria-label="Cerca contatti o gruppi"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onKeyDown={handleSearchSubmit}
              />
              <button 
                onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                className="btn btn-ghost btn-circle btn-xs opacity-40"
                aria-label="Chiudi ricerca"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowSearch(true)}
                className="btn btn-ghost btn-circle btn-sm opacity-60 hover:opacity-100"
                aria-label="Cerca"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <div className="dropdown dropdown-end">
                <button
                  tabIndex={0}
                  className="btn btn-ghost btn-circle btn-sm opacity-60 hover:opacity-100"
                  aria-label="Menu opzioni"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                  </svg>
                </button>
                <ul tabIndex={0} className="dropdown-content menu p-2 shadow-2xl bg-base-300 rounded-xl w-52 mt-2 z-[100] border border-white/5 font-bold">
                  <li><button onClick={() => smoothNavigate("/create-group")}>Nuovo Gruppo</button></li>
                  <li><button onClick={() => smoothNavigate("/settings")}>Impostazioni</button></li>
                  <li><button onClick={() => requestNotifications()}>Notifiche</button></li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter Chips - All / Unread */}
      <div className="px-4 pb-2 flex items-center gap-2 shrink-0">
        <button
          onClick={() => setFilter("all")}
          className={`btn btn-sm rounded-full px-5 font-bold border-none transition-all ${
            filter === "all"
              ? "bg-primary text-primary-content"
              : "bg-base-300/60 opacity-70 hover:opacity-100"
          }`}
        >
          Tutte
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`btn btn-sm rounded-full px-5 font-bold border-none transition-all ${
            filter === "unread"
              ? "bg-primary text-primary-content"
              : "bg-base-300/60 opacity-70 hover:opacity-100"
          }`}
        >
          Non lette
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-40 scrollbar-hide relative">
        <ul className="menu menu-md w-full p-0 space-y-0.5">
          {filter === "unread" && visibleContacts.length === 0 && (
            <li className="px-4 py-10 text-center opacity-30 text-sm font-bold">
              Nessuna chat non letta
            </li>
          )}
          {/* My Cloud / Self Transfer Section */}
          {userPub && filter === "all" && (
            <li key="self-transfer">
              <NavLink
                to={`/chat/${userPub}`}
                className={({ isActive }) => 
                  `flex items-center p-3 px-4 gap-3 transition-all relative border-none hover:bg-base-content/5 rounded-xl mx-1 ${
                    isActive ? "bg-primary text-primary-content" : "bg-transparent"
                  }`
                }
                onClick={() => {
                  setRecipient(userPub);
                  requestNotifications();
                }}
              >
                <div className="avatar">
                  <div className="w-12 h-12 rounded-full border border-base-content/5 bg-base-300 overflow-hidden shadow-sm flex items-center justify-center">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                       </svg>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[16px] tracking-tight">Messaggi Salvati</span>
                  </div>
                  <div className="text-[13px] opacity-60 truncate">Spazio personale</div>
                </div>
              </NavLink>
            </li>
          )}

          {visibleContacts.map((id) => {
            const isGroup = id.length === 36 && id.includes("-");
            const cleanId = isGroup ? id : DataBase.cleanPub(id);
            const profile = contactProfiles[cleanId] || {};
            const unreadCount = unreadCounts[id] || 0;

            return (
              <li key={id} className="group relative">
                <NavLink
                  to={`/chat/${id}`}
                  className={({ isActive }) =>
                    `flex items-center p-3 px-4 gap-3 transition-all relative border-none hover:bg-base-content/5 rounded-xl mx-1 ${
                      isActive ? "bg-primary text-primary-content" : "bg-transparent"
                    }`
                  }
                  onClick={() => {
                    setRecipient(id);
                    requestNotifications();
                  }}
                >
                  <div className="avatar relative">
                    <UserAvatar 
                      pub={id} 
                      db={db} 
                      isGroup={isGroup} 
                      className="w-12 h-12" 
                    />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 badge badge-primary badge-sm font-bold border-2 border-base-100 px-1.5">
                        {unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[16px] tracking-tight truncate">
                        {getDisplayName(id, profile)}
                      </span>
                    </div>
                    <div className="text-[13px] opacity-60 truncate">
                      {isGroup ? "Gruppo" : "Chat privata"}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteContact(id, e)}
                    className="btn btn-ghost btn-circle btn-xs opacity-0 group-hover:opacity-100 transition-all hover:bg-error/20 hover:text-error"
                    aria-label="Elimina contatto"
                  >
                    ✕
                  </button>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-6 lg:absolute lg:bottom-8 lg:right-8 flex flex-col gap-4 z-50 animate-slide-up">
        <button
          onClick={() => setShowScanner(true)}
          className="btn btn-circle bg-base-300 hover:bg-base-content/10 border-none shadow-2xl h-12 w-12 group transition-all"
          title="Scansiona QR Code"
          aria-label="Scansiona QR Code"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 opacity-60 group-hover:opacity-100">
             <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
             <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        </button>
        <button
          onClick={() => setShowSearch(true)}
          className="btn btn-circle btn-primary shadow-2xl h-14 w-14 transition-all hover:scale-105"
          title="Nuova chat o gruppo"
          aria-label="Nuova chat o gruppo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
        </button>
      </div>

      {showScanner && (
        <QrScannerModal 
          onScan={handleQrScan} 
          onClose={() => setShowScanner(false)} 
        />
      )}
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GroupService, type GroupMember, type GroupInfo, type Role } from 'linda-core';
import { DataBase } from 'linda-core';
import { UserAvatar } from "../components/UserAvatar";
import { groupPath } from '../utils/groupPath.js';

interface GroupSettingsPageProps {
  groupService: GroupService;
  db: DataBase;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const GroupSettingsPage: React.FC<GroupSettingsPageProps> = ({
  groupService,
  db,
  showNotification,
}) => {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<"members" | "settings" | "invites" | "reports">("members");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [mutes, setMutes] = useState<Record<string, boolean>>({});
  const [reports, setReports] = useState<any[]>([]);
  
  // Meta editing state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [publicName, setPublicName] = useState("");

  const loadData = async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const info = await (db.Get as any)(`${groupPath(groupId)}/meta`) as GroupInfo;
      if (info) {
        setGroupInfo(info);
        setEditName(info.name || "");
        setEditDesc(info.description || "");
        setIsPublic(!!info.isPublic);
        setPublicName(info.publicName || info.name?.toLowerCase().replace(/\s+/g, '-') || "");
      }
      
      const m = await groupService.getMembers(groupId);
      setMembers(m);

      const pub = db.getUserPub();
      if (pub) {
        const role = await groupService.getMemberRole(groupId, pub);
        setMyRole(role);
      }

      // Load mutes for all members in parallel
      const muteEntries = await Promise.all(
        m.map(async (member: any) => [
          member.pub,
          await groupService.isMuted(groupId, member.pub),
        ] as [string, boolean])
      );
      setMutes(Object.fromEntries(muteEntries));

    } catch (e) {
      showNotification("Impossibile caricare i dati del gruppo", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (groupId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !db.zen || !myRole || !['moderator', 'administrator'].includes(myRole)) return;
    
    const reportsRef = db.zen.get(`${groupPath(groupId)}/reports`);
    const handleReport = (data: any, id: string) => {
        if (!data || id === '_' || id === '>') return;
        setReports(prev => {
            const index = prev.findIndex(r => r.id === id);
            const reportData = { id, ...data };
            if (index >= 0) {
              if (JSON.stringify(prev[index]) === JSON.stringify(reportData)) return prev;
              const next = [...prev];
              next[index] = reportData;
              return next;
            }
            return [...prev, reportData];
        });
    };

    reportsRef.map().on(handleReport);
    
    return () => {
        try { (reportsRef as any).off(); } catch(e) {}
    };
  }, [groupId, myRole, db.zen]);

  const handleUpdateMeta = async () => {
    if (!groupId) return;
    try {
      await groupService.updateGroupMeta(groupId, { name: editName, description: editDesc });
      
      // Update local profile cache
      try {
        const cached = localStorage.getItem("linda_contact_profiles_v2");
        const profiles = cached ? JSON.parse(cached) : {};
        profiles[groupId] = {
          ...(profiles[groupId] || {}),
          nickname: editName,
        };
        localStorage.setItem("linda_contact_profiles_v2", JSON.stringify(profiles));
      } catch (e) {}

      showNotification("Dati del gruppo aggiornati!", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Impossibile aggiornare il gruppo", "error");
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !groupId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 120;
        const MAX_HEIGHT = 120;
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        
        try {
          await groupService.updateGroupMeta(groupId, { avatar: dataUrl });
          
          try {
            localStorage.setItem(`linda_avatar_${groupId}`, dataUrl);
            const cached = localStorage.getItem("linda_contact_profiles_v2");
            const profiles = cached ? JSON.parse(cached) : {};
            profiles[groupId] = {
              ...(profiles[groupId] || {}),
              avatar: dataUrl,
            };
            localStorage.setItem("linda_contact_profiles_v2", JSON.stringify(profiles));
          } catch (e) {}

          window.dispatchEvent(new CustomEvent("linda_avatar_updated", {
            detail: { pub: groupId, avatar: dataUrl }
          }));

          showNotification("Immagine del gruppo aggiornata!", "info");
          loadData();
        } catch (e: any) {
          showNotification("Impossibile salvare l'immagine del gruppo", "error");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMute = async (memberPub: string, muted: boolean) => {
    if (!groupId) return;
    try {
      await groupService.muteMember(groupId, memberPub, muted);
      showNotification(muted ? "Membro silenziato" : "Membro riattivato", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Impossibile modificare lo stato di silenziamento", "error");
    }
  };

  const handleResolveReport = async (reportId: string, status: "resolved" | "dismissed") => {
    if (!groupId) return;
    try {
      await groupService.resolveReport(groupId, reportId, status);
      showNotification(`Segnalazione ${status === 'resolved' ? 'risolta' : 'archiviata'}`, "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Impossibile aggiornare la segnalazione", "error");
    }
  };

  const handleUpdateRole = async (memberPub: string, newRole: Role) => {
    if (!groupId) return;
    try {
      await groupService.updateMemberRole(groupId, memberPub, newRole);
      showNotification(`Ruolo aggiornato a ${newRole === 'administrator' ? 'Amministratore' : newRole === 'moderator' ? 'Moderatore' : 'Membro'}`, "info");
      loadData(); 
    } catch (e: any) {
      showNotification(e.message || "Impossibile aggiornare il ruolo", "error");
    }
  };

  const handleKick = async (memberPub: string) => {
    if (!groupId || !window.confirm("Sei sicuro di voler rimuovere questo membro dal gruppo?")) return;
    try {
      await groupService.kickMember(groupId, memberPub);
      showNotification("Membro rimosso dal gruppo", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Impossibile espellere il membro", "error");
    }
  };

  const handleLeaveGroup = async () => {
    if (!groupId) return;

    try {
      await groupService.leaveGroup(groupId, false);
      showNotification("Hai lasciato il gruppo", "info");
      navigate("/");
    } catch (e: any) {
      if (e.message === "LAST_ADMIN_WARNING") {
        const confirmForce = window.confirm(
          "⚠️ ATTENZIONE: Sei l'UNICO amministratore di questo gruppo.\n\n" +
          "Se esci ora, il gruppo rimarrà senza amministratori e perderai i privilegi di gestione in modo permanente (anche in caso di rientro).\n\n" +
          "Vuoi davvero lasciare il gruppo?"
        );
        if (confirmForce) {
          try {
            await groupService.leaveGroup(groupId, true);
            showNotification("Hai lasciato il gruppo", "info");
            navigate("/");
          } catch (err: any) {
            showNotification(err.message || "Impossibile lasciare il gruppo", "error");
          }
        }
      } else {
        showNotification(e.message || "Impossibile lasciare il gruppo", "error");
      }
    }
  };

  const handleGenerateInvite = async (role: Role, singleUse: boolean = false) => {
    if (!groupId) return;
    try {
      const invite = await groupService.generateInvite(groupId, role, singleUse);
      setInviteUrl(invite);
      navigator.clipboard.writeText(invite);
      showNotification("Link di invito copiato negli appunti!", "info");
    } catch (e: any) {
      console.error(e);
      if (e instanceof Error && e.message.includes('GROUP_FULL_LIMIT_50')) {
        showNotification("Limite massimo del gruppo (50 membri) raggiunto", "error");
      } else {
        showNotification("Impossibile generare l'invito", "error");
      }
    }
  };

  const handleToggleFeature = async (feature: 'callsEnabled' | 'activityEnabled', enabled: boolean) => {
    if (!groupId) return;
    try {
      await groupService.toggleFeature(groupId, feature, enabled);
      showNotification("Funzionalità aggiornata", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Impossibile modificare l'impostazione", "error");
    }
  };

  const handleTogglePublic = async (enabled: boolean) => {
    if (!groupId) return;
    try {
      if (enabled && !publicName.trim()) {
        showNotification("Il nome pubblico è obbligatorio per rendere il gruppo pubblico", "error");
        return;
      }
      await groupService.setGroupPublic(groupId, enabled, publicName.trim());
      showNotification(enabled ? "Il gruppo è ora pubblico" : "Il gruppo è ora privato", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Impossibile aggiornare la visibilità pubblica", "error");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );

  return (
    <div className="p-6 sm:p-12 lg:p-16 max-w-5xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto font-narrow">
      <div className="flex items-center gap-6 relative z-10">
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => (groupId ? navigate(`/chat/${groupId}`) : navigate(-1))}
          aria-label="Torna alla chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Gestione Gruppo</h1>
          <p className="text-xs opacity-60 font-semibold mt-0.5">Membri, permessi, sicurezza e impostazioni della conversazione</p>
        </div>
      </div>

      {!myRole ? (
        <div className="card bg-base-200/40 backdrop-blur-xl p-12 text-center border border-base-content/10 shadow-2xl rounded-3xl">
           <div className="p-6 bg-error/10 rounded-2xl border border-error/20 inline-block mb-6 mx-auto">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
             </svg>
           </div>
           <p className="text-xl font-bold opacity-80 mb-6">Non sei più membro di questo gruppo.</p>
           <button onClick={() => navigate("/")} className="btn btn-primary px-10 rounded-2xl">Torna alla Home</button>
        </div>
      ) : (
        <div className="flex flex-col gap-8 sm:gap-12">
          {/* Group Overview Card */}
          <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-10 bg-base-200 p-8 sm:p-10 rounded-3xl border border-base-content/5 shadow-md relative overflow-hidden group">
            <div className="relative z-10 shrink-0">
              <UserAvatar 
                pub={groupId || ""} 
                db={db} 
                isGroup={true} 
                className="w-24 sm:w-32 rounded-3xl ring-4 ring-primary/20 shadow-xl" 
              />
              {['moderator', 'administrator'].includes(myRole) && (
                <label className="btn btn-primary btn-circle btn-sm absolute -bottom-1 -right-1 shadow-2xl border-2 border-base-200 cursor-pointer" title="Modifica immagine gruppo">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
                </label>
              )}
            </div>
            <div className="text-center sm:text-left z-10 flex-1 min-w-0">
              <h2 className="text-2xl sm:text-3xl font-black mb-2 truncate">{groupInfo?.name || "Gruppo"}</h2>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <span className="badge badge-primary font-black tracking-widest text-[10px] h-7 px-4 uppercase">
                  {myRole === 'administrator' ? 'Amministratore' : myRole === 'moderator' ? 'Moderatore' : 'Membro'}
                </span>
                <span className="badge badge-neutral font-bold text-[10px] h-7 px-3 opacity-70">
                  {groupInfo?.type === 'broadcast' ? 'Canale Broadcast' : 'Gruppo Aperto'}
                </span>
                <span className="badge bg-base-300 font-bold text-[10px] h-7 px-3 opacity-60">
                  {members.length} {members.length === 1 ? 'membro' : 'membri'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs tabs-boxed w-full max-w-2xl mx-auto p-1 bg-base-300 border border-base-content/5 rounded-2xl">
            <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'members' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('members')}>Membri ({members.length})</button>
            <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'settings' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('settings')}>Impostazioni</button>
            <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'invites' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('invites')}>Inviti</button>
            {['moderator', 'administrator'].includes(myRole) && (
              <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'reports' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('reports')}>
                Segnalazioni {reports.filter(r => r.status === 'pending').length > 0 && <span className="badge badge-error badge-xs"></span>}
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === 'members' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {members.map(m => (
                    <div key={m.pub} className="flex items-center justify-between p-4 bg-base-200 rounded-2xl border border-base-content/5 group hover:border-primary/20 transition-all shadow-sm">
                      <div className="flex items-center gap-4 min-w-0">
                        <UserAvatar 
                          pub={m.pub} 
                          db={db} 
                          className="w-12 h-12 shrink-0" 
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold flex items-center gap-2">
                            <span className="truncate max-w-[120px] sm:max-w-[150px]">{m.pub.slice(0, 10)}...</span>
                            <span className={`badge badge-xs font-black uppercase tracking-tight ${m.role === 'administrator' ? 'badge-primary' : m.role === 'moderator' ? 'badge-neutral' : 'badge-ghost opacity-40'}`}>
                              {m.role === 'administrator' ? 'Admin' : m.role === 'moderator' ? 'Mod' : 'Peer'}
                            </span>
                          </div>
                          {mutes[m.pub] && <span className="text-[10px] font-black tracking-widest text-error opacity-80 uppercase">Silenziato</span>}
                        </div>
                      </div>
                      
                      <div className="flex gap-1 shrink-0">
                        {myRole === 'administrator' && m.role !== 'administrator' && (
                          <div className="dropdown dropdown-end">
                            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-sm" aria-label="Opzioni membro">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                            </div>
                            <ul tabIndex={0} className="dropdown-content z-[10] menu p-2 shadow-2xl bg-base-300 rounded-2xl w-48 border border-base-content/10 font-bold">
                              {m.role !== 'moderator' && (
                                <li><button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="text-sm font-bold">Promuovi a Moderatore</button></li>
                              )}
                              <li><button onClick={() => handleUpdateRole(m.pub, 'administrator')} className="text-sm font-bold text-primary">Promuovi ad Admin</button></li>
                              <li><button onClick={() => handleMute(m.pub, !mutes[m.pub])} className="text-sm font-bold">{mutes[m.pub] ? 'Riattiva audio' : 'Silenzia membro'}</button></li>
                              <li><button onClick={() => handleKick(m.pub)} className="text-sm font-bold text-error">Espelli dal gruppo</button></li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="pt-6">
                  <button onClick={handleLeaveGroup} className="btn btn-error btn-outline btn-block rounded-2xl border-error/30 hover:bg-error hover:text-error-content transition-all shadow-lg font-bold">
                     Abbandona Gruppo
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {['moderator', 'administrator'].includes(myRole) ? (
                  <div className="card bg-base-200 border border-base-content/5 overflow-hidden md:col-span-2 rounded-3xl shadow-sm">
                    <div className="card-body p-8 sm:p-10 gap-6">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-50 text-primary">Informazioni Generali</h3>
                      <div className="grid grid-cols-1 gap-6">
                        <div className="form-control">
                          <label className="label"><span className="label-text font-bold opacity-60 tracking-widest text-[10px] uppercase">Nome del Gruppo</span></label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} className="input input-bordered w-full rounded-2xl focus:border-primary bg-base-100/50 shadow-inner font-bold" />
                        </div>
                        <div className="form-control">
                          <label className="label"><span className="label-text font-bold opacity-60 tracking-widest text-[10px] uppercase">Descrizione</span></label>
                          <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="textarea textarea-bordered w-full rounded-2xl h-28 focus:border-primary bg-base-100/50 shadow-inner" />
                        </div>
                      </div>
                      <button onClick={handleUpdateMeta} className="btn btn-primary btn-block rounded-2xl shadow-xl mt-2 font-bold">Salva Modifiche</button>
                    </div>
                  </div>
                ) : (
                  <div className="card bg-base-200 p-8 border border-base-content/5 md:col-span-2 shadow-sm rounded-3xl">
                     <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-3 text-primary">Descrizione del Gruppo</h4>
                     <p className="text-base opacity-80 leading-relaxed font-medium">{groupInfo?.description || 'Nessuna descrizione specificata.'}</p>
                  </div>
                )}

                <div className="card bg-base-200 border border-base-content/5 shadow-sm md:col-span-2 rounded-3xl">
                  <div className="card-body p-8 sm:p-10">
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-6 text-primary">Funzionalità Avanzate</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-6 bg-base-100/50 rounded-2xl border border-base-content/5 transition-all">
                        <div className="min-w-0">
                          <span className="text-sm font-bold block mb-0.5">Chiamate di Gruppo (P2P)</span>
                          <span className="text-[11px] opacity-50">Abilita voce e video WebRTC</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary toggle-lg"
                          disabled={!['moderator', 'administrator'].includes(myRole)}
                          checked={groupInfo?.features?.callsEnabled ?? true} 
                          onChange={(e) => handleToggleFeature('callsEnabled', e.target.checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-6 bg-base-100/50 rounded-2xl border border-base-content/5 transition-all">
                        <div>
                          <span className="text-sm font-bold block mb-0.5">Registro Attività</span>
                          <span className="text-[11px] opacity-50">Traccia ingressi e uscite</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary toggle-lg"
                          disabled={!['moderator', 'administrator'].includes(myRole)}
                          checked={groupInfo?.features?.activityEnabled ?? true} 
                          onChange={(e) => handleToggleFeature('activityEnabled', e.target.checked)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {myRole === 'administrator' && (
                  <div className="card bg-base-200 border border-base-content/5 shadow-sm md:col-span-2 rounded-3xl">
                    <div className="card-body p-8 sm:p-10">
                      <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-6 text-primary">Visibilità e Ricerca Pubblica</h4>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-6 bg-base-100/50 rounded-2xl border border-base-content/5 transition-all">
                          <div className="min-w-0">
                            <span className="text-sm font-bold block mb-0.5">Gruppo Pubblico</span>
                            <span className="text-[11px] opacity-50">Consenti l'accesso tramite nome pubblico</span>
                          </div>
                          <input 
                            type="checkbox" 
                            className="toggle toggle-primary toggle-lg"
                            checked={isPublic} 
                            onChange={(e) => handleTogglePublic(e.target.checked)}
                          />
                        </div>
                        
                        {isPublic && (
                          <div className="form-control animate-fadeIn">
                            <label className="label"><span className="label-text font-bold opacity-60 tracking-widest text-[10px] uppercase">Nome nel Registro Pubblico</span></label>
                            <div className="flex gap-2">
                              <input 
                                value={publicName} 
                                onChange={e => setPublicName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} 
                                className="input input-bordered grow rounded-2xl focus:border-primary bg-base-100/50 font-bold" 
                                placeholder="es. community-italia"
                              />
                              <button onClick={() => handleTogglePublic(true)} className="btn btn-primary rounded-2xl px-8 font-bold">Aggiorna</button>
                            </div>
                            <label className="label">
                              <span className="label-text-alt opacity-50 text-xs">Gli utenti potranno unirsi digitando questo nome nella sezione "Partecipa".</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'invites' && (
              <div className="card bg-base-200 border border-base-content/5 shadow-sm rounded-3xl overflow-hidden">
                <div className="card-body p-8 sm:p-12 text-center items-center">
                  <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-6 border border-primary/20 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-black text-primary mb-2">Condividi Conversazione</h3>
                  <p className="text-sm opacity-70 max-w-md mb-8 leading-relaxed">I link di invito consentono ad altri utenti di unirsi a questo spazio in modo sicuro e crittografato.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mb-8">
                    <button onClick={() => handleGenerateInvite('peer')} className="btn btn-primary rounded-2xl px-10 shadow-xl shadow-primary/20 font-bold">Crea Link Membro</button>
                    {['moderator', 'administrator'].includes(myRole || '') && (
                      <button onClick={() => handleGenerateInvite('moderator')} className="btn btn-neutral rounded-2xl px-10 border border-base-content/10 font-bold">Crea Link Moderatore</button>
                    )}
                  </div>

                  {inviteUrl && (
                    <div className="w-full max-w-lg animate-fadeIn transition-all">
                       <label className="label"><span className="label-text text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-1">Codice Pronto per la Condivisione</span></label>
                      <div className="join w-full shadow-xl border border-primary/20 p-1.5 bg-base-100/70 rounded-2xl">
                        <input readOnly value={inviteUrl} className="input input-sm join-item grow text-xs font-mono bg-transparent border-none focus:outline-none px-3" />
                        <button className="btn btn-primary btn-sm join-item px-6 rounded-xl font-bold" onClick={() => {
                          navigator.clipboard.writeText(inviteUrl);
                          showNotification("Link copiato negli appunti", "info");
                        }}>Copia</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-6">
                {reports.length === 0 ? (
                  <div className="card bg-base-200/40 backdrop-blur-xl p-16 text-center border border-base-content/10 rounded-3xl">
                    <p className="text-base opacity-40 italic font-medium">Nessuna segnalazione in attesa.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reports.map(r => (
                      <div key={r.id} className="card bg-base-200/60 backdrop-blur-xl rounded-3xl border border-base-content/10 overflow-hidden shadow-xl group transition-all hover:border-error/30">
                        <div className="card-body p-6 gap-4">
                          <div className="flex justify-between items-start">
                            <span className="badge badge-error badge-outline font-black text-[9px] px-3 h-6 uppercase tracking-widest">{r.type === 'content' ? 'Contenuto' : 'Utente'}</span>
                            <span className={`badge h-6 px-3 text-[9px] font-black tracking-widest ${r.status === 'pending' ? 'badge-primary' : 'badge-ghost opacity-40'}`}>{r.status.toUpperCase()}</span>
                          </div>
                          <div className="p-4 bg-error/5 rounded-2xl border border-error/10">
                            <p className="text-sm opacity-90 leading-relaxed italic">"{r.reason}"</p>
                          </div>
                          {r.status === 'pending' && (
                            <div className="flex gap-2 pt-2">
                              <button onClick={() => handleResolveReport(r.id, 'resolved')} className="btn btn-primary btn-sm grow rounded-xl shadow-md font-bold">Risolvi</button>
                              <button onClick={() => handleResolveReport(r.id, 'dismissed')} className="btn btn-ghost btn-sm grow rounded-xl border border-base-content/10 shadow-sm font-bold">Archivia</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

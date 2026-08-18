import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GroupService, CommunicationService } from 'linda-core';
import { requestGroupSecret } from "../utils/inboxSignal";

interface GroupCreationPageProps {
  groupService: GroupService;
  communicationService: CommunicationService | null;
  onCreated: (groupId: string) => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const GroupCreationPage: React.FC<GroupCreationPageProps> = ({
  groupService,
  communicationService,
  onCreated,
  showNotification,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupType, setGroupType] = useState<'group' | 'broadcast'>('group');
  const [inviteCode, setInviteCode] = useState("");
  const [joinByName, setJoinByName] = useState("");
  const [loading, setLoading] = useState(false);

  const seedGroupProfile = (groupId: string, groupName: string, avatar?: string) => {
    try {
      if (avatar) {
        localStorage.setItem(`linda_avatar_${groupId}`, avatar);
        window.dispatchEvent(new CustomEvent("linda_avatar_updated", {
          detail: { pub: groupId, avatar }
        }));
      }
      const cached = localStorage.getItem("linda_contact_profiles_v2");
      const profiles = cached ? JSON.parse(cached) : {};
      profiles[groupId] = {
        nickname: groupName,
        avatar: avatar || "",
      };
      localStorage.setItem("linda_contact_profiles_v2", JSON.stringify(profiles));
    } catch (e) {
      console.warn("Could not cache group profile:", e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification("Il nome del gruppo è obbligatorio", "error");
      return;
    }

    setLoading(true);
    try {
      const group = await groupService.createGroup(name.trim(), description.trim(), groupType);
      seedGroupProfile(group.id, group.name, group.avatar);
      showNotification(`Gruppo "${group.name}" creato con successo!`, "info");
      onCreated(group.id);
    } catch (err: any) {
      showNotification(err.message || "Impossibile creare il gruppo", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      showNotification("Il codice di invito è obbligatorio", "error");
      return;
    }

    setLoading(true);
    try {
      const groupInfo = await groupService.joinGroup(inviteCode.trim());
      seedGroupProfile(groupInfo.id, groupInfo.name, groupInfo.avatar);
      
      // Richiedi il segreto del gruppo in modo sicuro via P2P
      await requestGroupSecret(communicationService, groupInfo.adminPub, groupInfo.id);

      showNotification(`Sei entrato nel gruppo: ${groupInfo.name}`, "info");
      onCreated(groupInfo.id);
    } catch (err: any) {
      showNotification(err.message || "Impossibile entrare nel gruppo con questo codice", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinByName.trim()) {
      showNotification("Il nome pubblico è obbligatorio", "error");
      return;
    }

    setLoading(true);
    try {
      const groupInfo = await groupService.joinPublicGroup(joinByName.trim());
      seedGroupProfile(groupInfo.id, groupInfo.name, groupInfo.avatar);

      await requestGroupSecret(communicationService, groupInfo.adminPub, groupInfo.id);

      showNotification(`Sei entrato nel gruppo pubblico: ${groupInfo.name}`, "info");
      onCreated(groupInfo.id);
    } catch (err: any) {
      showNotification(err.message || "Gruppo pubblico non trovato o non accessibile", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 sm:p-12 lg:p-16 max-w-5xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto font-narrow">
      {/* Header */}
      <div className="flex items-center gap-6 relative z-10">
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 className="text-3xl font-black tracking-tight">Nuovo Gruppo</h1>
          <p className="text-xs opacity-60 font-semibold mt-0.5">Crea uno spazio crittografato o partecipa a un gruppo esistente</p>
        </div>
      </div>

      <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-3xl shadow-xl">
        <div className="p-6 sm:p-8 border-b border-base-content/5 flex items-center justify-center bg-base-300/40">
          <div className="tabs tabs-boxed bg-base-300/50 p-1.5 rounded-full gap-1">
            <button
              className={`tab h-10 px-8 rounded-full font-black tracking-tight transition-all text-xs ${activeTab === "create" ? "tab-active bg-primary text-primary-content shadow-lg shadow-primary/20" : "opacity-40 hover:opacity-80"}`}
              onClick={() => setActiveTab("create")}
            >
              Crea Gruppo
            </button>
            <button
              className={`tab h-10 px-8 rounded-full font-black tracking-tight transition-all text-xs ${activeTab === "join" ? "tab-active bg-primary text-primary-content shadow-lg shadow-primary/20" : "opacity-40 hover:opacity-80"}`}
              onClick={() => setActiveTab("join")}
            >
              Partecipa
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          {activeTab === "create" ? (
            <form onSubmit={handleCreate} className="space-y-8">
              <div className="form-control w-full">
                <label className="label py-0 mb-2">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Nome del Gruppo</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/10 bg-base-300/30 h-14 text-lg font-bold transition-all px-6"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="es. Community Dev Italia"
                  autoFocus
                />
              </div>

              <div className="form-control w-full">
                <label className="label py-0 mb-1.5">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Descrizione (Opzionale)</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-2xl h-28 focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/10 bg-base-300/30 text-sm p-4 leading-relaxed transition-all"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Di cosa tratta questo gruppo?"
                />
              </div>

              <div className="form-control w-full">
                <label className="label py-0 mb-1.5">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Tipo di Gruppo</span>
                </label>
                <div className="bg-base-300/30 p-1.5 rounded-2xl flex gap-1.5 border border-base-content/5">
                  <button
                    type="button"
                    className={`flex-1 py-3.5 rounded-xl transition-all font-black text-xs tracking-wide ${groupType === 'group' ? 'bg-primary text-primary-content shadow-lg shadow-primary/30' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setGroupType('group')}
                  >
                    Gruppo Aperto
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-3.5 rounded-xl transition-all font-black text-xs tracking-wide ${groupType === 'broadcast' ? 'bg-primary text-primary-content shadow-lg shadow-primary/30' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setGroupType('broadcast')}
                  >
                    Canale Broadcast
                  </button>
                </div>
                <label className="label mt-2 px-1">
                  <span className="label-text-alt opacity-50 font-medium text-xs">
                    {groupType === 'broadcast' ? "Solo amministratori e moderatori possono pubblicare messaggi. Ideale per annunci." : "Tutti i membri possono chattare e condividere file in sicurezza."}
                  </span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <button type="submit" className="btn btn-primary grow h-14 rounded-full shadow-2xl shadow-primary/40 font-black text-base tracking-tight transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Crea Gruppo"}
                </button>
                <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost h-14 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-12">
              <form onSubmit={handleJoinByName} className="space-y-6">
                <div className="form-control w-full">
                  <label className="label py-0 mb-1.5">
                    <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Partecipa con Nome Pubblico</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      className="input input-bordered grow rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/10 bg-base-300/30 h-14 text-sm font-bold transition-all px-5"
                      value={joinByName}
                      onChange={(e) => setJoinByName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="es. community-italia"
                    />
                    <button type="submit" className="btn btn-primary h-14 rounded-2xl px-8 shadow-xl shadow-primary/20 font-black" disabled={loading}>
                      {loading ? <span className="loading loading-spinner"></span> : "Partecipa"}
                    </button>
                  </div>
                </div>
              </form>

              <div className="divider opacity-30 text-[10px] font-black tracking-[0.3em] uppercase">Oppure usa un codice di invito</div>

              <form onSubmit={handleJoin} className="space-y-6">
                <div className="form-control w-full">
                  <label className="label py-0 mb-1.5">
                    <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Codice di Invito del Gruppo</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered w-full rounded-2xl h-36 focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/10 font-mono text-xs bg-base-300/30 p-4 leading-loose shadow-inner transition-all"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Incolla qui il codice o link di invito del gruppo..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button type="submit" className="btn btn-ghost grow h-14 rounded-full border border-base-content/10 font-black text-base tracking-tight transition-transform active:scale-95 hover:bg-base-content/10" disabled={loading}>
                    {loading ? <span className="loading loading-spinner"></span> : "Entra con Codice"}
                  </button>
                  <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost h-14 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                    Annulla
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

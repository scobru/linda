import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GroupService } from "../GroupService";

interface GroupCreationPageProps {
  groupService: GroupService;
  onCreated: (groupId: string) => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const GroupCreationPage: React.FC<GroupCreationPageProps> = ({
  groupService,
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification("Group name is required", "error");
      return;
    }

    setLoading(true);
    try {
      const group = await groupService.createGroup(name, description, groupType);
      showNotification(`Group "${group.name}" created!`, "info");
      onCreated(group.id);
      // Navigation is handled inside onCreated callback in App.tsx
    } catch (err: any) {
      showNotification(err.message || "Failed to create group", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      showNotification("Invite code is required", "error");
      return;
    }

    setLoading(true);
    try {
      const groupInfo = await groupService.joinGroup(inviteCode.trim());
      showNotification(`Joined group: ${groupInfo.name}`, "info");
      onCreated(groupInfo.id);
      // Navigation is handled inside onCreated callback in App.tsx
    } catch (err: any) {
      showNotification(err.message || "Failed to join group", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinByName.trim()) {
      showNotification("Public name is required", "error");
      return;
    }

    setLoading(true);
    try {
      const groupInfo = await groupService.joinPublicGroup(joinByName.trim());
      showNotification(`Joined public group: ${groupInfo.name}`, "info");
      onCreated(groupInfo.id);
    } catch (err: any) {
      showNotification(err.message || "Failed to join group", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 lg:p-12 max-w-2xl mx-auto space-y-8 sm:space-y-12 animate-fadeIn overflow-y-auto h-full">
      <header className="flex items-center gap-6 mb-12 relative z-10">
        <button 
          className="btn btn-ghost btn-circle btn-sm shadow-xl bg-base-200/80 backdrop-blur-md border border-white/10 active:scale-95 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-3xl sm:text-4xl font-black text-primary tracking-tight">New Conversation</h1>
      </header>

      <div className="card bg-base-200/40 backdrop-blur-xl border border-white/10 shadow-3xl rounded-[3rem] overflow-hidden">
        <div className="p-8 border-b border-white/5 flex items-center justify-center bg-base-300/40">
          <div className="tabs tabs-boxed bg-base-300/50 p-1.5 rounded-full gap-1">
            <button
              className={`tab h-10 px-8 rounded-full font-black tracking-tight transition-all text-sm ${activeTab === "create" ? "tab-active bg-primary text-primary-content shadow-lg shadow-primary/20" : "opacity-40 hover:opacity-80"}`}
              onClick={() => setActiveTab("create")}
            >
              Create
            </button>
            <button
              className={`tab h-10 px-8 rounded-full font-black tracking-tight transition-all text-sm ${activeTab === "join" ? "tab-active bg-primary text-primary-content shadow-lg shadow-primary/20" : "opacity-40 hover:opacity-80"}`}
              onClick={() => setActiveTab("join")}
            >
              Join
            </button>
          </div>
        </div>

        <div className="p-10">
          {activeTab === "create" ? (
            <form onSubmit={handleCreate} className="space-y-8">
              <div className="form-control w-full">
                <label className="label py-0 mb-2">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Group Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-3xl focus:ring-4 focus:ring-primary/10 focus:border-primary border-white/5 bg-base-300/30 h-14 text-lg font-bold transition-all px-6"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Shogun Community"
                  autoFocus
                />
              </div>

              <div className="form-control w-full">
                <label className="label py-0 mb-2">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Description (Optional)</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-[2rem] h-32 focus:ring-4 focus:ring-primary/10 focus:border-primary border-white/5 bg-base-300/30 text-sm p-6 leading-relaxed transition-all"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this group about?"
                />
              </div>

              <div className="form-control w-full">
                <label className="label py-0 mb-2">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Group Behavior</span>
                </label>
                <div className="bg-base-300/30 p-1.5 rounded-[2rem] flex gap-1.5 border border-white/5">
                  <button
                    type="button"
                    className={`flex-1 py-4 rounded-[1.5rem] transition-all font-black text-xs tracking-wide ${groupType === 'group' ? 'bg-primary text-primary-content shadow-xl shadow-primary/30 scale-[1.02]' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setGroupType('group')}
                  >
                    Standard Group
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-4 rounded-[1.5rem] transition-all font-black text-xs tracking-wide ${groupType === 'broadcast' ? 'bg-primary text-primary-content shadow-xl shadow-primary/30 scale-[1.02]' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setGroupType('broadcast')}
                  >
                    Broadcast Mode
                  </button>
                </div>
                <label className="label mt-2 px-2">
                  <span className="label-text-alt opacity-40 font-medium italic text-xs">
                    {groupType === 'broadcast' ? "Solo gli amministratori possono inviare messaggi. Ideale per canali news." : "Tutti possono chattare, chiamare e condividere file."}
                  </span>
                </label>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="submit" className="btn btn-primary grow h-16 rounded-full shadow-2xl shadow-primary/40 font-black text-xl tracking-tight transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Create Group"}
                </button>
                <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost h-16 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-12">
              <form onSubmit={handleJoinByName} className="space-y-6">
                <div className="form-control w-full">
                  <label className="label py-0 mb-2">
                    <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Join by Public Name</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input input-bordered grow rounded-3xl focus:ring-4 focus:ring-primary/10 focus:border-primary border-white/5 bg-base-300/30 h-14 text-lg font-bold transition-all px-6"
                      value={joinByName}
                      onChange={(e) => setJoinByName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="e.g. community-chat"
                    />
                    <button type="submit" className="btn btn-primary h-14 rounded-3xl px-8 shadow-xl shadow-primary/20 font-black" disabled={loading}>Join</button>
                  </div>
                </div>
              </form>

              <div className="divider opacity-30 text-[10px] font-black tracking-[0.3em] uppercase">Or Use Invite Code</div>

              <form onSubmit={handleJoin} className="space-y-8">
                <div className="form-control w-full">
                  <label className="label py-0 mb-2">
                    <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Group Invite Code</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered w-full rounded-[2rem] h-48 focus:ring-4 focus:ring-primary/10 focus:border-primary border-white/5 font-mono text-[10px] bg-base-300/50 p-6 leading-loose shadow-inner transition-all"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste the long base64 invite string here..."
                  />
                </div>

                <div className="flex gap-4 pt-6">
                  <button type="submit" className="btn btn-ghost grow h-16 rounded-full border border-white/10 font-black text-xl tracking-tight transition-transform active:scale-95 hover:bg-white/5" disabled={loading}>
                    {loading ? <span className="loading loading-spinner"></span> : "Join with Invite Code"}
                  </button>
                  <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost h-16 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                    Cancel
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

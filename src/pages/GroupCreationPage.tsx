import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GroupService } from "../services/GroupService";

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
  const [encryptionMode, setEncryptionMode] = useState<'symmetric' | 'tpre'>('symmetric');
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
      const group = await groupService.createGroup(name, description, groupType, encryptionMode);
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
    <div className="p-6 sm:p-12 lg:p-16 max-w-5xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto">
      <div className="flex items-center gap-6 relative z-10">
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate("/")}
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-3xl font-black tracking-tight">New Conversation</h1>
      </div>

      <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
        <div className="p-6 sm:p-8 border-b border-base-content/5 flex items-center justify-center bg-base-300/40">
          <div className="tabs tabs-boxed bg-base-300/50 p-1 rounded-full gap-1">
            <button
              className={`tab h-9 px-6 rounded-full font-black tracking-tight transition-all text-xs ${activeTab === "create" ? "tab-active bg-primary text-primary-content shadow-lg shadow-primary/20" : "opacity-40 hover:opacity-80"}`}
              onClick={() => setActiveTab("create")}
            >
              Create
            </button>
            <button
              className={`tab h-9 px-6 rounded-full font-black tracking-tight transition-all text-xs ${activeTab === "join" ? "tab-active bg-primary text-primary-content shadow-lg shadow-primary/20" : "opacity-40 hover:opacity-80"}`}
              onClick={() => setActiveTab("join")}
            >
              Join
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-10">
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
                <label className="label py-0 mb-1.5">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Description (Optional)</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-[1.5rem] h-28 focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/5 bg-base-300/30 text-sm p-4 leading-relaxed transition-all"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this group about?"
                />
              </div>

              <div className="form-control w-full">
                <label className="label py-0 mb-1.5">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Group Behavior</span>
                </label>
                <div className="bg-base-300/30 p-1.5 rounded-[1.5rem] flex gap-1.5 border border-base-content/5">
                  <button
                    type="button"
                    className={`flex-1 py-3 rounded-[1.25rem] transition-all font-black text-[10px] tracking-wide ${groupType === 'group' ? 'bg-primary text-primary-content shadow-xl shadow-primary/30' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setGroupType('group')}
                  >
                    Group
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-3 rounded-[1.25rem] transition-all font-black text-[10px] tracking-wide ${groupType === 'broadcast' ? 'bg-primary text-primary-content shadow-xl shadow-primary/30' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setGroupType('broadcast')}
                  >
                    Broadcast
                  </button>
                </div>
                <label className="label mt-1.5 px-1">
                  <span className="label-text-alt opacity-40 font-medium italic text-[10px]">
                    {groupType === 'broadcast' ? "Admins only can post. Ideal for news." : "Everyone can chat and share files."}
                  </span>
                </label>
              </div>

              <div className="form-control w-full mt-4">
                <label className="label py-0 mb-1.5">
                  <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Encryption Mode</span>
                </label>
                <div className="bg-base-300/30 p-1.5 rounded-[1.5rem] flex gap-1.5 border border-base-content/5">
                  <button
                    type="button"
                    className={`flex-1 py-3 rounded-[1.25rem] transition-all font-black text-[10px] tracking-wide ${encryptionMode === 'symmetric' ? 'bg-primary text-primary-content shadow-xl shadow-primary/30' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setEncryptionMode('symmetric')}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-3 rounded-[1.25rem] transition-all font-black text-[10px] tracking-wide ${encryptionMode === 'tpre' ? 'bg-secondary text-secondary-content shadow-xl shadow-secondary/30' : 'opacity-40 hover:opacity-100'}`}
                    onClick={() => setEncryptionMode('tpre')}
                  >
                    TPRE (Advanced)
                  </button>
                </div>
                <label className="label mt-1.5 px-1">
                  <span className="label-text-alt opacity-40 font-medium italic text-[10px]">
                    {encryptionMode === 'symmetric' ? "Faster, symmetric keys shared directly with members." : "Threshold Proxy Re-Encryption. Secure, decentralized proxy routing."}
                  </span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <button type="submit" className="btn btn-primary grow h-14 rounded-full shadow-2xl shadow-primary/40 font-black text-lg tracking-tight transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Create Group"}
                </button>
                <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost h-14 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-12">
              <form onSubmit={handleJoinByName} className="space-y-6">
                <div className="form-control w-full">
                  <label className="label py-0 mb-1.5">
                    <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Join by Public Name</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      className="input input-bordered grow rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/5 bg-base-300/30 h-13 text-sm font-bold transition-all px-5"
                      value={joinByName}
                      onChange={(e) => setJoinByName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="e.g. community-chat"
                    />
                    <button type="submit" className="btn btn-primary h-13 rounded-2xl px-8 shadow-xl shadow-primary/20 font-black" disabled={loading}>Join</button>
                  </div>
                </div>
              </form>

              <div className="divider opacity-30 text-[10px] font-black tracking-[0.3em] uppercase">Or Use Invite Code</div>

              <form onSubmit={handleJoin} className="space-y-6">
                <div className="form-control w-full">
                  <label className="label py-0 mb-1.5">
                    <span className="label-text font-black text-primary opacity-90 uppercase tracking-[0.2em] text-[10px]">Group Invite Code</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered w-full rounded-[1.5rem] h-40 focus:ring-4 focus:ring-primary/10 focus:border-primary border-base-content/5 font-mono text-[9px] bg-base-300/50 p-5 leading-loose shadow-inner transition-all"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste the long base64 invite string here..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button type="submit" className="btn btn-ghost grow h-14 rounded-full border border-base-content/10 font-black text-lg tracking-tight transition-transform active:scale-95 hover:bg-white/5" disabled={loading}>
                    {loading ? <span className="loading loading-spinner"></span> : "Join with Invite Code"}
                  </button>
                  <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost h-14 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
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

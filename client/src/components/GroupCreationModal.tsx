import React, { useState } from "react";
import { GroupService } from "../GroupService";

interface GroupCreationModalProps {
  groupService: GroupService;
  onClose: () => void;
  onCreated: (groupId: string) => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const GroupCreationModal: React.FC<GroupCreationModalProps> = ({
  groupService,
  onClose,
  onCreated,
  showNotification,
}) => {
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupType, setGroupType] = useState<'group' | 'broadcast'>('group');
  const [inviteCode, setInviteCode] = useState("");
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
      onClose();
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
      onClose();
    } catch (err: any) {
      showNotification(err.message || "Failed to join group", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-base-200/95 backdrop-blur-2xl w-full max-w-lg rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col transition-all">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-base-300/40">
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
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm bg-base-300/50 hover:bg-base-300">✕</button>
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
                    {groupType === 'broadcast' ? " seulement les admins possono inviare messaggi. Ideale per canali news." : "Tutti possono chattare, chiamare e condividere file."}
                  </span>
                </label>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="submit" className="btn btn-primary grow h-16 rounded-full shadow-2xl shadow-primary/40 font-black text-xl tracking-tight transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Create Group"}
                </button>
                <button type="button" onClick={onClose} className="btn btn-ghost h-16 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
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
                  autoFocus
                />
              </div>

              <div className="flex gap-4 pt-6">
                <button type="submit" className="btn btn-primary grow h-16 rounded-full shadow-2xl shadow-primary/40 font-black text-xl tracking-tight transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Join Group"}
                </button>
                <button type="button" onClick={onClose} className="btn btn-ghost h-16 rounded-full px-10 font-bold opacity-60 hover:opacity-100" disabled={loading}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

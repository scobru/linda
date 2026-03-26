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
      const group = await groupService.createGroup(name, description);
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
      <div className="bg-base-200 w-full max-w-lg rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-base-300/30">
          <div className="tabs tabs-boxed bg-transparent p-0">
            <button
              className={`tab font-bold transition-all px-6 ${activeTab === "create" ? "tab-active bg-primary text-primary-content" : "opacity-50"}`}
              onClick={() => setActiveTab("create")}
            >
              Create
            </button>
            <button
              className={`tab font-bold transition-all px-6 ${activeTab === "join" ? "tab-active bg-primary text-primary-content" : "opacity-50"}`}
              onClick={() => setActiveTab("join")}
            >
              Join
            </button>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">✕</button>
        </div>

        <div className="p-8">
          {activeTab === "create" ? (
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-bold opacity-50 uppercase tracking-widest text-xs">Group Name</span></label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-2xl focus:border-primary shadow-inner h-14 text-lg font-bold"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Shogun Community"
                  autoFocus
                />
              </div>

              <div className="form-control w-full">
                <label className="label"><span className="label-text font-bold opacity-50 uppercase tracking-widest text-xs">Description (Optional)</span></label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-2xl h-32 focus:border-primary shadow-inner text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this group about?"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn btn-primary grow h-14 rounded-2xl shadow-lg shadow-primary/20 font-black text-lg" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Create Group"}
                </button>
                <button type="button" onClick={onClose} className="btn btn-ghost h-14 rounded-2xl px-8" disabled={loading}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-6">
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-bold opacity-50 uppercase tracking-widest text-xs">Group Invite Code</span></label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-2xl h-48 focus:border-primary shadow-inner font-mono text-[10px] bg-base-300 leading-relaxed"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste the long base64 invite string here..."
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn btn-primary grow h-14 rounded-2xl shadow-lg shadow-primary/20 font-black text-lg" disabled={loading}>
                  {loading ? <span className="loading loading-spinner"></span> : "Join Group"}
                </button>
                <button type="button" onClick={onClose} className="btn btn-ghost h-14 rounded-2xl px-8" disabled={loading}>
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

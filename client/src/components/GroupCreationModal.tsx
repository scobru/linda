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
    <div className="profile-modal-overlay">
      <div className="profile-modal">
        <div className="profile-header">
          <div className="profile-tabs" style={{ background: "transparent", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", marginBottom: "20px" }}>
            <button
              className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
              onClick={() => setActiveTab("create")}
            >
              Create Group
            </button>
            <button
              className={`tab-btn ${activeTab === "join" ? "active" : ""}`}
              onClick={() => setActiveTab("join")}
            >
              Join Group
            </button>
          </div>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {activeTab === "create" ? (
          <form onSubmit={handleCreate} className="profile-section">
            <div style={{ marginBottom: "20px" }}>
              <label>Group Name</label>
              <input
                type="text"
                className="login-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Awesome Team"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label>Description (Optional)</label>
              <textarea
                className="login-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group about?"
                style={{ minHeight: "80px", resize: "vertical" }}
              />
            </div>

            <div className="login-actions">
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? "Creating..." : "Create Group"}
              </button>
              <button type="button" onClick={onClose} className="btn btn--secondary" disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="profile-section">
            <div style={{ marginBottom: "24px" }}>
              <label>Paste Group Invite Code</label>
              <textarea
                className="login-input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="The long base64 invite string..."
                style={{ minHeight: "120px", resize: "none", fontSize: "0.8rem", wordBreak: "break-all" }}
                autoFocus
              />
            </div>

            <div className="login-actions">
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? "Joining..." : "Join Group"}
              </button>
              <button type="button" onClick={onClose} className="btn btn--secondary" disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

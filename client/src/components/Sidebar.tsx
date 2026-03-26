import React from "react";
import { useNavigate } from "react-router-dom";
import { getInitial } from "../utils/ui";

interface SidebarProps {
  userNick: string;
  username: string;
  userAvatar: string | null;
  contacts: string[];
  recipient: string;
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
  recipient,
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
    <div className="sidebar">
      <div className="sidebar-user">
        <div
          className="sidebar-user-avatar-clickable"
          onClick={() => navigate("/profile")}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
        >
          <div className="sidebar-user-avatar">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt="avatar"
                style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              getInitial(userNick || username)
            )}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userNick || username}</div>
            <div className="sidebar-user-status">
              <span className="status-dot"></span> Online
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="settings-icon-btn"
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      <div className="sidebar-header">
        <span className="sidebar-title">Conversations</span>
        <div className="sidebar-header-actions">
          <button
            className="btn-icon"
            onClick={() => setShowCreateGroup(true)}
            title="Create New Group"
          >
            ＋
          </button>
        </div>
      </div>

      <div className="contact-list">
        {contacts.map((c) => (
          <div
            key={c}
            className={`contact-item ${recipient === c ? "contact-item--active" : ""}`}
            onClick={() => {
              setRecipient(c);
              requestNotifications();
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  overflow: "hidden",
                }}
              >
                <div className="contact-avatar">
                  {contactProfiles[c]?.avatar ? (
                    <img
                      src={contactProfiles[c].avatar}
                      alt={c}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    getInitial(contactProfiles[c]?.nickname || c)
                  )}
                </div>
                <span className="contact-name" style={{ flex: 1 }}>
                  {contactProfiles[c]?.nickname ||
                    (c.length > 15 ? `${c.slice(0, 8)}...${c.slice(-4)}` : c)}
                </span>
                {unreadCounts[c] > 0 ? (
                  <span
                    className="unread-badge"
                    style={{
                      background: "var(--accent-primary)",
                      color: "var(--text-inverse)",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      padding: "2px 8px",
                      borderRadius: "12px",
                    }}
                  >
                    {unreadCounts[c]}
                  </span>
                ) : null}
              </div>
              <button
                onClick={(e) => handleDeleteContact(c, e)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.4)",
                  cursor: "pointer",
                  padding: "4px",
                  marginLeft: "8px",
                  fontSize: "12px",
                }}
                title="Delete contact"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-contact-wrapper">
        <input
          className="add-contact-input"
          placeholder="＋ Add contact or join group..."
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
                // Check if it's a group invite (base64 and contains group info)
                if (name.length > 50 && !name.startsWith("@")) {
                  try {
                    const groupInfo = await groupService.joinGroup(name);
                    setRecipient(groupInfo.id);
                    showNotification(`Joined group: ${groupInfo.name}`, "info");
                    return;
                  } catch (ge) {
                    // Not a group invite or join failed, continue as normal contact
                  }
                }

                let pubKey = name;
                if (name.length < 30 || name.startsWith("@")) {
                  pubKey = await signalService.getPubKeyFromUsername(name);
                }

                saveContact(pubKey);
                setRecipient(pubKey);
              } catch (err: any) {
                console.error(err);
                showNotification(`User not found: ${name}`, "error");
              } finally {
                target.disabled = false;
                target.placeholder = origPlaceholder;
                target.focus();
              }
            }
          }}
        />
      </div>
    </div>
  );
};

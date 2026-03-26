import React, { useState, useEffect } from "react";
import { GroupService } from "../GroupService";
import type { GroupMember, GroupInfo, Role } from "../GroupService";
import { DataBase } from "shogun-core";

interface GroupSettingsProps {
  groupId: string;
  groupService: GroupService;
  db: DataBase;
  onClose: () => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const GroupSettings: React.FC<GroupSettingsProps> = ({
  groupId,
  groupService,
  db,
  onClose,
  showNotification,
}) => {
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

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const info = await (db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      setGroupInfo(info);
      setEditName(info.name);
      setEditDesc(info.description || "");
      
      const m = await groupService.getMembers(groupId);
      setMembers(m);

      const pub = db.getUserPub();
      if (pub) {
        const role = await groupService.getMemberRole(groupId, pub);
        setMyRole(role);
      }

      // Load mutes for all members
      const mutesData: Record<string, boolean> = {};
      for (const member of m) {
        mutesData[member.pub] = await groupService.isMuted(groupId, member.pub);
      }
      setMutes(mutesData);

      // Load reports if moderator+
      try {
        const r = await groupService.getReports(groupId);
        setReports(r);
      } catch (e) {
        // Not authorized or none
      }

    } catch (e) {
      showNotification("Failed to load group data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMeta = async () => {
    try {
      await groupService.updateGroupMeta(groupId, { name: editName, description: editDesc });
      showNotification("Group updated", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to update group", "error");
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        
        try {
          await groupService.updateGroupMeta(groupId, { avatar: dataUrl });
          showNotification("Avatar updated!", "info");
          loadData();
        } catch (e: any) {
          showNotification("Failed to save avatar", "error");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMute = async (memberPub: string, muted: boolean) => {
    try {
      await groupService.muteMember(groupId, memberPub, muted);
      showNotification(muted ? "Member muted" : "Member unmuted", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to update mute status", "error");
    }
  };

  const handleResolveReport = async (reportId: string, status: "resolved" | "dismissed") => {
    try {
      await groupService.resolveReport(groupId, reportId, status);
      showNotification(`Report ${status}`, "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to resolve report", "error");
    }
  };

  const handleUpdateRole = async (memberPub: string, newRole: Role) => {
    try {
      await groupService.updateMemberRole(groupId, memberPub, newRole);
      showNotification(`Role updated to ${newRole}`, "info");
      loadData(); // Refresh
    } catch (e: any) {
      showNotification(e.message || "Failed to update role", "error");
    }
  };

  const handleKick = async (memberPub: string) => {
    if (!window.confirm("Are you sure you want to remove this member?")) return;
    try {
      await groupService.kickMember(groupId, memberPub);
      showNotification("Member removed", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to kick member", "error");
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("Are you sure you want to leave this group?")) return;
    try {
      await groupService.leaveGroup(groupId);
      showNotification("You left the group", "info");
      onClose();
    } catch (e: any) {
      showNotification(e.message || "Failed to leave group", "error");
    }
  };

  const handleGenerateInvite = async (role: Role, singleUse: boolean = false) => {
    try {
      const invite = await groupService.generateInvite(groupId, role, singleUse);
      setInviteUrl(invite);
      navigator.clipboard.writeText(invite);
      showNotification("Invite link copied to clipboard", "info");
    } catch (e: any) {
      showNotification(e.message || "Failed to generate invite", "error");
    }
  };

  const handleToggleFeature = async (feature: 'callsEnabled' | 'activityEnabled', enabled: boolean) => {
    try {
      await groupService.toggleFeature(groupId, feature, enabled);
      showNotification("Feature updated", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to toggle feature", "error");
    }
  };

  if (loading) return <div className="group-settings-modal">Loading...</div>;

  return (
    <div className="profile-modal-overlay">
      <div className="profile-modal group-settings-modal">
        <div className="profile-header">
          <h2>Group Options</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {!myRole ? (
          <div className="group-tab-content">
             <p style={{ textAlign: 'center', margin: '40px 0' }}>You are no longer a member of this group.</p>
             <div style={{ display: 'flex', justifyContent: 'center' }}>
               <button onClick={onClose} className="btn btn--secondary">Close</button>
             </div>
          </div>
        ) : (
          <>
            <div className="group-tabs">
              <button className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Members</button>
              <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Group Settings</button>
              <button className={`tab-btn ${activeTab === 'invites' ? 'active' : ''}`} onClick={() => setActiveTab('invites')}>Invites</button>
              {['moderator', 'administrator'].includes(myRole) && (
                <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports ({reports.filter(r => r.status === 'pending').length})</button>
              )}
            </div>

            <div className="group-tab-content">
              {activeTab === 'members' && (
                <div className="member-list">
                  {members.map(m => (
                    <div key={m.pub} className="member-item">
                      <div className="member-info">
                        <span className="member-pub">{m.pub.slice(0, 8)}...</span>
                        <span className={`role-badge role-${m.role}`}>{m.role}</span>
                        {mutes[m.pub] && <span className="role-badge" style={{ background: '#666' }}>MUTED</span>}
                      </div>
                      <div className="member-actions">
                        {/* Administrator actions */}
                        {myRole === 'administrator' && m.role !== 'administrator' && (
                          <>
                            <button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="btn-small">Make Moderator</button>
                            <button onClick={() => handleMute(m.pub, !mutes[m.pub])} className="btn-small">{mutes[m.pub] ? 'Unmute' : 'Mute'}</button>
                            <button onClick={() => handleKick(m.pub)} className="btn-small btn-danger">Kick</button>
                          </>
                        )}
                        {/* Moderator actions */}
                        {myRole === 'moderator' && m.role === 'peer' && (
                          <>
                            <button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="btn-small">Make Moderator</button>
                            <button onClick={() => handleMute(m.pub, !mutes[m.pub])} className="btn-small">{mutes[m.pub] ? 'Unmute' : 'Mute'}</button>
                            <button onClick={() => handleKick(m.pub)} className="btn-small btn-danger">Kick</button>
                          </>
                        )}
                        {/* Administrator Downgrade moderator */}
                        {myRole === 'administrator' && m.role === 'moderator' && (
                           <button onClick={() => handleUpdateRole(m.pub, 'peer')} className="btn-small">Downgrade to Peer</button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <button onClick={handleLeaveGroup} className="btn btn--secondary" style={{ width: '100%', color: 'var(--color-danger)' }}>
                       Leave Group
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="settings-list">
                  {['moderator', 'administrator'].includes(myRole) ? (
                    <div className="meta-edit">
                      <div className="profile-section">
                        <label>Group Avatar</label>
                        <div className="avatar-preview-wrap">
                          <div className="avatar-preview">
                            {groupInfo?.avatar ? <img src={groupInfo.avatar} alt="Avatar" /> : <span>G</span>}
                          </div>
                          <input type="file" accept="image/*" onChange={handleAvatarSelect} />
                        </div>
                      </div>

                      <div className="profile-section">
                        <label>Group Name</label>
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="login-input" />
                      </div>

                      <div className="profile-section">
                        <label>Group Description</label>
                        <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="login-input" style={{ height: '60px' }} />
                      </div>

                      <button onClick={handleUpdateMeta} className="btn btn--primary" style={{ width: '100%', marginBottom: '20px' }}>Save Group Info</button>
                    </div>
                  ) : (
                    <div className="meta-view">
                       <p><strong>Description:</strong> {groupInfo?.description || 'No description provided.'}</p>
                    </div>
                  )}

                  <div className="feature-toggles" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                    <div className="setting-item">
                      <label>Enable Group Calls</label>
                      <input 
                        type="checkbox" 
                        disabled={!['moderator', 'administrator'].includes(myRole)}
                        checked={groupInfo?.features?.callsEnabled ?? true} 
                        onChange={(e) => handleToggleFeature('callsEnabled', e.target.checked)}
                      />
                    </div>
                    <div className="setting-item">
                      <label>Enable Room Activity Events</label>
                      <input 
                        type="checkbox" 
                        disabled={!['moderator', 'administrator'].includes(myRole)}
                        checked={groupInfo?.features?.activityEnabled ?? true} 
                        onChange={(e) => handleToggleFeature('activityEnabled', e.target.checked)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'invites' && (
                <div className="invite-generator">
                  <h3>Create Invite</h3>
                  <div className="invite-actions">
                    <button onClick={() => handleGenerateInvite('peer')} className="btn btn--primary">Invite Peer</button>
                    {['moderator', 'administrator'].includes(myRole || '') && (
                      <button onClick={() => handleGenerateInvite('moderator')} className="btn btn--secondary">Invite Moderator</button>
                    )}
                    {myRole === 'administrator' && (
                      <button onClick={() => handleGenerateInvite('administrator', true)} className="btn btn--secondary">Invite Administrator (Single Use)</button>
                    )}
                  </div>
                  {inviteUrl && (
                    <div className="invite-result">
                      <p>Share this link:</p>
                      <textarea readOnly value={inviteUrl} className="login-input" />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="reports-list">
                  {reports.length === 0 ? (
                    <p>No reports currently available.</p>
                  ) : (
                    reports.map(r => (
                      <div key={r.id} className="report-item" style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span className="role-badge">{r.type}</span>
                          <span className="role-badge" style={{ background: r.status === 'pending' ? 'var(--color-primary)' : '#666' }}>{r.status}</span>
                        </div>
                        <p style={{ fontSize: '0.9em', margin: '5px 0' }}><strong>Reason:</strong> {r.reason}</p>
                        <p style={{ fontSize: '0.8em', color: '#999' }}>From: {r.reportedBy.slice(0, 10)}...</p>
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => handleResolveReport(r.id, 'resolved')} className="btn-small">Resolve</button>
                            <button onClick={() => handleResolveReport(r.id, 'dismissed')} className="btn-small btn--secondary">Dismiss</button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

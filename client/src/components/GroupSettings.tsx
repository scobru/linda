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

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const info = await (db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      setGroupInfo(info);
      
      const m = await groupService.getMembers(groupId);
      setMembers(m);

      const pub = db.getUserPub();
      if (pub) {
        const role = await groupService.getMemberRole(groupId, pub);
        setMyRole(role);
      }
    } catch (e) {
      showNotification("Failed to load group data", "error");
    } finally {
      setLoading(false);
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

        <div className="group-tabs">
          <button className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Members</button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Permissions</button>
          <button className={`tab-btn ${activeTab === 'invites' ? 'active' : ''}`} onClick={() => setActiveTab('invites')}>Invites</button>
          <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports</button>
        </div>

        <div className="group-tab-content">
          {activeTab === 'members' && (
            <div className="member-list">
              {members.map(m => (
                <div key={m.pub} className="member-item">
                  <div className="member-info">
                    <span className="member-pub">{m.pub.slice(0, 8)}...</span>
                    <span className={`role-badge role-${m.role}`}>{m.role}</span>
                  </div>
                  <div className="member-actions">
                    {myRole === 'administrator' && m.role !== 'administrator' && (
                      <>
                        <button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="btn-small">Make Moderator</button>
                        <button onClick={() => handleKick(m.pub)} className="btn-small btn-danger">Kick</button>
                      </>
                    )}
                    {myRole === 'moderator' && m.role === 'peer' && (
                      <>
                        <button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="btn-small">Make Moderator</button>
                        <button onClick={() => handleKick(m.pub)} className="btn-small btn-danger">Kick</button>
                      </>
                    )}
                    {myRole === 'administrator' && m.role === 'moderator' && (
                       <button onClick={() => handleUpdateRole(m.pub, 'peer')} className="btn-small">Downgrade to Peer</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="settings-list">
              <div className="setting-item">
                <label>Enable Group Calls</label>
                <input 
                  type="checkbox" 
                  checked={groupInfo?.features?.callsEnabled ?? true} 
                  onChange={(e) => handleToggleFeature('callsEnabled', e.target.checked)}
                />
              </div>
              <div className="setting-item">
                <label>Enable Room Activity Events</label>
                <input 
                  type="checkbox" 
                  checked={groupInfo?.features?.activityEnabled ?? true} 
                  onChange={(e) => handleToggleFeature('activityEnabled', e.target.checked)}
                />
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
               <p>No reports currently available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

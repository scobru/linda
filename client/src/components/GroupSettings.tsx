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

    } catch (e) {
      showNotification("Failed to load group data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!groupId || !db.gun || !myRole || !['moderator', 'administrator'].includes(myRole)) return;
    
    const reportsRef = db.gun.get(`signal_rooms/${groupId}/reports`);
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
        // Gun .off() is not altid reliable/available on .map(), but we can try
        try { (reportsRef as any).off(); } catch(e) {}
    };
  }, [groupId, myRole, db.gun]);

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

  if (loading) return (
    <div className="flex items-center justify-center p-20">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-base-200 w-full max-w-2xl rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-base-300/30">
          <h2 className="text-xl font-black text-primary tracking-tight">Group Options</h2>
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">✕</button>
        </div>

        {!myRole ? (
          <div className="p-12 text-center space-y-6">
             <div className="p-6 bg-error/10 rounded-2xl border border-error/20 inline-block">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-error mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
               </svg>
             </div>
             <p className="text-lg opacity-60">You are no longer a member of this group.</p>
             <button onClick={onClose} className="btn btn-primary px-8">Close Window</button>
          </div>
        ) : (
          <>
            <div className="tabs tabs-bordered w-full bg-base-300/20 px-6">
              <button 
                className={`tab tab-lg h-16 transition-all font-bold ${activeTab === 'members' ? 'tab-active text-primary' : 'opacity-50'}`} 
                onClick={() => setActiveTab('members')}
              >
                Members
              </button>
              <button 
                className={`tab tab-lg h-16 transition-all font-bold ${activeTab === 'settings' ? 'tab-active text-primary' : 'opacity-50'}`} 
                onClick={() => setActiveTab('settings')}
              >
                Settings
              </button>
              <button 
                className={`tab tab-lg h-16 transition-all font-bold ${activeTab === 'invites' ? 'tab-active text-primary' : 'opacity-50'}`} 
                onClick={() => setActiveTab('invites')}
              >
                Invites
              </button>
              {['moderator', 'administrator'].includes(myRole) && (
                <button 
                  className={`tab tab-lg h-16 transition-all font-bold ${activeTab === 'reports' ? 'tab-active text-primary' : 'opacity-50'}`} 
                  onClick={() => setActiveTab('reports')}
                >
                  Reports {reports.filter(r => r.status === 'pending').length > 0 && <span className="badge badge-error badge-xs ml-2"></span>}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'members' && (
                <div className="space-y-3">
                  {members.map(m => (
                    <div key={m.pub} className="flex items-center justify-between p-4 bg-base-300/30 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="avatar placeholder">
                          <div className="bg-primary/20 text-primary rounded-xl w-10">
                            <span className="text-xs font-black">{m.pub.slice(0, 1).toUpperCase()}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-bold flex items-center gap-2">
                            {m.pub.slice(0, 8)}...
                            <span className={`badge badge-xs font-black uppercase tracking-tighter ${m.role === 'administrator' ? 'badge-primary' : m.role === 'moderator' ? 'badge-neutral' : 'badge-outline opacity-30'}`}>
                              {m.role}
                            </span>
                          </div>
                          {mutes[m.pub] && <span className="badge badge-ghost badge-xs opacity-50">MUTED</span>}
                        </div>
                      </div>
                      
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {myRole === 'administrator' && m.role !== 'administrator' && (
                          <>
                            <button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="btn btn-ghost btn-xs">Promote</button>
                            <button onClick={() => handleMute(m.pub, !mutes[m.pub])} className="btn btn-ghost btn-xs">{mutes[m.pub] ? 'Unmute' : 'Mute'}</button>
                            <button onClick={() => handleKick(m.pub)} className="btn btn-ghost btn-xs text-error">Kick</button>
                          </>
                        )}
                        {myRole === 'moderator' && m.role === 'peer' && (
                          <>
                            <button onClick={() => handleMute(m.pub, !mutes[m.pub])} className="btn btn-ghost btn-xs">{mutes[m.pub] ? 'Unmute' : 'Mute'}</button>
                            <button onClick={() => handleKick(m.pub)} className="btn btn-ghost btn-xs text-error">Kick</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-6 mt-6 border-t border-white/5">
                    <button onClick={handleLeaveGroup} className="btn btn-error btn-outline btn-block rounded-2xl">
                       Leave Group
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-8">
                  {['moderator', 'administrator'].includes(myRole) ? (
                    <>
                      <div className="flex items-center gap-6">
                        <div className="avatar">
                          <div className="w-20 rounded-2xl ring ring-primary ring-offset-base-100 ring-offset-2">
                            {groupInfo?.avatar ? <img src={groupInfo.avatar} alt="Avatar" /> : <div className="bg-base-300 flex items-center justify-center text-2xl font-black h-full">G</div>}
                          </div>
                        </div>
                        <label className="btn btn-primary btn-sm rounded-xl">
                          Change Avatar
                          <input type="file" accept="image/*" onChange={handleAvatarSelect} hidden />
                        </label>
                      </div>

                      <div className="form-control w-full">
                        <label className="label"><span className="label-text font-bold opacity-50 uppercase tracking-widest text-xs">Group Name</span></label>
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="input input-bordered w-full rounded-2xl focus:border-primary shadow-inner" />
                      </div>

                      <div className="form-control w-full">
                        <label className="label"><span className="label-text font-bold opacity-50 uppercase tracking-widest text-xs">Group Description</span></label>
                        <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="textarea textarea-bordered w-full rounded-2xl h-24 focus:border-primary shadow-inner" />
                      </div>

                      <button onClick={handleUpdateMeta} className="btn btn-primary btn-block rounded-2xl shadow-lg">Save Group Info</button>
                    </>
                  ) : (
                    <div className="card bg-base-300/30 rounded-2xl p-6 border border-white/5">
                       <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-3">Description</h4>
                       <p className="opacity-80">{groupInfo?.description || 'No description provided.'}</p>
                    </div>
                  )}

                  <div className="pt-6 border-t border-white/5 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-4">Permissions</h4>
                    <div className="flex items-center justify-between p-4 bg-base-300/20 rounded-2xl">
                      <span className="text-sm font-bold">Allow Group Calls</span>
                      <input 
                        type="checkbox" 
                        className="toggle toggle-primary"
                        disabled={!['moderator', 'administrator'].includes(myRole)}
                        checked={groupInfo?.features?.callsEnabled ?? true} 
                        onChange={(e) => handleToggleFeature('callsEnabled', e.target.checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-base-300/20 rounded-2xl">
                      <span className="text-sm font-bold">Room Activity Log</span>
                      <input 
                        type="checkbox" 
                        className="toggle toggle-primary"
                        disabled={!['moderator', 'administrator'].includes(myRole)}
                        checked={groupInfo?.features?.activityEnabled ?? true} 
                        onChange={(e) => handleToggleFeature('activityEnabled', e.target.checked)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'invites' && (
                <div className="space-y-6">
                  <div className="p-6 bg-primary/5 rounded-[2rem] border border-primary/20 text-center space-y-4">
                    <h3 className="text-lg font-black text-primary">Generate Invite</h3>
                    <p className="text-xs opacity-60 max-w-xs mx-auto">Invite others to join this conversation. Links can be revoked by admins.</p>
                    
                    <div className="flex flex-wrap justify-center gap-2 pt-4">
                      <button onClick={() => handleGenerateInvite('peer')} className="btn btn-primary rounded-xl px-6">Invite Peer</button>
                      {['moderator', 'administrator'].includes(myRole || '') && (
                        <button onClick={() => handleGenerateInvite('moderator')} className="btn btn-neutral rounded-xl px-6 border-white/5">Invite Moderator</button>
                      )}
                      {myRole === 'administrator' && (
                        <button onClick={() => handleGenerateInvite('administrator', true)} className="btn btn-outline btn-sm rounded-xl px-6 opacity-60">Admin Link (Single Use)</button>
                      )}
                    </div>
                  </div>

                  {inviteUrl && (
                    <div className="space-y-3 animate-fadeIn">
                       <label className="label"><span className="label-text font-bold opacity-50 uppercase tracking-widest text-xs">Your Link</span></label>
                      <div className="join w-full shadow-lg">
                        <input readOnly value={inviteUrl} className="input input-bordered join-item grow text-xs font-mono bg-base-300 shadow-inner" />
                        <button className="btn btn-primary join-item px-6" onClick={() => {
                          navigator.clipboard.writeText(inviteUrl);
                          showNotification("Link copied", "info");
                        }}>Copy</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-4">
                  {reports.length === 0 ? (
                    <div className="text-center py-20 opacity-30 italic">No pending reports</div>
                  ) : (
                    reports.map(r => (
                      <div key={r.id} className="card bg-base-300/50 rounded-2xl border border-white/5 overflow-hidden">
                        <div className="p-5 space-y-4">
                          <div className="flex justify-between items-start">
                            <span className="badge badge-error badge-outline font-black text-[10px] uppercase tracking-widest">{r.type}</span>
                            <span className={`badge badge-sm font-bold ${r.status === 'pending' ? 'badge-primary' : 'badge-ghost opacity-50'}`}>{r.status.toUpperCase()}</span>
                          </div>
                          <p className="text-sm border-l-2 border-primary/30 pl-3 py-1 bg-primary/5 rounded-r-lg">{r.reason}</p>
                          <div className="text-[10px] opacity-40 font-mono">ID: {r.id}</div>
                          
                          {r.status === 'pending' && (
                            <div className="flex gap-2 pt-2 border-t border-white/5">
                              <button onClick={() => handleResolveReport(r.id, 'resolved')} className="btn btn-primary btn-sm grow rounded-xl">Resolve</button>
                              <button onClick={() => handleResolveReport(r.id, 'dismissed')} className="btn btn-ghost btn-sm grow rounded-xl">Dismiss</button>
                            </div>
                          )}
                        </div>
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

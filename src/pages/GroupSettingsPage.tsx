import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GroupService, type GroupMember, type GroupInfo, type Role } from "../services/GroupService";
import { DataBase } from "../zen/db";
import { UserAvatar } from "../components/UserAvatar";

interface GroupSettingsPageProps {
  groupService: GroupService;
  db: DataBase;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const GroupSettingsPage: React.FC<GroupSettingsPageProps> = ({
  groupService,
  db,
  showNotification,
}) => {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
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
  const [isPublic, setIsPublic] = useState(false);
  const [publicName, setPublicName] = useState("");

  const loadData = async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const info = await (db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
      setGroupInfo(info);
      setEditName(info.name);
      setEditDesc(info.description || "");
      setIsPublic(!!info.isPublic);
      setPublicName(info.publicName || info.name.toLowerCase().replace(/\s+/g, '-'));
      
      const m = await groupService.getMembers(groupId);
      setMembers(m);

      const pub = db.getUserPub();
      if (pub) {
        const role = await groupService.getMemberRole(groupId, pub);
        setMyRole(role);
      }

      // Load mutes for all members in parallel
      const muteEntries = await Promise.all(
        m.map(async (member) => [
          member.pub,
          await groupService.isMuted(groupId, member.pub),
        ] as [string, boolean])
      );
      setMutes(Object.fromEntries(muteEntries));

    } catch (e) {
      showNotification("Failed to load group data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (groupId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !db.zen || !myRole || !['moderator', 'administrator'].includes(myRole)) return;
    
    const reportsRef = db.zen.get(`linda_rooms/${groupId}/reports`);
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
        try { (reportsRef as any).off(); } catch(e) {}
    };
  }, [groupId, myRole, db.zen]);

  const handleUpdateMeta = async () => {
    if (!groupId) return;
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
    if (!file || !groupId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 100;
        const MAX_HEIGHT = 100;
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        
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
    if (!groupId) return;
    try {
      await groupService.muteMember(groupId, memberPub, muted);
      showNotification(muted ? "Member muted" : "Member unmuted", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to update mute status", "error");
    }
  };

  const handleResolveReport = async (reportId: string, status: "resolved" | "dismissed") => {
    if (!groupId) return;
    try {
      await groupService.resolveReport(groupId, reportId, status);
      showNotification(`Report ${status}`, "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to resolve report", "error");
    }
  };

  const handleUpdateRole = async (memberPub: string, newRole: Role) => {
    if (!groupId) return;
    try {
      await groupService.updateMemberRole(groupId, memberPub, newRole);
      showNotification(`Role updated to ${newRole}`, "info");
      loadData(); 
    } catch (e: any) {
      showNotification(e.message || "Failed to update role", "error");
    }
  };

  const handleKick = async (memberPub: string) => {
    if (!groupId || !window.confirm("Are you sure you want to remove this member?")) return;
    try {
      await groupService.kickMember(groupId, memberPub);
      showNotification("Member removed", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to kick member", "error");
    }
  };

  const handleLeaveGroup = async () => {
    if (!groupId) return;

    try {
      await groupService.leaveGroup(groupId, false);
      showNotification("You left the group", "info");
      navigate("/");
    } catch (e: any) {
      if (e.message === "LAST_ADMIN_WARNING") {
        const confirmForce = window.confirm(
          "⚠️ WARNING: You are the ONLY administrator of this group.\n\n" +
          "If you leave now, the group will remain without any administrators and you will lose admin privileges permanently (even if you rejoin).\n\n" +
          "Do you still want to leave the group?"
        );
        if (confirmForce) {
          try {
            await groupService.leaveGroup(groupId, true);
            showNotification("You left the group", "info");
            navigate("/");
          } catch (err: any) {
            showNotification(err.message || "Failed to leave group", "error");
          }
        }
      } else {
        showNotification(e.message || "Failed to leave group", "error");
      }
    }
  };

  const handleGenerateInvite = async (role: Role, singleUse: boolean = false) => {
    if (!groupId) return;
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
    if (!groupId) return;
    try {
      await groupService.toggleFeature(groupId, feature, enabled);
      showNotification("Feature updated", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to toggle feature", "error");
    }
  };

  const handleTogglePublic = async (enabled: boolean) => {
    if (!groupId) return;
    try {
      if (enabled && !publicName.trim()) {
        showNotification("Public name is required to make group public", "error");
        return;
      }
      await groupService.setGroupPublic(groupId, enabled, publicName);
      showNotification(enabled ? "Group is now public" : "Group is now private", "info");
      loadData();
    } catch (e: any) {
      showNotification(e.message || "Failed to update public status", "error");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );

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
        <h1 className="text-3xl font-black tracking-tight">Group Management</h1>
      </div>

      {!myRole ? (
        <div className="card bg-base-200/40 backdrop-blur-xl p-12 text-center border border-white/10 shadow-2xl rounded-[3rem]">
           <div className="p-6 bg-error/10 rounded-2xl border border-error/20 inline-block mb-6">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
             </svg>
           </div>
           <p className="text-xl font-bold opacity-60 mb-8">You are no longer a member of this group.</p>
           <button onClick={() => navigate("/")} className="btn btn-primary px-12 rounded-2xl">Return to Home</button>
        </div>
      ) : (
        <div className="flex flex-col gap-8 sm:gap-12">
          {/* Group Overview Card */}
          <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-14 bg-base-200 p-10 rounded-2xl border border-base-content/5 shadow-sm relative overflow-hidden group">
            <div className="relative z-10 shrink-0">
              <UserAvatar 
                pub={groupId || ""} 
                db={db} 
                isGroup={true} 
                className="w-28 sm:w-36 rounded-[2rem] ring-4 ring-primary/20 ring-offset-base-100 ring-offset-4 shadow-2xl" 
              />
              {['moderator', 'administrator'].includes(myRole) && (
                <label className="btn btn-primary btn-circle btn-sm absolute bottom-1 right-1 shadow-2xl border-2 border-base-200 cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
                </label>
              )}
            </div>
            <div className="text-center sm:text-left z-10 flex-1 min-w-0">
              <h2 className="text-2xl sm:text-3xl font-black mb-2 truncate">{groupInfo?.name}</h2>
              <div className="badge badge-primary badge-outline font-black tracking-widest text-[10px] h-7 px-4 bg-primary/5 uppercase">{myRole}</div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs tabs-boxed w-full max-w-2xl mx-auto p-1 bg-base-300 border border-base-content/5 rounded-2xl">
            <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'members' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('members')}>Members</button>
            <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'settings' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('settings')}>Settings</button>
            <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'invites' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('invites')}>Invites</button>
            {['moderator', 'administrator'].includes(myRole) && (
              <button className={`tab grow gap-2 transition-all rounded-xl font-bold ${activeTab === 'reports' ? 'tab-active bg-primary text-primary-content' : 'opacity-60'}`} onClick={() => setActiveTab('reports')}>
                Reports {reports.filter(r => r.status === 'pending').length > 0 && <span className="badge badge-error badge-xs"></span>}
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === 'members' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {members.map(m => (
                  <div key={m.pub} className="flex items-center justify-between p-4 bg-base-200 rounded-2xl border border-base-content/5 group hover:border-primary/20 transition-all shadow-sm">
                    <div className="flex items-center gap-4">
                      <UserAvatar 
                        pub={m.pub} 
                        db={db} 
                        className="w-12 h-12" 
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold flex items-center gap-2">
                          <span className="truncate">{m.pub.slice(0, 12)}...</span>
                          <span className={`badge badge-xs font-black uppercase tracking-tightest ${m.role === 'administrator' ? 'badge-primary' : m.role === 'moderator' ? 'badge-neutral' : 'badge-ghost opacity-30'}`}>
                            {m.role}
                          </span>
                        </div>
                        {mutes[m.pub] && <span className="text-[10px] font-black tracking-widest text-error opacity-60 uppercase">Muted</span>}
                      </div>
                    </div>
                    
                    <div className="flex gap-1">
                      {myRole === 'administrator' && m.role !== 'administrator' && (
                        <div className="dropdown dropdown-end">
                          <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                          </div>
                          <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-2xl bg-base-300 rounded-xl w-40 border border-white/5">
                            {m.role !== 'moderator' && (
                              <li><button onClick={() => handleUpdateRole(m.pub, 'moderator')} className="text-sm font-bold">Promote to Mod</button></li>
                            )}
                            <li><button onClick={() => handleUpdateRole(m.pub, 'administrator')} className="text-sm font-bold text-primary">Promote to Admin</button></li>
                            <li><button onClick={() => handleMute(m.pub, !mutes[m.pub])} className="text-sm font-bold">{mutes[m.pub] ? 'Unmute' : 'Mute'}</button></li>
                            <li><button onClick={() => handleKick(m.pub)} className="text-sm font-bold text-error">Kick</button></li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                <div className="md:col-span-2 pt-8">
                  <button onClick={handleLeaveGroup} className="btn btn-error btn-outline btn-block rounded-2xl border-error/20 hover:bg-error hover:text-error-content transition-all shadow-xl">
                     Leave Group
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {['moderator', 'administrator'].includes(myRole) ? (
                  <div className="card bg-base-200 border border-base-content/5 overflow-hidden md:col-span-2 rounded-2xl">
                    <div className="card-body p-8 sm:p-10 gap-8">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-40 text-primary">General Info</h3>
                      <div className="grid grid-cols-1 gap-6">
                        <div className="form-control">
                          <label className="label"><span className="label-text font-bold opacity-50 tracking-widest text-[10px] uppercase">Group Name</span></label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} className="input input-bordered w-full rounded-2xl focus:border-primary bg-base-100/50 shadow-inner" />
                        </div>
                        <div className="form-control">
                          <label className="label"><span className="label-text font-bold opacity-50 tracking-widest text-[10px] uppercase">Description</span></label>
                          <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="textarea textarea-bordered w-full rounded-2xl h-32 focus:border-primary bg-base-100/50 shadow-inner" />
                        </div>
                      </div>
                      <button onClick={handleUpdateMeta} className="btn btn-primary btn-block rounded-2xl shadow-xl mt-4">Save Configuration</button>
                    </div>
                  </div>
                ) : (
                  <div className="card bg-base-200 p-10 border border-base-content/5 md:col-span-2 shadow-sm rounded-2xl">
                     <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4 text-primary">Group Description</h4>
                     <p className="text-lg opacity-80 leading-relaxed font-medium">{groupInfo?.description || 'No description provided.'}</p>
                  </div>
                )}

                <div className="card bg-base-200/40 backdrop-blur-xl border border-white/10 shadow-2xl md:col-span-2 rounded-[2.5rem]">
                  <div className="card-body p-8 sm:p-10">
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-8 text-primary">Advanced Features</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-6 bg-base-100/30 rounded-[2rem] border border-white/5 transition-all hover:border-primary/20">
                        <div className="min-w-0">
                          <span className="text-sm font-bold block mb-1">Group Calls</span>
                          <span className="text-[10px] opacity-40 uppercase tracking-tight">Enable P2P voice</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary toggle-lg"
                          disabled={!['moderator', 'administrator'].includes(myRole)}
                          checked={groupInfo?.features?.callsEnabled ?? true} 
                          onChange={(e) => handleToggleFeature('callsEnabled', e.target.checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-6 bg-base-100/30 rounded-[2rem] border border-white/5 transition-all hover:border-primary/20">
                        <div>
                          <span className="text-sm font-bold block mb-1">Activity Log</span>
                          <span className="text-[10px] opacity-40 uppercase tracking-tight">Track join/leave</span>
                        </div>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary toggle-lg"
                          disabled={!['moderator', 'administrator'].includes(myRole)}
                          checked={groupInfo?.features?.activityEnabled ?? true} 
                          onChange={(e) => handleToggleFeature('activityEnabled', e.target.checked)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {myRole === 'administrator' && (
                  <div className="card bg-base-200 border border-base-content/5 shadow-sm md:col-span-2 rounded-2xl">
                    <div className="card-body p-8 sm:p-10">
                      <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-8 text-primary">Public Discovery</h4>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-6 bg-base-100/30 rounded-[2rem] border border-white/5 transition-all hover:border-primary/20">
                          <div className="min-w-0">
                            <span className="text-sm font-bold block mb-1">Public Group</span>
                            <span className="text-[10px] opacity-40 uppercase tracking-tight">Allow joining by name</span>
                          </div>
                          <input 
                            type="checkbox" 
                            className="toggle toggle-primary toggle-lg"
                            checked={isPublic} 
                            onChange={(e) => handleTogglePublic(e.target.checked)}
                          />
                        </div>
                        
                        {isPublic && (
                          <div className="form-control animate-fadeIn">
                            <label className="label"><span className="label-text font-bold opacity-50 tracking-widest text-[10px] uppercase">Registry Name</span></label>
                            <div className="flex gap-2">
                              <input 
                                value={publicName} 
                                onChange={e => setPublicName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} 
                                className="input input-bordered grow rounded-2xl focus:border-primary bg-base-100/50" 
                                placeholder="e.g. community-chat"
                              />
                              <button onClick={() => handleTogglePublic(true)} className="btn btn-primary rounded-2xl px-8">Update Name</button>
                            </div>
                            <label className="label">
                              <span className="label-text-alt opacity-40 italic">Users can join by typing this name in the "Join" section.</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'invites' && (
              <div className="card bg-base-200 border border-base-content/5 shadow-sm rounded-2xl overflow-hidden">
                <div className="card-body p-10 sm:p-12 text-center items-center">
                  <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mb-8 border border-primary/20 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-black text-primary mb-4">Share Conversation</h3>
                  <p className="text-sm opacity-60 max-w-sm mb-10 leading-relaxed">Generated invite links allow others to securely join this space. You can revoke these links at any time.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mb-10">
                    <button onClick={() => handleGenerateInvite('peer')} className="btn btn-primary rounded-2xl px-10 shadow-xl shadow-primary/20">Create Member Link</button>
                    {['moderator', 'administrator'].includes(myRole || '') && (
                      <button onClick={() => handleGenerateInvite('moderator')} className="btn btn-neutral rounded-2xl px-10 border border-white/10">Create Mod Link</button>
                    )}
                  </div>

                  {inviteUrl && (
                    <div className="w-full max-w-md animate-fadeIn transition-all">
                       <label className="label"><span className="label-text text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2">Ready to ship</span></label>
                      <div className="join w-full shadow-2xl border border-primary/20 p-1 bg-base-100/50 rounded-2xl">
                        <input readOnly value={inviteUrl} className="input input-sm join-item grow text-xs font-mono bg-transparent border-none focus:outline-none" />
                        <button className="btn btn-primary btn-sm join-item px-8 rounded-xl font-black" onClick={() => {
                          navigator.clipboard.writeText(inviteUrl);
                          showNotification("Link copied", "info");
                        }}>Copy Link</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-6">
                {reports.length === 0 ? (
                  <div className="card bg-base-200/40 backdrop-blur-xl p-20 text-center border border-white/10 rounded-[2.5rem]">
                    <p className="text-lg opacity-30 italic font-medium">Clean slate. No pending reports.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reports.map(r => (
                      <div key={r.id} className="card bg-base-200/40 backdrop-blur-xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl group transition-all hover:border-error/30">
                        <div className="card-body p-8 gap-6">
                          <div className="flex justify-between items-start">
                            <span className="badge badge-error badge-outline font-black text-[9px] px-3 h-6 uppercase tracking-widest">{r.type}</span>
                            <span className={`badge h-6 px-3 text-[9px] font-black tracking-widest ${r.status === 'pending' ? 'badge-primary' : 'badge-ghost opacity-30'}`}>{r.status.toUpperCase()}</span>
                          </div>
                          <div className="p-5 bg-error/5 rounded-2xl border border-error/10">
                            <p className="text-sm opacity-90 leading-relaxed italic">"{r.reason}"</p>
                          </div>
                          {r.status === 'pending' && (
                            <div className="flex gap-2 pt-2">
                              <button onClick={() => handleResolveReport(r.id, 'resolved')} className="btn btn-primary btn-sm grow rounded-xl shadow-lg">Take Action</button>
                              <button onClick={() => handleResolveReport(r.id, 'dismissed')} className="btn btn-ghost btn-sm grow rounded-xl border border-white/5 shadow-sm">Dismiss</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

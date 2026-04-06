import { DataBase } from "shogun-core";
import { generateSecureRandomString, generateUUID } from "./utils/crypto.ts";

export type Role = "peer" | "moderator" | "administrator";

export interface GroupMember {
  pub: string;
  role: Role;
  joinedAt: number;
}

export interface GroupInfo {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  adminPub: string;
  secret: string; // Symmetric key for message encryption
  type?: 'group' | 'broadcast';
  features?: {
    callsEnabled: boolean;
    activityEnabled: boolean;
  };
  isPublic?: boolean;
  publicName?: string;
}

export interface GroupInvite {
  g: string; // Group ID
  s: string; // Group Secret
  r: Role;   // Invited Role
  t: number; // Expiry timestamp
  u?: boolean; // Single-use flag
  id?: string; // Invite ID for single-use tracking
}

export class GroupService {
  private db: DataBase;

  constructor(db: DataBase) {
    this.db = db;
  }

  private generateUUID(): string {
    return generateUUID();
  }

  /**
   * Create a new encrypted group
   */
  async createGroup(name: string, description: string, type: 'group' | 'broadcast' = 'group'): Promise<GroupInfo> {
    const groupId = this.generateUUID();
    const groupSecret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const myPub = this.db.getUserPub();

    if (!myPub) throw new Error("Not logged in");

    const groupInfo: GroupInfo = {
      id: groupId,
      name,
      description,
      adminPub: myPub,
      secret: groupSecret,
      type,
      features: {
        callsEnabled: true,
        activityEnabled: true,
      }
    };

    // Store group metadata
    try {
      await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, groupInfo);

      // Initial member (creator is Admin)
      await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}`, {
        role: "administrator",
        joinedAt: Date.now(),
      } as GroupMember);
    } catch (e) {
      console.error(`[GroupService] Failed to initialize group ${groupId} nodes:`, e);
      throw new Error("Failed to initialize group nodes on GunDB");
    }

    return groupInfo;
  }

  /**
   * Permission check helper
   */
  async getMemberRole(groupId: string, memberPub: string): Promise<Role | null> {
    try {
      // 1. Try to get role from members node
      const member = await (this.db.Get as any)(`signal_rooms/${groupId}/members/${memberPub}`) as GroupMember;
      if (member && member.role) return member.role;

      // 2. Fallback to meta adminPub if the member node is missing or role is not set
      const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      if (meta && meta.adminPub === memberPub) {
        return "administrator";
      }
    } catch (e: any) {
      if (e && e.err !== 'notfound') {
        console.error(`[GroupService] Error getting role for ${memberPub} in ${groupId}:`, e);
      }
    }
    return null;
  }

  /**
   * Listening to mute status
   */
  onMuteStatusChange(groupId: string, memberPub: string, callback: (isMuted: boolean) => void): () => void {
    const path = `signal_rooms/${groupId}/mutes/${memberPub}`;
    const evId = `mute_${groupId}_${memberPub}_${generateSecureRandomString(7)}`;
    
    (this.db.On as any)(path, (data: any) => {
      callback(!!data);
    }, evId);

    return () => {
      (this.db.Off as any)(evId);
    };
  }

  async canPerform(groupId: string, action: string): Promise<boolean> {
    const myPub = this.db.getUserPub();
    if (!myPub) return false;

    // Check if muted for send_message action
    if (action === "send_message") {
      try {
        const isMuted = await this.isMuted(groupId, myPub);
        if (isMuted) return false;
      } catch (e) {
        // If the check fails (e.g. timeout), it's safer to re-run the check or assume restricted if we suspect a mute
        // But for now, let's keep it lenient if it's the first load.
      }
    }

    const role = await this.getMemberRole(groupId, myPub);
    
    // Broadcast check for send_message
    if (action === "send_message") {
      try {
        const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
        if (meta && meta.type === "broadcast") {
          // In a broadcast group, only admins and moderators can talk
          if (!role || (role !== "administrator" && role !== "moderator")) {
            return false;
          }
        }
      } catch (e: any) {
        // If meta retrieval fails, and it's a group UUID, better to be safe
        const isGroup = groupId.length === 36 && groupId.includes("-");
        if (isGroup && (e?.err === 'notfound' || e?.err === 'timeout')) {
           // If it's a known group but meta is missing, treat as restricted if no role
           if (!role) return false;
        }
      }
    }

    if (!role) {
      // Final fallback for the creator if they are not yet in the members list
      try {
        const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
        if (meta && meta.adminPub === myPub) {
          return true; // Admins can perform everything
        }
      } catch (e) {}
      return false;
    }

    const permissions: Record<Role, string[]> = {
      peer: ["send_message", "start_call", "delete_own_message", "invite_peer", "report"],
      moderator: [
        "send_message", "start_call", "delete_own_message", "invite_peer", "report",
        "update_meta", "pin_message", "delete_any_message", "mute_peer", "toggle_features", "invite_moderator", "action_reports", "kick_user"
      ],
      administrator: [
        "send_message", "start_call", "delete_own_message", "invite_peer", "report",
        "update_meta", "pin_message", "delete_any_message", "mute_peer", "toggle_features", "invite_moderator", "action_reports", "kick_user",
        "promote_moderator", "invite_admin"
      ]
    };

    return permissions[role].includes(action);
  }

  /**
   * Muting
   */
  async muteMember(groupId: string, memberPub: string, muted: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "mute_peer"))) throw new Error("Unauthorized");
    await (this.db.Put as any)(`signal_rooms/${groupId}/mutes/${memberPub}`, muted ? Date.now() : null);
  }

  async isMuted(groupId: string, memberPub: string): Promise<boolean> {
    try {
      const muted = await (this.db.Get as any)(`signal_rooms/${groupId}/mutes/${memberPub}`);
      return !!muted;
    } catch (e) {
      return false;
    }
  }

  /**
   * Update Group Metadata
   */
  async updateGroupMeta(groupId: string, updates: Partial<Pick<GroupInfo, 'name' | 'description' | 'avatar'>>): Promise<void> {
    if (!(await this.canPerform(groupId, "update_meta"))) throw new Error("Unauthorized");
    try {
      const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, { ...meta, ...updates });
    } catch (e) {
      console.error('[GroupService] Failed to update group meta:', e);
      throw new Error("Failed to update group metadata on GunDB");
    }
  }

  /**
   * Toggle Group Features
   */
  async toggleFeature(groupId: string, feature: 'callsEnabled' | 'activityEnabled', enabled: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "toggle_features"))) throw new Error("Unauthorized");
    try {
      const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      const features = { ...meta.features, [feature]: enabled };
      await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, { ...meta, features });
    } catch (e) {
      console.error('[GroupService] Failed to toggle feature:', e);
      throw new Error("Failed to update group features on GunDB");
    }
  }

  /**
   * Role Management
   */
  async updateMemberRole(groupId: string, memberPub: string, newRole: Role): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    const myRole = await this.getMemberRole(groupId, myPub);
    if (!myRole) throw new Error("Not a member");

    // Specific logic for self-downgrade
    if (myPub === memberPub) {
       if (newRole === 'administrator') throw new Error("Cannot promote self to admin");
       if (myRole === 'administrator') {
         // Count admins
         const members = await this.getMembers(groupId);
         const adminCount = members.filter(m => m.role === 'administrator').length;
         if (adminCount <= 1) throw new Error("Cannot downgrade the last administrator");
       }
       await (this.db.Put as any)(`signal_rooms/${groupId}/members/${memberPub}/role`, newRole);
       return;
    }

    if (newRole === "administrator" && !(await this.canPerform(groupId, "promote_admin_manual"))) {
      // Admin invites are handled separately. Manual promotion to admin might be restricted or allowed only by other admins.
      // Based on Keet, Admin role is assigned via dedicated invite.
      throw new Error("Administrators can only be added via specific invite links");
    }

    if (newRole === "moderator" && !(await this.canPerform(groupId, "promote_moderator"))) throw new Error("Unauthorized");
    if (newRole === "peer" && !(await this.canPerform(groupId, "kick_user"))) throw new Error("Unauthorized");

    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${memberPub}/role`, newRole);
  }

  async getMembers(groupId: string): Promise<GroupMember[]> {
    try {
      const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      const membersNode = await (this.db.Get as any)(`signal_rooms/${groupId}/members`) as Record<string, any>;
    
    const members: GroupMember[] = [];
    if (membersNode) {
      Object.entries(membersNode)
        .filter(([pub, data]) => pub !== "_" && pub !== ">" && data !== null)
        .forEach(([pub, data]) => {
          if (data && typeof data === "object") {
            members.push({
              pub,
              role: data.role || (meta && meta.adminPub === pub ? "administrator" : "peer"),
              joinedAt: data.joinedAt || Date.now(),
            });
          } else {
            // Handle pointers or corrupted data
            members.push({
              pub,
              role: (meta && meta.adminPub === pub ? "administrator" : "peer"),
              joinedAt: Date.now(),
            });
          }
        });
    }

    // Ensure the creator/admin is always in the list even if members node sync is delayed
    if (meta && meta.adminPub && !members.find((m) => m.pub === (meta as any).adminPub)) {
      members.push({
        pub: meta.adminPub,
        role: "administrator",
        joinedAt: Date.now(),
      });
    }

    return members;
  } catch (e) {
    console.warn(`[GroupService] Failed to get members for ${groupId}:`, e);
    return [];
  }
}

  /**
   * Kick Member
   */
  async kickMember(groupId: string, memberPub: string): Promise<void> {
    if (!(await this.canPerform(groupId, "kick_user"))) throw new Error("Unauthorized");
    
    // 1. Remove from group members node
    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${memberPub}`, null);
    
    // 2. Also try to remove the group from the target user's contact list 
    // This works if the admin has permission to write to that specific node or if it's a shared pointer
    await (this.db.Put as any)(`signal_v3_contacts_${memberPub}/${groupId}`, null);
  }

  /**
   * Leave Group
   */
  async leaveGroup(groupId: string): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    // 1. Remove from group members node
    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}`, null);

    // 2. Remove from own contact list
    await (this.db.Put as any)(`signal_v3_contacts_${myPub}/${groupId}`, null);
  }

  /**
   * Message Management
   */
  async pinMessage(groupId: string, messageId: string, pinned: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "pin_message"))) throw new Error("Unauthorized");
    await (this.db.Put as any)(`signal_rooms/${groupId}/pins/${messageId}`, pinned ? Date.now() : null);
  }

  async deleteMessage(groupId: string, messageId: string, senderPub: string): Promise<void> {
    const myPub = this.db.getUserPub();
    const isOwn = myPub === senderPub;
    
    if (isOwn) {
      if (!(await this.canPerform(groupId, "delete_own_message"))) throw new Error("Unauthorized");
    } else {
      if (!(await this.canPerform(groupId, "delete_any_message"))) throw new Error("Unauthorized");
    }

    await (this.db.Put as any)(`signal_rooms/${groupId}/deleted_messages/${messageId}`, {
      deletedAt: Date.now(),
      deletedBy: myPub
    });
  }

  /**
   * Reporting
   */
  async reportContent(groupId: string, contentId: string, reason: string): Promise<void> {
    if (!(await this.canPerform(groupId, "report"))) throw new Error("Unauthorized");
    const reportId = this.generateUUID();
    await (this.db.Put as any)(`signal_rooms/${groupId}/reports/${reportId}`, {
      type: "content",
      contentId,
      reason,
      reportedBy: this.db.getUserPub(),
      timestamp: Date.now(),
      status: "pending"
    });
  }

  async reportUser(groupId: string, targetPub: string, reason: string): Promise<void> {
    if (!(await this.canPerform(groupId, "report"))) throw new Error("Unauthorized");
    const reportId = this.generateUUID();
    await (this.db.Put as any)(`signal_rooms/${groupId}/reports/${reportId}`, {
      type: "user",
      targetPub,
      reason,
      reportedBy: this.db.getUserPub(),
      timestamp: Date.now(),
      status: "pending"
    });
  }

  async getReports(groupId: string): Promise<any[]> {
    if (!(await this.canPerform(groupId, "action_reports"))) throw new Error("Unauthorized");
    const reportsNode = await (this.db.Get as any)(`signal_rooms/${groupId}/reports`) as Record<string, any>;
    if (!reportsNode) return [];
    return Object.entries(reportsNode)
      .filter(([id, data]) => id !== "_" && id !== ">" && data !== null)
      .map(([id, data]) => ({ id, ...data }));
  }

  async resolveReport(groupId: string, reportId: string, status: "resolved" | "dismissed"): Promise<void> {
    if (!(await this.canPerform(groupId, "action_reports"))) throw new Error("Unauthorized");
    const report = await (this.db.Get as any)(`signal_rooms/${groupId}/reports/${reportId}`);
    if (!report) throw new Error("Report not found");
    await (this.db.Put as any)(`signal_rooms/${groupId}/reports/${reportId}/status`, status);
  }

  /**
   * Enhanced Invite System
   */
  async generateInvite(groupId: string, role: Role = "peer", singleUse: boolean = false): Promise<string> {
    const action = role === "administrator" ? "invite_admin" : (role === "moderator" ? "invite_moderator" : "invite_peer");
    if (!(await this.canPerform(groupId, action))) throw new Error("Unauthorized");

    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group not found");

    const inviteId = this.generateUUID();
    const invite: GroupInvite = {
      g: groupId,
      s: meta.secret,
      r: role,
      t: Date.now() + (role === 'administrator' ? 1 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000), // Admins expire faster
      u: singleUse || role === 'administrator',
      id: inviteId
    };

    if (invite.u) {
      await (this.db.Put as any)(`signal_rooms/${groupId}/active_invites/${inviteId}`, { status: 'active' });
    }

    return btoa(JSON.stringify(invite));
  }

  /**
   * Join Group
   */
  async joinGroup(inviteB64: string): Promise<GroupInfo> {
    const invite = JSON.parse(atob(inviteB64)) as GroupInvite;
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    if (Date.now() > invite.t) throw new Error("Invite expired");

    if (invite.u && invite.id) {
       const inviteStatus = await (this.db.Get as any)(`signal_rooms/${invite.g}/active_invites/${invite.id}`) as any;
       if (!inviteStatus || inviteStatus.status !== 'active') throw new Error("Invite already used or invalid");
       await (this.db.Put as any)(`signal_rooms/${invite.g}/active_invites/${invite.id}`, { status: 'used', usedBy: myPub });
    }

    const meta = await (this.db.Get as any)(`signal_rooms/${invite.g}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group meta not found");

    await (this.db.Put as any)(`signal_rooms/${invite.g}/members/${myPub}`, {
      role: invite.r,
      joinedAt: Date.now()
    } as GroupMember);

    return meta;
  }

  /**
   * Crypto helpers (re-using existing ones)
   */
  async encryptGroupMessage(groupSecret: string, plaintext: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const keyData = Uint8Array.from(atob(groupSecret), c => c.charCodeAt(0));
    const key = await window.crypto.subtle.importKey(
      "raw", keyData, "AES-GCM", false, ["encrypt"]
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, data
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decryptGroupMessage(groupSecret: string, boxed: string): Promise<string> {
    const combined = Uint8Array.from(atob(boxed), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const keyData = Uint8Array.from(atob(groupSecret), c => c.charCodeAt(0));
    const key = await window.crypto.subtle.importKey(
      "raw", keyData, "AES-GCM", false, ["decrypt"]
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, key, ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Public Group Management
   */
  async setGroupPublic(groupId: string, isPublic: boolean, publicName?: string): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");
    
    const role = await this.getMemberRole(groupId, myPub);
    if (role !== "administrator") throw new Error("Only administrators can toggle public status");

    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group meta not found");

    const oldPublicName = meta.publicName;
    const normalizedName = publicName?.trim().toLowerCase().replace(/\s+/g, '-');

    // 1. Update metadata
    const updatedMeta: GroupInfo = { 
      ...meta, 
      isPublic, 
      publicName: normalizedName || undefined 
    };
    await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, updatedMeta);

    // 2. Manage registry
    if (isPublic && normalizedName) {
      await (this.db.Put as any)(`signal_public_registry/${normalizedName}`, {
        g: groupId,
        s: meta.secret,
        n: meta.name
      });
      console.log(`[GroupService] Published group ${groupId} as "${normalizedName}"`);
    }

    // 3. Cleanup old name if it changed or was disabled
    if (oldPublicName && (oldPublicName !== normalizedName || !isPublic)) {
      await (this.db.Put as any)(`signal_public_registry/${oldPublicName}`, null);
    }
  }

  async getPublicGroup(name: string): Promise<{ g: string; s: string; n: string } | null> {
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-');
    try {
      const data = await (this.db.Get as any)(`signal_public_registry/${normalizedName}`);
      if (data && data.g && data.s) {
        return data;
      }
    } catch (e) {}
    return null;
  }

  async joinPublicGroup(name: string): Promise<GroupInfo> {
    const publicGroup = await this.getPublicGroup(name);
    if (!publicGroup) throw new Error(`Public group "${name}" not found.`);

    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    // Re-use logic from JoinGroup but with info from registry
    await (this.db.Put as any)(`signal_rooms/${publicGroup.g}/members/${myPub}`, {
      role: "peer" as Role,
      joinedAt: Date.now()
    } as GroupMember);

    const meta = await (this.db.Get as any)(`signal_rooms/${publicGroup.g}/meta`) as GroupInfo;
    return meta;
  }
}

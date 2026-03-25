import { DataBase } from "shogun-core";

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
  features?: {
    callsEnabled: boolean;
    activityEnabled: boolean;
  };
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

  /**
   * Create a new encrypted group
   */
  async createGroup(name: string, description: string): Promise<GroupInfo> {
    const groupId = crypto.randomUUID();
    const groupSecret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const myPub = this.db.getUserPub();

    if (!myPub) throw new Error("Not logged in");

    const groupInfo: GroupInfo = {
      id: groupId,
      name,
      description,
      adminPub: myPub,
      secret: groupSecret,
      features: {
        callsEnabled: true,
        activityEnabled: true,
      }
    };

    // Store group metadata
    await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, groupInfo);

    // Initial member (creator is Admin)
    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}`, {
      role: "administrator",
      joinedAt: Date.now(),
    } as GroupMember);

    return groupInfo;
  }

  /**
   * Permission check helper
   */
  async getMemberRole(groupId: string, memberPub: string): Promise<Role | null> {
    const member = await (this.db.Get as any)(`signal_rooms/${groupId}/members/${memberPub}`) as GroupMember;
    return member ? member.role : null;
  }

  async canPerform(groupId: string, action: string): Promise<boolean> {
    const myPub = this.db.getUserPub();
    if (!myPub) return false;
    const role = await this.getMemberRole(groupId, myPub);
    if (!role) return false;

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
   * Update Group Metadata
   */
  async updateGroupMeta(groupId: string, updates: Partial<Pick<GroupInfo, 'name' | 'description' | 'avatar'>>): Promise<void> {
    if (!(await this.canPerform(groupId, "update_meta"))) throw new Error("Unauthorized");
    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, { ...meta, ...updates });
  }

  /**
   * Toggle Group Features
   */
  async toggleFeature(groupId: string, feature: 'callsEnabled' | 'activityEnabled', enabled: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "toggle_features"))) throw new Error("Unauthorized");
    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    const features = { ...meta.features, [feature]: enabled };
    await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, { ...meta, features });
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
    const membersNode = await (this.db.Get as any)(`signal_rooms/${groupId}/members`) as Record<string, any>;
    if (!membersNode) return [];
    return Object.entries(membersNode)
      .filter(([pub]) => pub !== '_')
      .map(([pub, data]) => ({
        pub,
        role: data.role,
        joinedAt: data.joinedAt
      }));
  }

  /**
   * Kick Member
   */
  async kickMember(groupId: string, memberPub: string): Promise<void> {
    if (!(await this.canPerform(groupId, "kick_user"))) throw new Error("Unauthorized");
    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${memberPub}`, null);
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
    const reportId = crypto.randomUUID();
    await (this.db.Put as any)(`signal_rooms/${groupId}/reports/${reportId}`, {
      contentId,
      reason,
      reportedBy: this.db.getUserPub(),
      timestamp: Date.now()
    });
  }

  /**
   * Enhanced Invite System
   */
  async generateInvite(groupId: string, role: Role = "peer", singleUse: boolean = false): Promise<string> {
    const action = role === "administrator" ? "invite_admin" : (role === "moderator" ? "invite_moderator" : "invite_peer");
    if (!(await this.canPerform(groupId, action))) throw new Error("Unauthorized");

    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group not found");

    const inviteId = crypto.randomUUID();
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
}

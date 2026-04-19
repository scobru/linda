import { DataBase } from "shogun-core";
import { ThresholdService } from "./ThresholdService";
import * as umbral from "@nucypher/umbral-pre";

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
  secret: string; // Symmetric key for message encryption (Legacy)
  encryptionMode?: 'symmetric' | 'tpre';
  communityPK?: string; // Serialized Umbral PublicKey
  threshold?: number;
  totalShares?: number;
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
  private p2pGroupCache: Map<string, string> = new Map(); // Cache contactPub -> p2pGroupId

  constructor(db: DataBase) {
    this.db = db;
  }

  private async getThresholdService(): Promise<ThresholdService> {
    const pair = (this.db.gun.user() as any)?._?.sea;
    if (!pair || !pair.priv) throw new Error("Not logged in or missing SEA keys");
    return await ThresholdService.init(pair.priv);
  }

  private generateUUID(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Create a new encrypted group
   */
  async createGroup(name: string, description: string, type: 'group' | 'broadcast' = 'group', encryptionMode: 'symmetric' | 'tpre' = 'symmetric'): Promise<GroupInfo> {
    const groupId = this.generateUUID();
    let groupSecret = "";
    let communityPK: string | undefined = undefined;
    
    const myPub = this.db.getUserPub();

    if (!myPub) throw new Error("Not logged in");

    if (encryptionMode === 'symmetric') {
      groupSecret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    } else {
      const ts = await this.getThresholdService();
      const { groupSK, groupPK } = ts.createGroup();
      communityPK = ts.serializePublicKey(groupPK);
      
      // We must encrypt the groupSK so the admin can always recover it.
      // We'll use Gun SEA to encrypt the groupSK using the admin's personal SEA pair.
      const pair = (this.db.gun.user() as any)?._?.sea;
      const skString = ts.serializeSecretKey(groupSK);
      // In SEA, doing a simple encryption with own pair:
      const encryptedSK = await SEA.encrypt(skString, pair);
      
      // Store the encrypted SK
      await (this.db.Put as any)(`signal_rooms/${groupId}/admin_sk_encrypted`, encryptedSK);
      
      // Generate initial kfrag for relay
      const myUmbralPK = ts.getPublicKey();
      const threshold = 2;
      const totalShares = 3;
      const kfrags = ts.generateKFragsForMember(groupSK, myUmbralPK, threshold, totalShares);
      
      if (kfrags.length > 0) {
         // Store relay's kfrag in group meta or directly
         const relayKFrag = ts.serializeKFrag(kfrags[0]);
         await (this.db.Put as any)(`signal_rooms/${groupId}/relay_kfrags/${myPub}`, relayKFrag);
      }
      
      // Optionally store the second kfrag somewhere if needed, 
      // but admin actually holds the groupSK, so they don't *strict*ly need a kfrag,
      // but it's good practice so they can act as a proxy or decrypt via proxy flow too. 
      if (kfrags.length > 1) {
         const memberKFrag = ts.serializeKFrag(kfrags[1]);
         await (this.db.Put as any)(`signal_rooms/${groupId}/member_kfrags/${myPub}/${myPub}`, memberKFrag);
      }
    }

    const groupInfo: GroupInfo = {
      id: groupId,
      name,
      description,
      adminPub: myPub,
      secret: groupSecret,
      encryptionMode,
      communityPK,
      threshold: encryptionMode === 'tpre' ? 2 : undefined,
      totalShares: encryptionMode === 'tpre' ? 3 : undefined,
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
   * Listening to member role changes
   */
  onMemberRoleChange(groupId: string, memberPub: string, callback: (role: Role | null) => void): () => void {
    const path = `signal_rooms/${groupId}/members/${memberPub}/role`;
    const evId = `role_${groupId}_${memberPub}_${Math.random().toString(36).slice(2, 9)}`;

    (this.db.On as any)(path, (data: any) => {
      if (data) {
        callback(data as Role);
      } else {
        // Fallback to meta check if member node is null
        this.getMemberRole(groupId, memberPub).then(callback);
      }
    }, evId);

    return () => {
      (this.db.Off as any)(evId);
    };
  }

  /**
   * Listening to mute status
   */
  onMuteStatusChange(groupId: string, memberPub: string, callback: (isMuted: boolean) => void): () => void {
    const path = `signal_rooms/${groupId}/mutes/${memberPub}`;
    const evId = `mute_${groupId}_${memberPub}_${Math.random().toString(36).slice(2, 9)}`;

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

        // If it's a normal group (not broadcast), default to peer for basic actions
        // This handles sync delay after joining a public group
        if (meta && meta.type !== "broadcast") {
          const peerPerms = ["send_message", "start_call", "delete_own_message", "invite_peer", "report"];
          if (peerPerms.includes(action)) return true;
        }
      } catch (e) { }
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
        "promote_moderator", "invite_admin", "promote_admin_manual"
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
        const pubs = Object.keys(membersNode).filter(pub => pub !== "_" && pub !== ">" && membersNode[pub] !== null);
        
        // Fetch each member's role specifically to ensure we have the latest data
        const memberData = await Promise.all(pubs.map(async (pub) => {
          try {
            const data = await (this.db.Get as any)(`signal_rooms/${groupId}/members/${pub}`);
            if (data) {
              return {
                pub,
                role: data.role || (meta && meta.adminPub === pub ? "administrator" : "peer"),
                joinedAt: data.joinedAt || Date.now(),
              };
            }
          } catch (e) { }
          return {
            pub,
            role: (meta && meta.adminPub === pub ? "administrator" : "peer") as Role,
            joinedAt: Date.now(),
          };
        }));

        members.push(...memberData);
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
    const reportId = crypto.randomUUID();
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

    return btoa(unescape(encodeURIComponent(JSON.stringify(invite))));
  }

  /**
   * Join Group
   */
  async joinGroup(inviteB64: string): Promise<GroupInfo> {
    let jsonStr = "";
    try {
      jsonStr = decodeURIComponent(escape(atob(inviteB64)));
    } catch (e) {
      try {
        jsonStr = atob(inviteB64);
      } catch (e2) {
        throw new Error("Invalid invite format (not base64)");
      }
    }

    const invite = JSON.parse(jsonStr) as GroupInvite;
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

    // TPRE Enrichment: Publish Umbral PK on join so Admin can grant access
    try {
      const ts = await this.getThresholdService();
      const myUmbralPK = ts.getPublicKeyBase64();
      await (this.db.Put as any)(`signal_rooms/${invite.g}/members/${myPub}/umbral_pk`, myUmbralPK);
      console.log(`[GroupService] Published Umbral PK for member ${myPub.substring(0,8)} in group ${invite.g.substring(0,8)}`);
    } catch (e) {
      console.warn("[GroupService] Could not publish Umbral PK during join (non-TPRE or not logged in)", e);
    }

    return meta;
  }

  /**
   * Crypto helpers
   */
  async encryptGroupMessage(group: GroupInfo, plaintext: string): Promise<string> {
    const isTPRE = group.encryptionMode === 'tpre' || !!group.communityPK;
    if (isTPRE) {
      if (!group.communityPK) throw new Error("Missing communityPK for TPRE group");
      const ts = await this.getThresholdService();
      const groupPK = umbral.PublicKey.fromCompressedBytes(new Uint8Array(Buffer.from(group.communityPK, 'base64')));
      
      const encoder = new TextEncoder();
      const ptBuf = encoder.encode(plaintext);
      const { capsule, ciphertext } = ts.encryptForGroup(groupPK, ptBuf);
      
      const payload = {
        c: ts.serializeCapsule(capsule),
        t: Buffer.from(ciphertext).toString('base64')
      };
      
      // Store in a way that differentiates from legacy boxed string
      return JSON.stringify(payload);
    }
    
    // Legacy symmetric path
    const groupSecret = group.secret || "";
    if (!groupSecret) {
      console.warn("[GroupService] encryptGroupMessage: missing group secret for symmetric encryption");
    }
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

  /**
   * Helper to wait for a GunDB node to appear (sync delay)
   */
  private async waitForNode(path: string, maxAttempts = 3, delay = 1000): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const data = await (this.db.Get as any)(path);
            if (data && (data as any).err !== 'notfound' && data !== null) {
                return data;
            }
        } catch (e) {
            // Ignore error and retry
        }
        if (i < maxAttempts - 1) {
            console.log(`[GroupService] Node ${path} not found yet, waiting ${delay}ms... (attempt ${i+1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return null;
  }

  async decryptGroupMessage(group: GroupInfo, boxed: string, relayUrl?: string): Promise<string> {
    const isTPRE = group.encryptionMode === 'tpre' || !!group.communityPK;
    if (isTPRE) {
      if (!group.communityPK) throw new Error("Missing communityPK for TPRE group");
      const ts = await this.getThresholdService();
      const groupPK = umbral.PublicKey.fromCompressedBytes(new Uint8Array(Buffer.from(group.communityPK, 'base64')));

      let payload;
      try {
        payload = JSON.parse(boxed);
      } catch (e) {
        throw new Error("Invalid TPRE payload format (expected JSON)");
      }

      const capsule = ts.deserializeCapsule(payload.c);
      const ciphertext = new Uint8Array(Buffer.from(payload.t, 'base64'));

      // Retry loop for the entire TPRE decryption flow
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const myPub = this.db.getUserPub();
          if (!myPub) throw new Error("Not logged in");

          // 1. Get relay cfrag
          let relayCFrag: umbral.VerifiedCapsuleFrag | null = null;
          try {
            if (relayUrl) {
              const res = await fetch(`${relayUrl}/api/v1/tpre/reencrypt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  groupId: group.id,
                  memberPub: myPub,
                  capsuleB64: payload.c
                })
              });
              if (res.ok) {
                const data = await res.json();
                relayCFrag = ts.deserializeCFrag(data.cfrag);
              } else {
                // Not necessarily fatal if we can use member kfrags
                const err = await res.json().catch(() => ({ error: 'Unknown relay error' }));
                console.warn(`[GroupService] Relay re-encryption attempt ${attempt+1} failed:`, err);
              }
            }
          } catch (e) {
            console.warn(`[GroupService] Relay fetch error (attempt ${attempt+1}):`, e);
          }

          // 2. Get member kfrags (using patience)
          let memberCFrag: umbral.VerifiedCapsuleFrag | null = null;
          try {
            const kfragsNode = await this.waitForNode(`signal_rooms/${group.id}/member_kfrags/${myPub}`, attempt === 0 ? 1 : 2, 500);
            if (kfragsNode) {
              for (const senderPub of Object.keys(kfragsNode)) {
                if (senderPub !== "_" && kfragsNode[senderPub]) {
                  const kfragStr = kfragsNode[senderPub];
                  const kfrag = ts.deserializeKFrag(kfragStr);
                  memberCFrag = ts.reencrypt(capsule, kfrag);
                  break;
                }
              }
            }
          } catch (e) {
            console.warn("[GroupService] Failed to use member kfrags:", e);
          }

          const cfrags: umbral.VerifiedCapsuleFrag[] = [];
          if (relayCFrag) cfrags.push(relayCFrag);
          if (memberCFrag) cfrags.push(memberCFrag);

          const threshold = Number(group.threshold) || 2;
          if (cfrags.length >= threshold) {
            const plaintextBuf = ts.decryptWithCFrags(groupPK, capsule, cfrags, ciphertext);
            if (attempt > 0) console.log(`[GroupService] Decryption successful after ${attempt+1} attempts`);
            return new TextDecoder().decode(plaintextBuf);
          }

          // 3. Fallback: Admin SK recovery (only for Admin)
          const isGroupAdmin = myPub === group.adminPub;
          if (isGroupAdmin) {
            try {
              const encryptedSK = await this.waitForNode(`signal_rooms/${group.id}/admin_sk_encrypted`, attempt === 0 ? 1 : 2, 500);
              if (encryptedSK) {
                  const pair = (this.db.gun.user() as IZenInstance)?._?.sea;
                  if (pair) {
                      console.log(`[GroupService] Attempting Admin SK recovery. Pair Pub matches Group Admin Pub: ${pair.pub === group.adminPub}`);
                      const skString = await SEA.decrypt(encryptedSK, pair);
                      if (skString) {
                          const groupSK = ts.deserializeSecretKey(skString);
                          const plaintextBuf = ts.decryptDirect(groupSK, capsule, ciphertext);
                          console.log(`[GroupService] Admin SK recovery successful (attempt ${attempt+1})`);
                          return new TextDecoder().decode(plaintextBuf);
                      } else {
                          console.warn("[GroupService] Admin SK decryption failed (invalid key or sync issue)", { pairPub: pair.pub, adminPub: group.adminPub });
                      }
                  } else {
                      console.warn("[GroupService] Admin user SEA pair not ready for decryption");
                  }
              }
            } catch (e) {
              console.warn("[GroupService] Admin SK recovery error:", e);
            }
          } else {
             // For debugging: log why we skip admin SK
             console.log(`[GroupService] Skipping Admin SK recovery (User Pub ${myPub?.substring(0,8)}... != Admin Pub ${group.adminPub?.substring(0,8)}...)`);
          }

          if (attempt < 2) {
             console.log(`[GroupService] Not enough cfrags, retrying in 1s... (attempt ${attempt+1}/3)`);
             await new Promise(r => setTimeout(r, 1000));
          } else {
             throw new Error(`Not enough cfrags. Found ${cfrags.length}, need ${threshold}`);
          }
        } catch (e: any) {
           if (attempt === 2) throw e;
           console.log(`[GroupService] Decryption attempt ${attempt+1} failed, retrying...`, e.message);
           await new Promise(r => setTimeout(r, 1000));
        }
      }
      throw new Error("Failed to decrypt group message after retries");
    }

    // Legacy symmetric path
    const groupSecret = group.secret || "";
    if (!boxed) return "";

    let combined;
    try {
      combined = Uint8Array.from(atob(boxed), c => c.charCodeAt(0));
    } catch (e) {
      console.warn("[GroupService] decryptGroupMessage: failed to decode boxed message", e);
      return "";
    }

    const iv = combined.slice(0, 12);
    const ciphertextArr = combined.slice(12);

    if (!groupSecret) {
      console.warn("[GroupService] decryptGroupMessage: missing group secret for symmetric decryption");
    }
    const keyData = Uint8Array.from(atob(groupSecret), c => c.charCodeAt(0));
    const key = await window.crypto.subtle.importKey(
      "raw", keyData, "AES-GCM", false, ["decrypt"]
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, key, ciphertextArr
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Grant TPRE Access (Generates KFrags)
   */
  async grantTPREAccess(groupId: string, memberPub: string, memberUmbralPKBase64?: string): Promise<void> {
    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta || meta.encryptionMode !== 'tpre') return;

    if (!(await this.canPerform(groupId, "invite_peer")) && !(await this.canPerform(groupId, "invite_admin")) && meta.adminPub !== this.db.getUserPub()) {
       throw new Error("Unauthorized to grant TPRE access");
    }

    if (!memberUmbralPKBase64) {
        throw new Error("Member Umbral PK required to generate KFrags");
    }

    const ts = await this.getThresholdService();
    
    // Recover groupSK
    const encryptedSK = await (this.db.Get as any)(`signal_rooms/${groupId}/admin_sk_encrypted`);
    if (!encryptedSK) throw new Error("Group SK not found");
    const pair = (this.db.gun.user() as any)?._?.sea;
    const skString = await this.db.sea.decrypt(encryptedSK, pair);
    if (!skString) throw new Error("Failed to decrypt group SK");
    
    const groupSK = ts.deserializeSecretKey(skString);
    
    const memberPK = ts.deserializePublicKey(memberUmbralPKBase64);
    
    const kfrags = ts.generateKFragsForMember(groupSK, memberPK, meta.threshold || 2, meta.totalShares || 3);
    
    if (kfrags.length > 0) {
        const relayKFrag = ts.serializeKFrag(kfrags[0]);
        // Ideally we need to tell relay via API, but we'll sync it to gun and let Relay catch it,
        // OR the user will push it to Relay API in an external action. 
        // Best approach for Linda architecture: store it in GunDB, relay serves the API using GunDB as backend
        await (this.db.Put as any)(`signal_rooms/${groupId}/relay_kfrags/${memberPub}`, relayKFrag);
    }
    
    if (kfrags.length > 1) {
        const memberKFrag = ts.serializeKFrag(kfrags[1]);
        await (this.db.Put as any)(`signal_rooms/${groupId}/member_kfrags/${memberPub}/${this.db.getUserPub()}`, memberKFrag);
    }
  }

  /**
   * Revoke TPRE Access
   */
  async revokeTPREAccess(groupId: string, memberPub: string): Promise<void> {
     const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
     if (!meta || meta.encryptionMode !== 'tpre') return;
     
     if (!(await this.canPerform(groupId, "kick_user")) && meta.adminPub !== this.db.getUserPub()) {
       throw new Error("Unauthorized to revoke TPRE access");
     }

     // Delete relay kfrag
     await (this.db.Put as any)(`signal_rooms/${groupId}/relay_kfrags/${memberPub}`, null);
     
     // Nullify any member kfrags targeted at this member
     await (this.db.Put as any)(`signal_rooms/${groupId}/member_kfrags/${memberPub}`, null);
  }

  /**
   * Public Group Management
   */
  async setGroupPublic(groupId: string, isPublic: boolean, publicName?: string): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    const role = await this.getMemberRole(groupId, myPub);
    if (role !== "administrator") throw new Error("Unauthorized");

    await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, { isPublic, publicName });
    
    if (isPublic && publicName) {
      await (this.db.Put as any)(`signal_public_groups/${publicName}`, groupId);
    } else if (!isPublic) {
      // Need to find the name to delete it, or we just trust the caller provided it
      if (publicName) await (this.db.Put as any)(`signal_public_groups/${publicName}`, null);
    }
  }

  /**
   * Public Group Discovery & Joining
   */
  async getPublicGroup(publicName: string): Promise<string | null> {
    try {
      const groupId = await (this.db.Get as any)(`signal_public_groups/${publicName}`);
      return groupId || null;
    } catch (e) {
      return null;
    }
  }

  async joinPublicGroup(publicName: string): Promise<GroupInfo> {
    const groupId = await this.getPublicGroup(publicName);
    if (!groupId) throw new Error("Public group not found");

    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group meta not found");

    // Add as peer
    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}`, {
      role: "peer" as Role,
      joinedAt: Date.now()
    } as GroupMember);

    // TPRE Enrichment: Publish Umbral PK
    try {
      const ts = await this.getThresholdService();
      const myUmbralPK = ts.getPublicKeyBase64();
      await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}/umbral_pk`, myUmbralPK);
      console.log(`[GroupService] Joined public group ${publicName} and published Umbral PK`);
    } catch (e) {
      console.warn("[GroupService] Could not publish Umbral PK during public join", e);
    }

    return meta;
  }

  /**
   * Ensure TPRE Umbral PK is published (for existing members)
   */
  async ensureUmbralPK(groupId: string): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) return;

    try {
      const memberNode = await (this.db.Get as any)(`signal_rooms/${groupId}/members/${myPub}`);
      if (memberNode && !memberNode.umbral_pk) {
        const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
        if (meta && meta.encryptionMode === 'tpre') {
          const ts = await this.getThresholdService();
          const myUmbralPK = ts.getPublicKeyBase64();
          await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}/umbral_pk`, myUmbralPK);
          console.log(`[GroupService] Retroactively published Umbral PK for group ${groupId}`);
        }
      }
    } catch (e) {
      // Quiet fail - not critical if node doesn't exist yet
    }
  }

  /**
   * Get or Create a deterministic P2P TPRE group
   */
  async getOrCreateP2PGroup(otherPub: string): Promise<GroupInfo> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    const cached = this.p2pGroupCache.get(otherPub);
    if (cached) {
        try {
            const meta = await (this.db.Get as any)(`signal_rooms/${cached}/meta`) as GroupInfo;
            if (meta && meta.id) return meta;
        } catch (e) {}
    }

    if (myPub === otherPub) {
        // Self-chat (My Cloud)
        const groupId = `p2p_self_${myPub.substring(0, 16)}`;
        this.p2pGroupCache.set(otherPub, groupId);
        try {
            const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
            if (meta && meta.id) return meta;
        } catch (e) {}
        return await this.createP2PGroup(myPub, groupId, true);
    }
    
    const sorted = [myPub, otherPub].sort();
    const groupId = `p2p_${sorted[0].substring(0, 16)}_${sorted[1].substring(0, 16)}`;
    this.p2pGroupCache.set(otherPub, groupId);
    
    try {
      const meta = await (this.db.Get as any)(`signal_rooms/${groupId}/meta`) as GroupInfo;
      if (meta && meta.id) return meta;
    } catch (e) {}

    return await this.createP2PGroup(otherPub, groupId);
  }

  public getP2PGroupId(otherPub: string): string | null {
     if (!otherPub) return null;
     const cached = this.p2pGroupCache.get(otherPub);
     if (cached) return cached;
     
     const myPub = this.db.getUserPub();
     if (!myPub) return null;
     
     if (myPub === otherPub) return `p2p_self_${myPub.substring(0, 16)}`;
     const sorted = [myPub, otherPub].sort();
     return `p2p_${sorted[0].substring(0, 16)}_${sorted[1].substring(0, 16)}`;
  }

  private async createP2PGroup(otherPub: string, groupId: string, isSelf = false): Promise<GroupInfo> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    console.log(`[GroupService] Initializing TPRE P2P room: ${groupId}`);
    const ts = await this.getThresholdService();
    const { groupSK, groupPK } = ts.createGroup();
    const communityPK = ts.serializePublicKey(groupPK);
    
    const pair = (this.db.gun.user() as any)?._?.sea;
    const skString = ts.serializeSecretKey(groupSK);
    const encryptedSK = await this.db.sea.encrypt(skString, pair);
    
    await (this.db.Put as any)(`signal_rooms/${groupId}/admin_sk_encrypted`, encryptedSK);
    
    // Grant Me access
    const myUmbralPK = ts.getPublicKey();
    const kfrags = ts.generateKFragsForMember(groupSK, myUmbralPK, 2, 3);
    if (kfrags.length > 0) {
       await (this.db.Put as any)(`signal_rooms/${groupId}/relay_kfrags/${myPub}`, ts.serializeKFrag(kfrags[0]));
    }

    const groupInfo: GroupInfo = {
      id: groupId,
      name: isSelf ? "My Cloud (TPRE)" : "Private Chat",
      description: isSelf ? "Personal encrypted storage" : "TPRE Secure Chat",
      adminPub: myPub,
      secret: "",
      encryptionMode: 'tpre',
      communityPK,
      threshold: 2,
      totalShares: 3,
      type: 'group'
    };

    await (this.db.Put as any)(`signal_rooms/${groupId}/meta`, groupInfo);
    
    await (this.db.Put as any)(`signal_rooms/${groupId}/members/${myPub}`, {
      role: "administrator",
      joinedAt: Date.now(),
      umbral_pk: ts.getPublicKeyBase64()
    } as any);

    if (!isSelf) {
        await (this.db.Put as any)(`signal_rooms/${groupId}/members/${otherPub}`, {
            role: "peer",
            joinedAt: Date.now()
        } as any);
    }

    return groupInfo;
  }
}

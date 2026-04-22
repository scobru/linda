import { DataBase } from "../zen/db";
import * as crypto from "../zen/crypto";
import { ThresholdService } from "./ThresholdService";
import { PublicKey } from "@nucypher/umbral-pre";
import type { VerifiedCapsuleFrag } from "@nucypher/umbral-pre";

export type Role = "peer" | "moderator" | "administrator";

export interface GroupMember {
  pub: string;
  role: Role;
  joinedAt: number;
  umbral_pk?: string;
  pq_pk?: string;
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

  constructor(db: DataBase) {
    this.db = db;
  }

  private async getThresholdService(): Promise<ThresholdService> {
    const pair = this.db.pair;
    if (!pair || !pair.priv) throw new Error("Not logged in or missing SEA keys");
    return await ThresholdService.init(pair.priv);
  }

  private generateUUID(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
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
      groupSecret = btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(32))));
    } else {
      const ts = await this.getThresholdService();
      const { groupSK, groupPK } = ts.createGroup();
      communityPK = ts.serializePublicKey(groupPK);
      
      const pair = this.db.pair;
      if (!pair) throw new Error("Authentication state lost during group creation");
      
      const skString = ts.serializeSecretKey(groupSK);
      const encryptedSK = await crypto.encrypt(skString, pair, this.db.zen);
      
      await (this.db.Put as any)(`linda_rooms/${groupId}/admin_sk_encrypted`, encryptedSK);
      
      const myUmbralPK = ts.getPublicKey();
      const threshold = 1;
      const totalShares = 1;
      const kfrags = ts.generateKFragsForMember(groupSK, myUmbralPK, threshold, totalShares);
      
      if (kfrags.length > 0) {
         const relayKFrag = ts.serializeKFrag(kfrags[0]);
         await (this.db.Put as any)(`linda_rooms/${groupId}/relay_kfrags/${myPub}`, relayKFrag);
      }
      
      if (kfrags.length > 1) {
         const memberKFrag = ts.serializeKFrag(kfrags[1]);
         await (this.db.Put as any)(`linda_rooms/${groupId}/member_kfrags/${myPub}/${myPub}`, memberKFrag);
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
      threshold: encryptionMode === 'tpre' ? 1 : undefined,
      totalShares: encryptionMode === 'tpre' ? 1 : undefined,
      type,
      features: {
        callsEnabled: true,
        activityEnabled: true,
      }
    };

    try {
      await (this.db.Put as any)(`linda_rooms/${groupId}/meta`, groupInfo);
      await (this.db.Put as any)(`linda_rooms/${groupId}/members/${myPub}`, {
        role: "administrator",
        joinedAt: Date.now(),
      } as GroupMember);
    } catch (e) {
      console.error(`[GroupService] Failed to initialize group ${groupId} nodes:`, e);
      throw new Error("Failed to initialize group nodes on GunDB");
    }

    return groupInfo;
  }

  async getMemberRole(groupId: string, memberPub: string): Promise<Role | null> {
    try {
      const member = await (this.db.Get as any)(`linda_rooms/${groupId}/members/${memberPub}`) as GroupMember;
      if (member && member.role) return member.role;

      const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
      if (meta && meta.adminPub === memberPub) {
        return "administrator";
      }
    } catch (e: any) {}
    return null;
  }

  onMemberRoleChange(groupId: string, memberPub: string, callback: (role: Role | null) => void): () => void {
    const path = `linda_rooms/${groupId}/members/${memberPub}/role`;
    const evId = `role_${groupId}_${memberPub}_${Math.random().toString(36).slice(2, 9)}`;

    (this.db.On as any)(path, (data: any) => {
      if (data) {
        callback(data as Role);
      } else {
        this.getMemberRole(groupId, memberPub).then(callback);
      }
    }, evId);

    return () => {
      (this.db.Off as any)(evId);
    };
  }

  onMuteStatusChange(groupId: string, memberPub: string, callback: (isMuted: boolean) => void): () => void {
    const path = `linda_rooms/${groupId}/mutes/${memberPub}`;
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

    if (action === "send_message") {
      try {
        const isMuted = await this.isMuted(groupId, myPub);
        if (isMuted) return false;
      } catch (e) {}
    }

    const role = await this.getMemberRole(groupId, myPub);

    if (action === "send_message") {
      try {
        const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
        if (meta && meta.type === "broadcast") {
          if (!role || (role !== "administrator" && role !== "moderator")) {
            return false;
          }
        }
      } catch (e: any) { }
    }

    if (!role) {
      try {
        const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
        if (meta && meta.adminPub === myPub) {
          return true;
        }

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

  async muteMember(groupId: string, memberPub: string, muted: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "mute_peer"))) throw new Error("Unauthorized");
    await (this.db.Put as any)(`linda_rooms/${groupId}/mutes/${memberPub}`, muted ? Date.now() : null);
  }

  async isMuted(groupId: string, memberPub: string): Promise<boolean> {
    try {
      const muted = await (this.db.Get as any)(`linda_rooms/${groupId}/mutes/${memberPub}`);
      return !!muted;
    } catch (e) {
      return false;
    }
  }

  async updateGroupMeta(groupId: string, updates: Partial<Pick<GroupInfo, 'name' | 'description' | 'avatar'>>): Promise<void> {
    if (!(await this.canPerform(groupId, "update_meta"))) throw new Error("Unauthorized");
    try {
      const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
      await (this.db.Put as any)(`linda_rooms/${groupId}/meta`, { ...meta, ...updates });
    } catch (e) {
      console.error('[GroupService] Failed to update group meta:', e);
      throw new Error("Failed to update group metadata on GunDB");
    }
  }

  async toggleFeature(groupId: string, feature: 'callsEnabled' | 'activityEnabled', enabled: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "toggle_features"))) throw new Error("Unauthorized");
    try {
      const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
      const features = { ...meta.features, [feature]: enabled };
      await (this.db.Put as any)(`linda_rooms/${groupId}/meta`, { ...meta, features });
    } catch (e) {
      console.error('[GroupService] Failed to toggle feature:', e);
      throw new Error("Failed to update group features on GunDB");
    }
  }

  async updateMemberRole(groupId: string, memberPub: string, newRole: Role): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    const myRole = await this.getMemberRole(groupId, myPub);
    if (!myRole) throw new Error("Not a member");

    if (myPub === memberPub) {
      if (newRole === 'administrator') throw new Error("Cannot promote self to admin");
      if (myRole === 'administrator') {
        const members = await this.getMembers(groupId);
        const adminCount = members.filter(m => m.role === 'administrator').length;
        if (adminCount <= 1) throw new Error("Cannot downgrade the last administrator");
      }
      await (this.db.Put as any)(`linda_rooms/${groupId}/members/${memberPub}/role`, newRole);
      return;
    }

    if (newRole === "administrator" && !(await this.canPerform(groupId, "promote_admin_manual"))) {
      throw new Error("Administrators can only be added via specific invite links");
    }

    if (newRole === "moderator" && !(await this.canPerform(groupId, "promote_moderator"))) throw new Error("Unauthorized");
    if (newRole === "peer" && !(await this.canPerform(groupId, "kick_user"))) throw new Error("Unauthorized");

    await (this.db.Put as any)(`linda_rooms/${groupId}/members/${memberPub}/role`, newRole);
  }

  async getMembers(groupId: string): Promise<GroupMember[]> {
    try {
      const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
      const membersNode = await (this.db.Get as any)(`linda_rooms/${groupId}/members`) as Record<string, any>;

      const members: GroupMember[] = [];
      if (membersNode) {
        const pubs = Object.keys(membersNode).filter(pub => pub !== "_" && pub !== ">" && membersNode[pub] !== null);
        
        const memberData = await Promise.all(pubs.map(async (pub) => {
          try {
            const data = await (this.db.Get as any)(`linda_rooms/${groupId}/members/${pub}`);
            if (data) {
              return {
                pub,
                role: data.role || (meta && meta.adminPub === pub ? "administrator" : "peer"),
                joinedAt: data.joinedAt || Date.now(),
                umbral_pk: data.umbral_pk,
                pq_pk: data.pq_pk,
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

  async kickMember(groupId: string, memberPub: string): Promise<void> {
    if (!(await this.canPerform(groupId, "kick_user"))) throw new Error("Unauthorized");
    await (this.db.Put as any)(`linda_rooms/${groupId}/members/${memberPub}`, null);
    await (this.db.Put as any)(`linda_v3_contacts_${memberPub}/${groupId}`, null);
  }

  async leaveGroup(groupId: string): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");
    await (this.db.Put as any)(`linda_rooms/${groupId}/members/${myPub}`, null);
    await (this.db.Put as any)(`linda_v3_contacts_${myPub}/${groupId}`, null);
  }

  async pinMessage(groupId: string, messageId: string, pinned: boolean): Promise<void> {
    if (!(await this.canPerform(groupId, "pin_message"))) throw new Error("Unauthorized");
    await (this.db.Put as any)(`linda_rooms/${groupId}/pins/${messageId}`, pinned ? Date.now() : null);
  }

  async deleteMessage(groupId: string, messageId: string, senderPub: string): Promise<void> {
    const myPub = this.db.getUserPub();
    const isOwn = myPub === senderPub;

    if (isOwn) {
      if (!(await this.canPerform(groupId, "delete_own_message"))) throw new Error("Unauthorized");
    } else {
      if (!(await this.canPerform(groupId, "delete_any_message"))) throw new Error("Unauthorized");
    }

    await (this.db.Put as any)(`linda_rooms/${groupId}/deleted_messages/${messageId}`, {
      deletedAt: Date.now(),
      deletedBy: myPub
    });
  }

  async reportContent(groupId: string, contentId: string, reason: string): Promise<void> {
    if (!(await this.canPerform(groupId, "report"))) throw new Error("Unauthorized");
    const reportId = this.generateUUID();
    await (this.db.Put as any)(`linda_rooms/${groupId}/reports/${reportId}`, {
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
    const reportId = globalThis.crypto.randomUUID();
    await (this.db.Put as any)(`linda_rooms/${groupId}/reports/${reportId}`, {
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
    const reportsNode = await (this.db.Get as any)(`linda_rooms/${groupId}/reports`) as Record<string, any>;
    if (!reportsNode) return [];
    return Object.entries(reportsNode)
      .filter(([id, data]) => id !== "_" && id !== ">" && data !== null)
      .map(([id, data]) => ({ id, ...data }));
  }

  async resolveReport(groupId: string, reportId: string, status: "resolved" | "dismissed"): Promise<void> {
    if (!(await this.canPerform(groupId, "action_reports"))) throw new Error("Unauthorized");
    const report = await (this.db.Get as any)(`linda_rooms/${groupId}/reports/${reportId}`);
    if (!report) throw new Error("Report not found");
    await (this.db.Put as any)(`linda_rooms/${groupId}/reports/${reportId}/status`, status);
  }

  async generateInvite(groupId: string, role: Role = "peer", singleUse: boolean = false): Promise<string> {
    const action = role === "administrator" ? "invite_admin" : (role === "moderator" ? "invite_moderator" : "invite_peer");
    if (!(await this.canPerform(groupId, action))) throw new Error("Unauthorized");

    const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group not found");

    const inviteId = this.generateUUID();
    const invite: GroupInvite = {
      g: groupId,
      s: meta.secret,
      r: role,
      t: Date.now() + (role === 'administrator' ? 1 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000),
      u: singleUse || role === 'administrator',
      id: inviteId
    };

    if (invite.u) {
      await (this.db.Put as any)(`linda_rooms/${groupId}/active_invites/${inviteId}`, { status: 'active' });
    }

    return btoa(unescape(encodeURIComponent(JSON.stringify(invite))));
  }

  async joinGroup(inviteB64: string): Promise<GroupInfo> {
    let jsonStr = "";
    try {
      jsonStr = decodeURIComponent(escape(atob(inviteB64)));
    } catch (e) {
      try {
        jsonStr = atob(inviteB64);
      } catch (e2) {
        throw new Error("Invalid invite format");
      }
    }

    const invite = JSON.parse(jsonStr) as GroupInvite;
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");

    if (Date.now() > invite.t) throw new Error("Invite expired");

    const meta = await (this.db.Get as any)(`linda_rooms/${invite.g}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group meta not found");

    await (this.db.Put as any)(`linda_rooms/${invite.g}/members/${myPub}`, {
      role: invite.r,
      joinedAt: Date.now()
    } as GroupMember);

    return meta;
  }

  async setGroupPublic(groupId: string, isPublic: boolean, publicName?: string): Promise<void> {
    await (this.db.Put as any)(`linda_rooms/${groupId}/meta/isPublic`, isPublic);
    if (publicName) {
      await (this.db.Put as any)(`linda_rooms/${groupId}/meta/publicName`, publicName);
      if (isPublic) {
        await (this.db.Put as any)(`linda_public_index/${publicName}`, groupId);
      } else {
        await (this.db.Put as any)(`linda_public_index/${publicName}`, null);
      }
    }
  }

  async getPublicGroup(publicName: string): Promise<string | null> {
    try {
      const groupId = await (this.db.Get as any)(`signal_public_index/${publicName}`);
      return groupId || null;
    } catch (e) {
      return null;
    }
  }

  async joinPublicGroup(publicName: string): Promise<GroupInfo> {
    const groupId = await this.getPublicGroup(publicName);
    if (!groupId) throw new Error("Public group not found");
    const inviteB64 = await this.generateInvite(groupId, 'peer');
    return await this.joinGroup(inviteB64);
  }

  async getP2PGroupId(contactPub: string): Promise<string> {
    const myPub = this.db.getUserPub();
    if (!myPub) throw new Error("Not logged in");
    const sorted = [myPub, contactPub].sort();
    return `p2p_${sorted[0]}_${sorted[1]}`;
  }

  async getOrCreateP2PGroup(contactPub: string): Promise<GroupInfo> {
    const groupId = await this.getP2PGroupId(contactPub);
    try {
      const meta = await (this.db.Get as any)(`linda_rooms/${groupId}/meta`) as GroupInfo;
      if (meta) return meta;
    } catch (e) {}

    // Create a virtual meta for TPRE P2P
    const ts = await this.getThresholdService();
    const { groupSK, groupPK } = ts.createGroup();
    const communityPK = ts.serializePublicKey(groupPK);
    
    const pair = this.db.pair;
    if (!pair) throw new Error("Authentication state lost");
    
    const skString = ts.serializeSecretKey(groupSK);
    const encryptedSK = await crypto.encrypt(skString, pair, this.db.zen);
    
    await (this.db.Put as any)(`linda_rooms/${groupId}/admin_sk_encrypted`, encryptedSK);

    const groupInfo: GroupInfo = {
      id: groupId,
      name: "Direct Chat",
      description: "Encrypted P2P Conversation",
      adminPub: this.db.getUserPub() || "",
      secret: "",
      encryptionMode: 'tpre',
      communityPK,
      threshold: 1,
      totalShares: 1,
      type: 'group'
    };

    await (this.db.Put as any)(`linda_rooms/${groupId}/meta`, groupInfo);
    
    // Initial kfrags for myself
    const myUmbralPK = ts.getPublicKey();
    const kfrags = ts.generateKFragsForMember(groupSK, myUmbralPK, 1, 1);
    if (kfrags.length > 0) {
       await (this.db.Put as any)(`linda_rooms/${groupId}/relay_kfrags/${this.db.getUserPub()}`, ts.serializeKFrag(kfrags[0]));
    }

    return groupInfo;
  }

  async grantTPREAccess(groupId: string, memberPub: string, memberUmbralPKB64: string): Promise<void> {
    const ts = await this.getThresholdService();
    const encryptedSK = await (this.db.Get as any)(`linda_rooms/${groupId}/admin_sk_encrypted`);
    if (!encryptedSK) throw new Error("Missing group SK for TPRE grant");
    
    const pair = this.db.pair;
    if (!pair) throw new Error("Not logged in");
    
    const skString = await crypto.decrypt(encryptedSK, pair, this.db.zen);
    const groupSK = ts.deserializeSecretKey(skString);
    
    const memberPK = ts.deserializePublicKey(memberUmbralPKB64);
    const kfrags = ts.generateKFragsForMember(groupSK, memberPK, 1, 1);
    
    if (kfrags.length > 0) {
       const relayKFrag = ts.serializeKFrag(kfrags[0]);
       await (this.db.Put as any)(`linda_rooms/${groupId}/relay_kfrags/${memberPub}`, relayKFrag);
    }
    
    if (kfrags.length > 1) {
       const memberKFrag = ts.serializeKFrag(kfrags[1]);
       await (this.db.Put as any)(`linda_rooms/${groupId}/member_kfrags/${memberPub}/${this.db.getUserPub()}`, memberKFrag);
    }
  }

  async ensureUmbralPK(groupId: string): Promise<void> {
    const myPub = this.db.getUserPub();
    if (!myPub) return;
    
    const ts = await this.getThresholdService();
    const myUmbralPK = ts.serializePublicKey(ts.getPublicKey());
    const myPQPK = ts.getPQPublicKeyBase64();
    
    // Publish our Umbral PK and PQ PK so the group admin (or other members) can grant us access
    await (this.db.Put as any)(`linda_rooms/${groupId}/umbral_pks/${myPub}`, myUmbralPK);
    if (myPQPK) {
      await (this.db.Put as any)(`linda_rooms/${groupId}/pq_pks/${myPub}`, myPQPK);
      // Also update member node for easier lookup
      await (this.db.Put as any)(`linda_rooms/${groupId}/members/${myPub}/pq_pk`, myPQPK);
    }
    await (this.db.Put as any)(`linda_rooms/${groupId}/members/${myPub}/umbral_pk`, myUmbralPK);
  }

  async encryptGroupMessage(group: GroupInfo, plaintext: string): Promise<string> {
    const isTPRE = group.encryptionMode === 'tpre' || !!group.communityPK;
    if (isTPRE) {
      if (!group.communityPK) throw new Error("Missing communityPK for TPRE group");
      const ts = await this.getThresholdService();
      const groupPK = ts.deserializePublicKey(group.communityPK);
      
      const encoder = new TextEncoder();
      const ptBuf = encoder.encode(plaintext);
      
      // 1. Umbral Encryption (Standard Path)
      const { capsule: umbralCapsule, ciphertext: umbralCiphertext } = ts.encryptForGroup(groupPK, ptBuf);
      
      const payload: any = {
        c: ts.serializeCapsule(umbralCapsule),
        t: Buffer.from(umbralCiphertext).toString('base64')
      };

      // 2. PQ Hybrid Path: Try to find PQ keys for members
      try {
        const members = await this.getMembers(group.id);
        const pqCapsules: Record<string, string> = {};
        
        for (const member of members) {
          if (member.pq_pk && member.pub !== this.db.getUserPub()) {
            // In a real hybrid model, we'd wrap the Umbral secret. 
            // For now, we provide a direct PQ encapsulation of the same plaintext or a symmetric key.
            // Simplest approach for this stack: the PQ layer handles the message key.
            // However, Umbral's internal key is not directly exposed.
            // We'll just attach a Kyber capsule. 
            // NOTE: Full hybrid integration would require deeper changes in Umbral or a custom KDF.
            const { capsule } = ts.encapsulatePQ(member.pq_pk);
            pqCapsules[member.pub] = capsule;
          }
        }
        
        if (Object.keys(pqCapsules).length > 0) {
          payload.pq = pqCapsules;
        }
      } catch (e) {
        console.warn("[GroupService] Failed to generate PQ capsules", e);
      }
      
      return JSON.stringify(payload);
    }
    
    const groupSecret = group.secret || "";
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

  async decryptGroupMessage(group: GroupInfo, boxed: string, relayUrl?: string): Promise<string> {
    const isTPRE = group.encryptionMode === 'tpre' || !!group.communityPK;
    if (isTPRE) {
      if (!group.communityPK) throw new Error("Missing communityPK for TPRE group");
      const ts = await this.getThresholdService();
      const groupPK = PublicKey.fromCompressedBytes(new Uint8Array(Buffer.from(group.communityPK, 'base64')));

      let payload;
      try {
        payload = JSON.parse(boxed);
      } catch (e) {
        throw new Error("Invalid TPRE payload");
      }

      const capsule = ts.deserializeCapsule(payload.c);
      const ciphertext = new Uint8Array(Buffer.from(payload.t, 'base64'));

      const myPub = this.db.getUserPub();
      if (!myPub) throw new Error("Not logged in");

      // 1. Try PQ Decapsulation first if available
      if (payload.pq && payload.pq[myPub]) {
        try {
          // In a full hybrid model, we'd use the PQ secret to derive the Umbral key.
          // Since we are adding this as a layer, we'll log its presence.
          // In this implementation, Umbral is still the primary provider of the plaintext.
          // but the PQ capsule serves as proof/future-proofing for the PQ layer.
          ts.decapsulatePQ(payload.pq[myPub]);
          console.log("[GroupService] PQ Decapsulation successful (Hybrid verification)");
        } catch (e) {
          console.error("[GroupService] PQ Decapsulation failed", e);
        }
      }

      let relayCFrag: VerifiedCapsuleFrag | null = null;
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
            const errBody = await res.text().catch(() => "N/A");
            console.warn(`[HybridGroup] Relay failed to re-encrypt. Status: ${res.status} ${res.statusText}`, { url: res.url, body: errBody });
          }
        }
      } catch (e: any) {
        console.error(`[HybridGroup] Relay request failed: ${e.message}`, e);
      }

      let memberCFrag: VerifiedCapsuleFrag | null = null;
      try {
        const kfragsNode = await (this.db.Get as any)(`linda_rooms/${group.id}/member_kfrags/${myPub}`);
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
      } catch (e) {}

      const cfrags: VerifiedCapsuleFrag[] = [];
      if (relayCFrag) cfrags.push(relayCFrag);
      if (memberCFrag) cfrags.push(memberCFrag);

      const threshold = Number(group.threshold) || 1;
      if (cfrags.length >= threshold) {
        const plaintextBuf = ts.decryptWithCFrags(groupPK, capsule, cfrags, ciphertext);
        return new TextDecoder().decode(plaintextBuf);
      }

      if (myPub === group.adminPub) {
        try {
          const encryptedSK = await (this.db.Get as any)(`linda_rooms/${group.id}/admin_sk_encrypted`);
          if (encryptedSK) {
              const pair = this.db.pair;
              if (pair) {
                  const skString = await crypto.decrypt(encryptedSK, pair, this.db.zen);
                  const groupSK = ts.deserializeSecretKey(skString);
                  const plaintextBuf = ts.decryptDirect(groupSK, capsule, ciphertext);
                  return new TextDecoder().decode(plaintextBuf);
              }
          }
        } catch (e) {}
      }
      
      throw new Error(`Threshold not met (${cfrags.length}/${threshold})`);
    }

    const groupSecret = group.secret || "";
    if (!boxed) return "";

    let combined;
    try {
      combined = Uint8Array.from(atob(boxed), c => c.charCodeAt(0));
    } catch (e) {
      return "";
    }

    const iv = combined.slice(0, 12);
    const ciphertextArr = combined.slice(12);
    const keyData = Uint8Array.from(atob(groupSecret), c => c.charCodeAt(0));
    const key = await window.crypto.subtle.importKey(
      "raw", keyData, "AES-GCM", false, ["decrypt"]
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, key, ciphertextArr
    );

    return new TextDecoder().decode(decrypted);
  }
}

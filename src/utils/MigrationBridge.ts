import { GroupInfo, GroupService } from "../GroupService";

export class MigrationBridge {
  private groupService: GroupService;

  constructor(groupService: GroupService) {
    this.groupService = groupService;
  }

  /**
   * Detects the encryption mode intended for a message based on group settings.
   */
  static getEncryptionMode(group: GroupInfo): 'symmetric' | 'tpre' {
    return group.encryptionMode || 'symmetric';
  }

  /**
   * Upgrades a symmetric group to TPRE. Only the admin can do this.
   * This generates the new Community PK, encrypted SK, and KFrags,
   * but old messages must remain readable via the old key (kept in `secret`).
   */
  async upgradeToTPRE(groupId: string): Promise<GroupInfo> {
    const meta = await (this.groupService as any).db.Get(`signal_rooms/${groupId}/meta`) as GroupInfo;
    if (!meta) throw new Error("Group meta not found");

    if (meta.encryptionMode === 'tpre') {
      throw new Error("Group is already TPRE-secured");
    }

    const myPub = (this.groupService as any).db.getUserPub();
    if (meta.adminPub !== myPub) {
      throw new Error("Only the group administrator can upgrade encryption to TPRE");
    }

    // Use ThresholdService via groupService reflection
    const ts = await (this.groupService as any).getThresholdService();
    const { groupSK, groupPK } = ts.createGroup();
    const communityPK = ts.serializePublicKey(groupPK);
    
    // Encrypt the groupSK using admin's personal pair and store it
    const pair = ((this.groupService as any).db.gun.user() as any)?._?.sea;
    const skString = ts.serializeSecretKey(groupSK);
    const encryptedSK = await (this.groupService as any).db.sea.encrypt(skString, pair);
    await (this.groupService as any).db.Put(`signal_rooms/${groupId}/admin_sk_encrypted`, encryptedSK);

    // Initial Relay KFrag for admin
    const myUmbralPK = ts.getPublicKey();
    const kfrags = ts.generateKFragsForMember(groupSK, myUmbralPK, 2, 3);
    
    if (kfrags.length > 0) {
       const relayKFrag = ts.serializeKFrag(kfrags[0]);
       await (this.groupService as any).db.Put(`signal_rooms/${groupId}/relay_kfrags/${myPub}`, relayKFrag);
    }
    
    if (kfrags.length > 1) {
       const memberKFrag = ts.serializeKFrag(kfrags[1]);
       await (this.groupService as any).db.Put(`signal_rooms/${groupId}/member_kfrags/${myPub}/${myPub}`, memberKFrag);
    }

    // Update group meta to reflect dual mode
    const updatedMeta: GroupInfo = {
      ...meta,
      encryptionMode: 'tpre',
      communityPK: communityPK,
      threshold: 2,
      totalShares: 3,
    };

    await (this.groupService as any).db.Put(`signal_rooms/${groupId}/meta`, updatedMeta);
    
    // NOTE: All members must now be granted TPRE access. We don't have their Umbral PK yet.
    // They will need to perform an interactive "request access" or share their PK via normal SEA channels.
    
    return updatedMeta;
  }
}

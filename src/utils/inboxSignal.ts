import { CommunicationService } from 'linda-core';

/**
 * Asks a group admin for the room secret.
 *
 * Failure is logged, never thrown: the member row is already written by the
 * time this runs, so aborting the join would leave the user half-joined with no
 * way to retry.
 */
export const requestGroupSecret = async (
  communicationService: CommunicationService | null,
  adminPub: string | undefined,
  groupId: string,
): Promise<void> => {
  if (!communicationService || !adminPub) return;
  try {
    await communicationService.sendMessage(
      adminPub,
      JSON.stringify({ type: 'GROUP_JOIN_REQUEST', groupId }),
      'GROUP_JOIN_REQUEST',
    );
  } catch (e) {
    console.warn('[Group] Failed to request room secret from admin:', e);
  }
};

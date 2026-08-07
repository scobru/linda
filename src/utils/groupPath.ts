/**
 * Returns true if the given ID represents a group (UUID-style or PEN !-prefixed).
 * Use this instead of inline heuristics to keep detection consistent.
 */
export function isGroupId(id: string): boolean {
  if (!id) return false;
  return (id.length === 36 && id.includes("-")) || id.startsWith("!");
}

export function groupPath(groupId: string): string {
  if (!groupId) return "";
  return groupId.startsWith("!") ? groupId : `linda_rooms/${groupId}`;
}

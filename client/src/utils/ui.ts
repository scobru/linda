export const getInitial = (name?: string) => {
  if (!name) return "?";
  // Handle UUIDs/Pubkeys by taking first char
  if (name.length > 20 && !name.startsWith("@")) return name.charAt(0).toUpperCase();
  // Handle @usernames
  if (name.startsWith("@")) return name.charAt(1).toUpperCase();
  return name.charAt(0).toUpperCase();
};

export const formatUserName = (id: string, profile?: { nickname?: string; uniqueUsername?: string }) => {
  if (profile?.nickname) return profile.nickname;
  if (profile?.uniqueUsername) return profile.uniqueUsername;
  if (id.length > 15) return `${id.slice(0, 8)}...${id.slice(-4)}`;
  return id;
};

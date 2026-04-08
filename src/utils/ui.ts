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

export const shortenLink = (url: string, maxLength: number = 40): string => {
  if (!url) return "";
  if (url.length <= maxLength) return url;

  if (url.startsWith("magnet:?")) {
    const nameMatch = url.match(/dn=([^&]+)/);
    if (nameMatch) {
      try {
        const name = decodeURIComponent(nameMatch[1].replace(/\+/g, " "));
        return `🧲 ${name}`;
      } catch (e) {
        // Fallback if decoding fails
      }
    }
    // Fallback: show start of hash if no name
    const xtMatch = url.match(/xt=urn:btih:([^&]+)/);
    if (xtMatch) {
      return `🧲 Magnet [${xtMatch[1].slice(0, 8)}...]`;
    }
    return `🧲 Magnet [${url.slice(0, 20)}...]`;
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    // If it's a very long URL, show domain + start of path
    if (domain.length + 10 < maxLength) {
      const remaining = maxLength - domain.length - 3;
      return `${domain}/${urlObj.pathname.slice(0, remaining)}...`;
    }
    return `${domain}...`;
  } catch (e) {
    // If not a valid URL (e.g. some custom protocol), just truncate
    return url.slice(0, maxLength) + "...";
  }
};

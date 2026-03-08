const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf8');

const hook = `
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) {
      counts[c] = (messages[c] || []).filter(
        (m) => m.sender === c && m.status !== "read"
      ).length;
    }
    return counts;
  }, [messages, contacts]);
`;

content = content.replace(hook, '');
content = content.replace('  // ── Loading screen ─────────────────────────────────────────────', hook + '\n  // ── Loading screen ─────────────────────────────────────────────');

fs.writeFileSync('client/src/App.tsx', content);

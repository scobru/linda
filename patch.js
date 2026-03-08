const fs = require('fs');

let content = fs.readFileSync('client/src/App.tsx', 'utf8');

const search = `                  {(() => {
                    const unreadCount = (messages[c] || []).filter(
                      (m) => m.sender === c && m.status !== "read",
                    ).length;
                    return unreadCount > 0 ? (
                      <span
                        className="unread-badge"
                        style={{
                          background: "var(--color-primary)",
                          color: "#000",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          padding: "2px 8px",
                          borderRadius: "12px",
                        }}
                      >
                        {unreadCount}
                      </span>
                    ) : null;
                  })()}`;

const replacement = `                  {unreadCounts[c] > 0 ? (
                    <span
                      className="unread-badge"
                      style={{
                        background: "var(--color-primary)",
                        color: "#000",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        padding: "2px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      {unreadCounts[c]}
                    </span>
                  ) : null}`;

content = content.replace(search, replacement);

fs.writeFileSync('client/src/App.tsx', content);

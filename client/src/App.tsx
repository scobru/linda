import React, { useState, useEffect, useRef } from "react";
import { SignalService } from "./SignalService";
import Gun from "gun";
import "gun/sea";
import { DataBase } from "shogun-core";

interface Message {
  sender: string;
  text: string;
  timestamp: Date;
}

// Connect to our local GunDB relay
const gun = Gun({ peers: ["http://localhost:3001/gun"] });
const db = new DataBase(gun);

const App: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [contacts, setContacts] = useState<string[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [signalService, setSignalService] = useState<SignalService | null>(
    null,
  );
  const [notification, setNotification] = useState<{
    msg: string;
    type: "info" | "error";
  } | null>(null);

  // Track which GunDB message keys we already processed so we never
  // feed the same ciphertext to the Signal ratchet twice (Bad MAC).
  const processedRef = useRef<Set<string>>(new Set());

  const showNotification = (msg: string, type: "info" | "error" = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ── Load saved state from localStorage ────────────────────────

  const loadSavedMessages = (user: string) => {
    try {
      const raw = localStorage.getItem(`chat_messages_${user}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const contact in parsed) {
          parsed[contact] = parsed[contact].map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
        }
        setMessages(parsed);
        setContacts(Object.keys(parsed));
      }
    } catch (e) {
      console.error("Failed to load saved messages", e);
    }
  };

  const loadProcessedKeys = (user: string) => {
    try {
      const raw = localStorage.getItem(`processed_keys_${user}`);
      if (raw) {
        processedRef.current = new Set(JSON.parse(raw));
      }
    } catch (e) {
      processedRef.current = new Set();
    }
  };

  const saveMessages = (user: string, msgs: Record<string, Message[]>) => {
    localStorage.setItem(`chat_messages_${user}`, JSON.stringify(msgs));
  };

  const saveProcessedKey = (user: string, key: string) => {
    processedRef.current.add(key);
    localStorage.setItem(
      `processed_keys_${user}`,
      JSON.stringify(Array.from(processedRef.current)),
    );
  };

  // ── GunDB inbox listener ──────────────────────────────────────

  useEffect(() => {
    if (!isRegistered || !username || !signalService) return;

    // Load saved chat history and processed keys
    loadSavedMessages(username);
    loadProcessedKeys(username);

    signalService
      .getMyPubKey()
      .then((myPubKey) => {
        gun
          .get(`signal_inbox_${myPubKey}`)
          .map()
          .on(async (data: any, gunKey: string) => {
            // Filter out Gun metadata and invalid payloads
            if (!data || typeof data !== "object") return;
            if (!data.sender || !data.body || !data.type) return;

            // CRITICAL: skip already-processed messages to avoid Bad MAC
            if (processedRef.current.has(gunKey)) return;
            saveProcessedKey(username, gunKey);

            try {
              const plaintext = await signalService.decryptMessage(
                data.sender,
                { type: data.type, body: data.body },
              );

              setMessages((prev) => {
                const updated = {
                  ...prev,
                  [data.sender]: [
                    ...(prev[data.sender] || []),
                    {
                      sender: data.sender,
                      text: plaintext,
                      timestamp: new Date(data.timestamp || Date.now()),
                    },
                  ],
                };
                saveMessages(username, updated);
                return updated;
              });

              setContacts((prev) =>
                prev.includes(data.sender) ? prev : [...prev, data.sender],
              );
            } catch (e: any) {
              console.error("Decryption failed:", e.message);
            }
          });
      })
      .catch((err) => console.error("Could not get pubkey for inbox", err));
  }, [isRegistered, username, signalService]);

  // ── Auth handlers ─────────────────────────────────────────────

  const handleRegister = async () => {
    if (!username || !password) {
      showNotification("Username and password are required", "error");
      return;
    }
    try {
      const service = new SignalService(gun, db);
      await service.register(username, password);
      setSignalService(service);
      setIsRegistered(true);
      showNotification("Registered! Signal keys generated & published.");
    } catch (e: any) {
      console.error("Registration failed:", e);
      showNotification(`Registration failed: ${e.message}`, "error");
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      showNotification("Username and password are required", "error");
      return;
    }
    try {
      const service = new SignalService(gun, db);
      await service.login(username, password);
      setSignalService(service);
      setIsRegistered(true);
      showNotification("Login successful!");
    } catch (e: any) {
      console.error("Login failed:", e);
      showNotification(`Login failed: ${e.message}`, "error");
    }
  };

  // ── Send message ──────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!recipient || !message || !signalService) return;

    try {
      const ciphertext = await signalService.encryptMessage(recipient, message);
      const recipientPubKey =
        await signalService.getPubKeyFromUsername(recipient);

      gun.get(`signal_inbox_${recipientPubKey}`).set({
        sender: username,
        type: ciphertext.type,
        body: ciphertext.body,
        timestamp: new Date().toISOString(),
      });

      setMessages((prev) => {
        const updated = {
          ...prev,
          [recipient]: [
            ...(prev[recipient] || []),
            { sender: "Me", text: message, timestamp: new Date() },
          ],
        };
        saveMessages(username, updated);
        return updated;
      });

      setContacts((prev) =>
        prev.includes(recipient) ? prev : [...prev, recipient],
      );
      setMessage("");
    } catch (e: any) {
      console.error("Send failed:", e);
      showNotification(`Send failed: ${e.message}`, "error");
    }
  };

  // ── Login screen ──────────────────────────────────────────────

  if (!isRegistered) {
    return (
      <div style={styles.container}>
        {notification && (
          <div
            style={{
              ...styles.notification,
              backgroundColor:
                notification.type === "error" ? "#ff4444" : "#4CAF50",
            }}
          >
            {notification.msg}
          </div>
        )}
        <div style={styles.loginCard}>
          <h2 style={{ textAlign: "center", margin: 0 }}>🔐 Signal Beta</h2>
          <p style={{ color: "#888", fontSize: "0.85em", textAlign: "center" }}>
            GunDB + SEA + E2EE (Signal Protocol)
          </p>
          <input
            style={styles.input}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={{ ...styles.button, flex: 1 }} onClick={handleLogin}>
              Login
            </button>
            <button
              style={{ ...styles.button, flex: 1, backgroundColor: "#28a745" }}
              onClick={handleRegister}
            >
              Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat screen ───────────────────────────────────────────────

  const currentMessages = messages[recipient] || [];

  return (
    <div style={styles.appLayout}>
      {notification && (
        <div
          style={{
            ...styles.notification,
            backgroundColor:
              notification.type === "error" ? "#ff4444" : "#4CAF50",
          }}
        >
          {notification.msg}
        </div>
      )}

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <h3 style={{ padding: "0 20px" }}>Contacts</h3>
        <div style={styles.contactList}>
          {contacts.map((c) => (
            <div
              key={c}
              style={{
                ...styles.contactItem,
                backgroundColor: recipient === c ? "#e0e0e0" : "transparent",
              }}
              onClick={() => setRecipient(c)}
            >
              {c}
            </div>
          ))}
          <div style={{ padding: "10px 20px" }}>
            <input
              style={{ ...styles.input, fontSize: "0.8em" }}
              placeholder="+ Add contact username"
              onKeyDown={(e: any) => {
                if (e.key === "Enter" && e.target.value.trim()) {
                  const name = e.target.value.trim();
                  setContacts((prev) =>
                    prev.includes(name) ? prev : [...prev, name],
                  );
                  setRecipient(name);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div style={styles.chatArea}>
        <div style={styles.chatHeader}>
          <h3>{recipient ? `Chat with ${recipient}` : "Select a contact"}</h3>
        </div>

        <div style={styles.messageBox}>
          {currentMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.messageWrapper,
                alignSelf: msg.sender === "Me" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  ...styles.messageBubble,
                  backgroundColor: msg.sender === "Me" ? "#007bff" : "#f0f0f0",
                  color: msg.sender === "Me" ? "white" : "black",
                }}
              >
                {msg.text}
              </div>
              <div
                style={{ fontSize: "0.7em", color: "#999", marginTop: "2px" }}
              >
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        {recipient && (
          <div style={styles.inputArea}>
            <input
              style={styles.chatInput}
              placeholder="Type your secure message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <button style={styles.sendButton} onClick={handleSendMessage}>
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Styles ─────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "100vh",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    fontFamily: "sans-serif",
  },
  loginCard: {
    padding: "40px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    width: "320px",
  },
  input: {
    padding: "12px",
    marginBottom: "12px",
    borderRadius: "6px",
    border: "1px solid #ddd",
    fontSize: "1em",
  },
  button: {
    padding: "12px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "1em",
  },
  appLayout: {
    display: "flex",
    height: "100vh",
    backgroundColor: "white",
    fontFamily: "sans-serif",
  },
  sidebar: {
    width: "260px",
    borderRight: "1px solid #eee",
    backgroundColor: "#f9f9f9",
    display: "flex",
    flexDirection: "column",
  },
  contactList: { flex: 1, overflowY: "auto" },
  contactItem: {
    padding: "15px 20px",
    cursor: "pointer",
    borderBottom: "1px solid #f0f0f0",
    transition: "0.2s",
  },
  chatArea: { flex: 1, display: "flex", flexDirection: "column" },
  chatHeader: { padding: "10px 20px", borderBottom: "1px solid #eee" },
  messageBox: {
    flex: 1,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    backgroundColor: "#fff",
  },
  messageWrapper: {
    marginBottom: "15px",
    maxWidth: "70%",
    display: "flex",
    flexDirection: "column",
  },
  messageBubble: {
    padding: "10px 15px",
    borderRadius: "18px",
    fontSize: "0.95em",
    wordBreak: "break-word",
  },
  inputArea: {
    padding: "20px",
    borderTop: "1px solid #eee",
    display: "flex",
    gap: "10px",
  },
  chatInput: {
    flex: 1,
    padding: "12px",
    borderRadius: "24px",
    border: "1px solid #ddd",
    outline: "none",
  },
  sendButton: {
    padding: "10px 20px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "24px",
    cursor: "pointer",
  },
  notification: {
    position: "fixed",
    top: "20px",
    right: "20px",
    padding: "10px 20px",
    color: "white",
    borderRadius: "4px",
    zIndex: 1000,
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
  },
};

export default App;

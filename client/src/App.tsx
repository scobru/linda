import React, { useState, useEffect, useRef } from "react";
import { SignalService } from "./SignalService";
import Gun from "gun";
import "gun/sea";
import { DataBase } from "shogun-core";
import "./App.css";

interface Message {
  sender: string;
  text: string;
  timestamp: Date;
}

// Connect to our local GunDB relay
const gun = Gun({ peers: ["http://localhost:3001/gun"], localStorage: false });
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
  const [isLoading, setIsLoading] = useState(true);

  // Track which GunDB message keys we already processed so we never
  // feed the same ciphertext to the Signal ratchet twice (Bad MAC).
  const processedRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showNotification = (msg: string, type: "info" | "error" = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ── Auto-login: recall GunDB session on mount ─────────────────

  useEffect(() => {
    const tryAutoLogin = async () => {
      try {
        const service = new SignalService(gun, db);
        const recalledUser = await service.sessionRecall();
        if (recalledUser) {
          setUsername(recalledUser);
          setSignalService(service);
          setIsRegistered(true);
          showNotification(`Welcome back, ${recalledUser}!`);
        }
      } catch (e) {
        console.error("[AutoLogin] Session recall failed:", e);
      } finally {
        setIsLoading(false);
      }
    };
    tryAutoLogin();
  }, []);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, recipient]);

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

  // ── Helper: get initial letter for avatar ─────────────────────
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  // ── Loading screen ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="login-container">
        <div
          className="login-card"
          style={{ alignItems: "center", gap: "16px" }}
        >
          <div className="chat-empty-icon">🔐</div>
          <h2 className="login-title">Signal</h2>
          <p className="login-subtitle">Restoring session...</p>
        </div>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────

  if (!isRegistered) {
    return (
      <div className="login-container">
        {notification && (
          <div
            className={`notification ${notification.type === "error" ? "notification--error" : "notification--success"}`}
          >
            {notification.msg}
          </div>
        )}
        <div className="login-card">
          <h2 className="login-title">🔐 Signal</h2>
          <p className="login-subtitle">
            End-to-End Encrypted · GunDB + Signal Protocol
          </p>
          <input
            className="login-input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="login-actions">
            <button className="btn btn--primary" onClick={handleLogin}>
              Login
            </button>
            <button className="btn btn--secondary" onClick={handleRegister}>
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
    <div className="app-layout">
      {notification && (
        <div
          className={`notification ${notification.type === "error" ? "notification--error" : "notification--success"}`}
        >
          {notification.msg}
        </div>
      )}

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{getInitial(username)}</div>
          <div>
            <div className="sidebar-user-name">{username}</div>
            <div className="sidebar-user-status">Online</div>
          </div>
        </div>

        <div className="sidebar-header">
          <span className="sidebar-title">Conversations</span>
        </div>

        <div className="contact-list">
          {contacts.map((c) => (
            <div
              key={c}
              className={`contact-item ${recipient === c ? "contact-item--active" : ""}`}
              onClick={() => setRecipient(c)}
            >
              <div className="contact-avatar">{getInitial(c)}</div>
              <span className="contact-name">{c}</span>
            </div>
          ))}
        </div>

        <div className="add-contact-wrapper">
          <input
            className="add-contact-input"
            placeholder="＋ Add contact..."
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

      {/* Chat area */}
      <div className="chat-area">
        <div className="chat-header">
          {recipient ? (
            <>
              <div className="chat-header-avatar">{getInitial(recipient)}</div>
              <div className="chat-header-info">
                <h3 className="chat-header-name">{recipient}</h3>
                <div className="chat-header-badge">🔒 End-to-End Encrypted</div>
              </div>
            </>
          ) : (
            <h3 className="chat-header-placeholder">
              Select a conversation to start chatting
            </h3>
          )}
        </div>

        {recipient ? (
          <>
            <div className="message-box">
              {currentMessages.length === 0 && (
                <div className="chat-empty">
                  <div className="chat-empty-icon">💬</div>
                  <div className="chat-empty-text">No messages yet</div>
                  <div className="chat-empty-sub">
                    Send a secure message to {recipient}
                  </div>
                </div>
              )}
              {currentMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`message-wrapper ${msg.sender === "Me" ? "message-wrapper--sent" : "message-wrapper--received"}`}
                >
                  <div
                    className={`message-bubble ${msg.sender === "Me" ? "message-bubble--sent" : "message-bubble--received"}`}
                  >
                    {msg.text}
                  </div>
                  <div className="message-time">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <input
                className="chat-input"
                placeholder="Type your secure message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button className="send-button" onClick={handleSendMessage}>
                ➤
              </button>
            </div>
          </>
        ) : (
          <div className="chat-empty">
            <div className="chat-empty-icon">🔐</div>
            <div className="chat-empty-text">Signal Secure Messenger</div>
            <div className="chat-empty-sub">
              Select a contact or add a new one to start an encrypted
              conversation
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

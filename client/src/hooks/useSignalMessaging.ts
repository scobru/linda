import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DataBase } from "shogun-core";
import { SignalService } from "../SignalService";
import { GroupService, type GroupInfo } from "../GroupService";
import { generateSecureRandomString } from "../utils/crypto";

export interface Message {
  id: string;
  sender: string;
  senderPub?: string;
  text: string;
  timestamp: Date;
  status: "sending" | "sent" | "delivered" | "read";
}

export const useSignalMessaging = (
  db: DataBase,
  userPub: string | null,
  signalService: SignalService | null,
  groupService: GroupService | null,
  recipient: string,
  setRecipient: (id: string) => void
) => {
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [contacts, setContacts] = useState<string[]>([]);
  const [typingStatuses, setTypingStatuses] = useState<Record<string, number>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, boolean>>({});
  const [deletedMessages, setDeletedMessages] = useState<Record<string, Set<string>>>({});
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, Set<string>>>({});
  
  const processedRef = useRef<Set<string>>(new Set());
  const resetsRef = useRef<Set<string>>(new Set());
  const lastTypingSentRef = useRef<number>(0);
  const recipientRef = useRef(recipient);
  const groupSubscriptionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    recipientRef.current = recipient;
  }, [recipient]);

  const saveMessages = useCallback((user: string, msgs: Record<string, Message[]>) => {
    localStorage.setItem(`chat_messages_${user}`, JSON.stringify(msgs));
  }, []);

  const loadSavedMessages = useCallback((user: string) => {
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
  }, []);

  const saveProcessedKey = useCallback((user: string, key: string) => {
    processedRef.current.add(key);
    localStorage.setItem(
      `processed_keys_${user}`,
      JSON.stringify(Array.from(processedRef.current)),
    );
  }, []);

  const loadProcessedKeys = useCallback((user: string) => {
    try {
      const raw = localStorage.getItem(`processed_keys_${user}`);
      if (raw) {
        processedRef.current = new Set(JSON.parse(raw));
      }
    } catch (e) {
      processedRef.current = new Set();
    }
  }, []);

  const saveContact = useCallback((contactId: string) => {
    if (!userPub || !db.gun) return;
    db.gun.get(`signal_v3_contacts_${userPub}`).get(contactId).put(true as any);
  }, [userPub, db]);

  const removeContact = useCallback((contactId: string) => {
    if (!userPub || !db.gun) return;
    db.gun.get(`signal_v3_contacts_${userPub}`).get(contactId).put(null as any);
  }, [userPub, db]);

  // ── Initialization Logic ──
  useEffect(() => {
    if (!userPub) return;
    loadSavedMessages(userPub);
    loadProcessedKeys(userPub);

    db.gun
      .get(`signal_v3_contacts_${userPub}`)
      .map()
      .on((data: any, contactId: string) => {
        if (data === true) {
          setContacts((prev) => (prev.includes(contactId) ? prev : [...prev, contactId]));
        } else if (data === null) {
          setContacts((prev) => prev.filter((c) => c !== contactId));
        }
      });
  }, [userPub, db, loadSavedMessages, loadProcessedKeys]);

  // ── Typing Listeners ──
  useEffect(() => {
    if (!userPub) return;

    db.gun
      .get(`signal_v2_typing_${userPub}`)
      .map()
      .on((data: any, senderPubKey: string) => {
        if (!data || typeof data !== "object" || Array.isArray(data)) return;
        if (data.typing && data.ts) {
          const now = Date.now();
          const parsedTs = typeof data.ts === "string" ? parseInt(data.ts, 10) : Number(data.ts);
          if (isNaN(parsedTs) || parsedTs > now + 3600000) return;

          setTypingStatuses((prev) => ({ ...prev, [senderPubKey]: parsedTs }));
        }
      });

    const interval = setInterval(() => {
      const now = Date.now();
      setTypingStatuses((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [pub, ts] of Object.entries(next)) {
          if (now - ts > 4000) {
            delete next[pub];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      clearInterval(interval);
      // Gun listeners cleanup isn't straightforward without .off(), but .map().on() is usually fine
    };
  }, [userPub, db]);

  // ── Group Messaging ──
  useEffect(() => {
    if (!groupService || contacts.length === 0) return;

    contacts.forEach(async (contactId) => {
      if (contactId.length !== 36 || !contactId.includes("-") || groupSubscriptionsRef.current.has(contactId)) return;
      groupSubscriptionsRef.current.add(contactId);
      
      try {
        const meta = await (db.Get as any)(`signal_rooms/${contactId}/meta`) as GroupInfo;
        if (!meta || !meta.secret) return;

        db.gun.get(`signal_rooms/${contactId}/messages`).map().on(async (data: any, gunKey: string) => {
          if (!data || typeof data !== "object" || !data.body || !data.sender) return;
          if (processedRef.current.has(gunKey)) return;
          if (userPub) saveProcessedKey(userPub, gunKey);

          try {
            const plaintext = await groupService.decryptGroupMessage(meta.secret, data.body);
            const isMe = data.sender === userPub;
            const remoteMsgId = data.msgId || gunKey;

            setMessages((prev) => {
              const groupMsgs = prev[contactId] || [];
              const isDuplicate = groupMsgs.some(
                (m) =>
                  m.id === remoteMsgId ||
                  (m.sender === (isMe ? "Me" : data.sender) &&
                    m.text === plaintext &&
                    Math.abs(m.timestamp.getTime() - new Date(data.timestamp || Date.now()).getTime()) < 10000)
              );
              if (isDuplicate) {
                // Update status of existing message if found by ID
                if (groupMsgs.some(m => m.id === remoteMsgId)) {
                   const updatedGroupMsgs = groupMsgs.map(m => m.id === remoteMsgId ? { ...m, status: "delivered" as const } : m);
                   return { ...prev, [contactId]: updatedGroupMsgs };
                }
                return prev;
              }

              const updatedMessages = [
                ...groupMsgs,
                {
                  id: remoteMsgId,
                  sender: isMe ? "Me" : data.sender,
                  senderPub: data.sender,
                  text: plaintext,
                  timestamp: new Date(data.timestamp || Date.now()),
                  status: "delivered" as const,
                },
              ];

              const updated = { ...prev, [contactId]: updatedMessages };
              if (userPub) saveMessages(userPub, updated);
              return updated;
            });

            if (!isMe && (recipientRef.current !== contactId || document.visibilityState !== "visible")) {
              new Notification(`New message in ${meta.name}`, {
                body: plaintext.substring(0, 50),
                icon: meta.avatar || "/logo.svg"
              });
            }
          } catch (e) {
            console.warn(`[Groups] Failed to decrypt message in ${contactId}:`, e);
          }
        });

        db.gun.get(`signal_rooms/${contactId}/deleted_messages`).map().on((data: any, msgId: string) => {
          if (data) {
            setDeletedMessages(prev => {
              const groupDeletions = new Set(prev[contactId] || []);
              groupDeletions.add(msgId);
              return { ...prev, [contactId]: groupDeletions };
            });
          }
        });

        db.gun.get(`signal_rooms/${contactId}/pins`).map().on((ts: any, msgId: string) => {
          setPinnedMessages(prev => {
            const groupPins = new Set(prev[contactId] || []);
            if (ts) groupPins.add(msgId);
            else groupPins.delete(msgId);
            return { ...prev, [contactId]: groupPins };
          });
        });

      } catch (err) {
        console.warn(`[Groups] Failed to start listener for ${contactId}:`, err);
      }
    });
  }, [contacts, groupService, db, userPub, saveMessages, saveProcessedKey]);

  // ── Signal 1:1 Messaging (Inbox) ──
  useEffect(() => {
    if (!signalService || !userPub) return;
    const sessionStartTime = Date.now();
    const pendingResets = new Set<string>();

    db.gun.get(`signal_v3_inbox_${userPub}`).map().on(async (data: any, gunKey: string) => {
      if (!data || typeof data !== "object") return;
      if (!data.sender || !data.body || !data.type) return;
      if (processedRef.current.has(gunKey)) return;

      try {
        await signalService.waitReady();
        if (userPub) saveProcessedKey(userPub, gunKey);

        const msgTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
        const isFreshMessage = msgTime > sessionStartTime - 30000;
        let senderPubKey = data.sender;
        
        if (senderPubKey.length < 30) {
          try {
            senderPubKey = await signalService.getPubKeyFromUsername(data.sender);
          } catch (err) {
            console.warn("Could not resolve sender pubkey:", data.sender);
          }
        }

        try {
          const plaintext = await signalService.decryptMessage(senderPubKey, {
            type: data.type,
            body: data.body,
          });

          setContactErrors((prev) => ({ ...prev, [senderPubKey]: false }));

          if (plaintext === "PING_HEAL") return;

          if (plaintext.startsWith("RECEIPT_")) {
            const parts = plaintext.split("_");
            if (parts.length >= 3) {
              const status = parts[1] as "delivered" | "read";
              const msgId = parts.slice(2).join("_");

              setMessages((prev) => {
                const userMsgs = prev[senderPubKey] || [];
                const updated = userMsgs.map((m) =>
                  m.id === msgId && (m.status === "sent" || (m.status === "delivered" && status === "read"))
                    ? { ...m, status }
                    : m
                );
                const state = { ...prev, [senderPubKey]: updated };
                if (userPub) saveMessages(userPub, state);
                return state;
              });
            }
            return;
          }

          const msgId = data.msgId || gunKey;

          if (isFreshMessage) {
            if (typeof window !== "undefined") {
              try {
                new Audio("/notification.mp3").play().catch(() => {});
              } catch (e) {}
            }

            if (
              (recipientRef.current !== senderPubKey || document.visibilityState !== "visible") &&
              typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
            ) {
              const title = `New message from ${senderPubKey.slice(0, 8)}...`;
              const notification = new Notification(title, {
                body: plaintext.substring(0, 50),
              });
              notification.onclick = () => {
                window.focus();
                setRecipient(senderPubKey);
                notification.close();
              };
            }
          }

          // Send receipt
          try {
            const receiptCipher = await signalService.encryptMessage(senderPubKey, `RECEIPT_delivered_${msgId}`);
            await db.Set(`signal_v3_inbox_${senderPubKey}`, {
              sender: userPub,
              type: receiptCipher.type,
              body: receiptCipher.body,
              timestamp: new Date().toISOString(),
            } as any);
          } catch (e) {}

          setMessages((prev) => {
            const userMsgs = prev[senderPubKey] || [];
            const isDuplicate = userMsgs.some(
              (m) =>
                m.id === msgId ||
                (m.sender === senderPubKey &&
                  m.text === plaintext &&
                  Math.abs(m.timestamp.getTime() - new Date(data.timestamp || Date.now()).getTime()) < 10000)
            );

            if (isDuplicate) {
               if (userMsgs.some(m => m.id === msgId)) {
                 const updatedUserMsgs = userMsgs.map(m => m.id === msgId ? { ...m, status: "delivered" as const } : m);
                 return { ...prev, [senderPubKey]: updatedUserMsgs };
               }
               return prev;
            }

            const updated = {
              ...prev,
              [senderPubKey]: [
                ...userMsgs,
                {
                  id: msgId,
                  sender: senderPubKey,
                  text: plaintext,
                  timestamp: new Date(data.timestamp || Date.now()),
                  status: "delivered" as const,
                },
              ],
            };
            if (userPub) saveMessages(userPub, updated);
            return updated;
          });

          setContacts((prev) => (prev.includes(senderPubKey) ? prev : [...prev, senderPubKey]));

        } catch (e: any) {
          if (!isFreshMessage) return;
          console.error(`Decryption failed for ${senderPubKey}:`, e.message);

          if (!resetsRef.current.has(senderPubKey) && !pendingResets.has(senderPubKey)) {
            pendingResets.add(senderPubKey);
            resetsRef.current.add(senderPubKey);
            try {
              await signalService.resetSession(senderPubKey);
              const pingCipher = await signalService.encryptMessage(senderPubKey, "PING_HEAL");
              db.Set(`signal_v3_inbox_${senderPubKey}`, {
                sender: userPub,
                type: pingCipher.type,
                body: pingCipher.body,
                timestamp: new Date().toISOString(),
              } as any);
            } catch (resetErr) {}
          } else {
            setContactErrors((prev) => ({ ...prev, [senderPubKey]: true }));
          }
        }
      } catch (e) {}
    });
  }, [userPub, signalService, db, saveMessages, saveProcessedKey, setRecipient]);

  // ── Actions ──
  const handleTyping = useCallback(async () => {
    if (!recipient || !userPub || !signalService) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      try {
        const isGroup = recipient.length === 36 && recipient.includes("-");
        let path = `signal_v2_typing_${recipient}`;
        if (!isGroup) {
          const pub = recipient.length < 30 ? await signalService.getPubKeyFromUsername(recipient) : recipient;
          path = `signal_v2_typing_${pub}`;
        }
        db.gun.get(path).get(userPub).put({ typing: true, ts: now.toString(), s: generateSecureRandomString(4) } as any);
      } catch (e) {}
    }
  }, [recipient, userPub, signalService, db]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!recipient || !message || !signalService || !userPub || !groupService) return;
    try {
      const isGroup = recipient.length === 36 && recipient.includes("-");
      let msgId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + generateSecureRandomString(10);
      let ciphertext: any;

      if (isGroup) {
        const canSend = await groupService.canPerform(recipient, "send_message");
        if (!canSend) {
           throw new Error("You do not have permission to send messages in this group");
        }
        
        const myRole = await groupService.getMemberRole(recipient, userPub);
        if (!myRole) throw new Error("Not a member");
        const meta = await (db.Get as any)(`signal_rooms/${recipient}/meta`);
        ciphertext = await groupService.encryptGroupMessage(meta.secret, message);
        await db.Set(`signal_rooms/${recipient}/messages`, { msgId, sender: userPub, body: ciphertext, timestamp: new Date().toISOString(), type: 'group' } as any);
      } else {
        try {
          ciphertext = await signalService.encryptMessage(recipient, message);
        } catch (err) {
          await signalService.resetSession(recipient);
          ciphertext = await signalService.encryptMessage(recipient, message);
        }
        const pub = recipient.length < 30 ? await signalService.getPubKeyFromUsername(recipient) : recipient;
        await db.Set(`signal_v3_inbox_${pub}`, { msgId, sender: userPub, type: ciphertext.type, body: ciphertext.body, timestamp: new Date().toISOString() } as any);
      }

      setContactErrors((prev) => ({ ...prev, [recipient]: false }));
      setMessages((prev) => {
        const currentMsgs = prev[recipient] || [];
        // Check if message was already added by the listener (happens with GunDB local priority)
        if (currentMsgs.some(m => m.id === msgId)) return prev;
        
        const next = { ...prev, [recipient]: [...currentMsgs, { id: msgId, sender: "Me", senderPub: userPub, text: message, timestamp: new Date(), status: "sent" as const }] };
        saveMessages(userPub, next);
        return next;
      });
      setContacts((prev) => (prev.includes(recipient) ? prev : [...prev, recipient]));
    } catch (err) {
      console.error("Send failed:", err);
      throw err;
    }
  }, [recipient, signalService, userPub, groupService, db, saveMessages]);

  const currentMessages = useMemo(() => {
    const msgs = messages[recipient] || [];
    const deletions = deletedMessages[recipient] || new Set();
    return msgs.filter(m => !deletions.has(m.id));
  }, [messages, recipient, deletedMessages]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) {
      counts[c] = (messages[c] || []).filter((m) => m.sender === c && m.status !== "read").length;
    }
    return counts;
  }, [messages, contacts]);

  return {
    messages,
    setMessages,
    contacts,
    setContacts,
    typingStatuses,
    contactErrors,
    setContactErrors,
    deletedMessages,
    pinnedMessages,
    currentMessages,
    unreadCounts,
    handleTyping,
    handleSendMessage,
    saveContact,
    removeContact,
    saveMessages
  };
};

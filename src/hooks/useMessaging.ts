import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DataBase } from "shogun-core";
import { CommunicationService } from "../CommunicationService";
import { GroupService, type GroupInfo } from "../GroupService";
import { generateSecureRandomString } from "../utils/crypto";

export interface FileMetadata {
  name: string;
  size: number;
  hash: string;
  mimeType: string;
  id: string; // Internal file transfer ID
  status: 'offered' | 'incoming' | 'transferring' | 'completed' | 'failed';
  method?: 'webrtc' | 'wormhole';
  wormholeCode?: string;
}

export interface Message {
  id: string;
  gunKey?: string; // Original GunDB ID for deletion
  sender: string;
  senderPub?: string;
  text?: string;
  audio?: string; // Base64
  fileMetadata?: FileMetadata;
  tags?: string[]; // Added for note-taking and filtering
  type: "text" | "audio" | "call_signal" | "file" | "image";
  timestamp: Date;
  status: "sending" | "sent" | "delivered" | "read";
}

export const useMessaging = (
  db: DataBase,
  userPub: string | null,
  communicationService: CommunicationService | null,
  groupService: GroupService | null,
  recipient: string,
  setRecipient: (id: string) => void
) => {
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [contacts, setContacts] = useState<string[]>([]);
  const [trustedContacts, setTrustedContacts] = useState<Set<string>>(new Set());
  const [isContactsLoading, setIsContactsLoading] = useState(true);
  const [blockedContacts, setBlockedContacts] = useState<Set<string>>(new Set());
  const [typingStatuses, setTypingStatuses] = useState<Record<string, number>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, boolean>>({});
  const [deletedMessages, setDeletedMessages] = useState<Record<string, Set<string>>>({});
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, Set<string>>>({});
  
  const processedRef = useRef<Set<string>>(new Set());
  const resetsRef = useRef<Set<string>>(new Set());
  const blockedContactsRef = useRef<Set<string>>(new Set());
  const lastTypingSentRef = useRef<number>(0);
  const recipientRef = useRef(recipient);
  const groupSubscriptionsRef = useRef<Set<string>>(new Set());
  const messageQueueRef = useRef<Record<string, Promise<void>>>({});
  const unreadCountsCache = useRef<Record<string, number>>({});
  const lastMessagesRef = useRef<Record<string, Message[]>>({});

  useEffect(() => {
    recipientRef.current = recipient;
  }, [recipient]);

  const saveMessages = useCallback(
    (user: string, msgs: Record<string, Message[]>) => {
      localStorage.setItem(`chat_messages_${user}`, JSON.stringify(msgs));
    },
    [],
  );

  const saveDeletedMessages = useCallback(
    (user: string, deleted: Record<string, Set<string>>) => {
      const serializable: Record<string, string[]> = {};
      for (const contact in deleted) {
        serializable[contact] = Array.from(deleted[contact]);
      }
      localStorage.setItem(
        `deleted_messages_${user}`,
        JSON.stringify(serializable),
      );
    },
    [],
  );

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

  const loadSavedDeletedMessages = useCallback((user: string) => {
    try {
      const raw = localStorage.getItem(`deleted_messages_${user}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next: Record<string, Set<string>> = {};
        for (const contact in parsed) {
          next[contact] = new Set(parsed[contact]);
        }
        setDeletedMessages(next);
      }
    } catch (e) {
      console.warn("Failed to load saved deleted messages", e);
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
    loadSavedDeletedMessages(userPub);
    loadProcessedKeys(userPub);

    db.gun
      .get(`signal_v3_contacts_${userPub}`)
      .map()
      .on((data: any, contactId: string) => {
        if (data === true) {
          setContacts((prev) => (prev.includes(contactId) ? prev : [...prev, contactId]));
          setTrustedContacts((prev) => new Set(prev).add(contactId));
          setBlockedContacts((prev) => {
            const next = new Set(prev);
            next.delete(contactId);
            blockedContactsRef.current = next;
            return next;
          });
        } else if (data === false) {
          setContacts((prev) => prev.filter((c) => c !== contactId));
          setTrustedContacts((prev) => {
            const next = new Set(prev);
            next.delete(contactId);
            return next;
          });
          setBlockedContacts((prev) => {
            const next = new Set(prev).add(contactId);
            blockedContactsRef.current = next;
            return next;
          });
        } else if (data === null) {
          setContacts((prev) => prev.filter((c) => c !== contactId));
          setTrustedContacts((prev) => {
            const next = new Set(prev);
            next.delete(contactId);
            return next;
          });
          setBlockedContacts((prev) => {
            const next = new Set(prev);
            next.delete(contactId);
            blockedContactsRef.current = next;
            return next;
          });
        }
      });

    // Mark as loaded once the initial fetch from the relay is done
    db.gun.get(`signal_v3_contacts_${userPub}`).once(() => {
        setIsContactsLoading(false);
    });
  }, [userPub, db, loadSavedMessages, loadProcessedKeys]);

  const acceptContact = useCallback(async (contactId: string) => {
    if (!userPub || !db.gun || !communicationService) return;
    console.log(`[Messaging] Accepting contact: ${contactId.slice(0, 8)}`);
    
    // 1. Issue certificate for this user (LoneWolf protocol)
    await communicationService.issueCertificate(contactId);
    
    // 2. Add to trusted contacts in GunDB
    db.gun.get(`signal_v3_contacts_${userPub}`).get(contactId).put(true as any);
  }, [userPub, db, communicationService]);

  const blockContact = useCallback(async (contactId: string) => {
    if (!userPub || !db.gun || !communicationService) return;
    console.log(`[Messaging] Blocking contact: ${contactId.slice(0, 8)}`);
    
    // 1. Revoke certificate
    await communicationService.revokeCertificate(contactId);
    
    // 2. Mark as blocked in contacts list
    db.gun.get(`signal_v3_contacts_${userPub}`).get(contactId).put(false as any);
    
    setRecipient("");
  }, [userPub, db, communicationService, setRecipient]);


  // ── Typing Listeners ──
  useEffect(() => {
    if (!userPub) return;

    db.gun
      .get(`signal_v2_typing_${userPub}`)
      .map()
      .on((data: any, senderPubKey: string) => {
        if (blockedContactsRef.current.has(senderPubKey)) return;
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
      try {
        const meta = await (db.Get as any)(`signal_rooms/${contactId}/meta`) as GroupInfo;
        if (!meta || !meta.secret || (meta as any).err) return;

        groupSubscriptionsRef.current.add(contactId);

        db.gun.get(`signal_rooms/${contactId}/messages`).map().on(async (data: any, gunKey: string) => {
          if (!data || typeof data !== "object" || !data.body || !data.sender) return;
          if (blockedContactsRef.current.has(data.sender)) {
            if (userPub) saveProcessedKey(userPub, gunKey);
            return;
          }
          if (processedRef.current.has(gunKey)) return;

          if (!messageQueueRef.current[contactId]) {
            messageQueueRef.current[contactId] = Promise.resolve();
          }

          messageQueueRef.current[contactId] = messageQueueRef.current[contactId].then(async () => {
            try {
              if (processedRef.current.has(gunKey)) return;
              const plaintext = await groupService.decryptGroupMessage(meta.secret, data.body);
              if (userPub) saveProcessedKey(userPub, gunKey);
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
                    gunKey: gunKey,
                    sender: isMe ? "Me" : data.sender,
                    senderPub: data.sender,
                    text: data.type === 'audio' ? undefined : plaintext,
                    audio: data.type === 'audio' ? plaintext : undefined,
                    type: (data.type as any) || "text",
                    timestamp: new Date(data.timestamp || Date.now()),
                    status: "delivered" as const,
                  },
                ];

                const updated = { ...prev, [contactId]: updatedMessages };
                if (userPub) saveMessages(userPub, updated);
                return updated;
              });

              if (!isMe && (recipientRef.current !== contactId || document.visibilityState !== "visible")) {
                const title = `New message in ${meta.name}`;
                const options = {
                  body: plaintext.substring(0, 50),
                  icon: meta.avatar || "/logo.svg",
                  badge: "/logo.svg",
                  tag: contactId, // unique tag for grouping
                  renotify: true,
                  data: `/chat/${contactId}`
                };

                if ('serviceWorker' in navigator && Notification.permission === 'granted') {
                   navigator.serviceWorker.ready.then(registration => {
                     registration.showNotification(title, options);
                   }).catch(() => {
                      new Notification(title, options);
                   });
                } else if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                   new Notification(title, options);
                }
              }
            } catch (e) {
              console.warn(`[Groups] Failed to decrypt message in ${contactId}:`, e);
            }
          });
        });

        db.gun.get(`signal_rooms/${contactId}/deleted_messages`).map().on((data: any, msgId: string) => {
          if (data) {
            setDeletedMessages((prev) => {
              const groupDeletions = new Set(prev[contactId] || []);
              groupDeletions.add(msgId);
              const next = { ...prev, [contactId]: groupDeletions };
              if (userPub) saveDeletedMessages(userPub, next);
              return next;
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
    if (!communicationService || !userPub) return;
    const sessionStartTime = Date.now();
    const pendingResets = new Set<string>();

    db.gun.get(`signal_v3_inbox_${userPub}`).map().on(async (data: any, gunKey: string) => {
      // 1. Strict Data Validation (Avoid GunDB type errors and malformed nodes)
      if (!data || typeof data !== "object") {
        if (data !== null) console.warn(`[Signal] Skipping non-object inbox data at ${gunKey}:`, data);
        return;
      }
      
      // Basic field requirements for a message
      if (!data.sender || !data.body || data.type === undefined) {
        return;
      }

      const senderPubKeyRaw = data.sender;
      if (processedRef.current.has(gunKey)) return;

      // Check if contact is blocked
      if (blockedContactsRef.current.has(senderPubKeyRaw)) {
        console.log(`[Signal] Ignoring message from blocked contact: ${senderPubKeyRaw.slice(0, 8)}`);
        if (userPub) saveProcessedKey(userPub, gunKey);
        return;
      }

      // Skip self-messages in inbox to prevent duplication in My Cloud
      // When we send to ourselves, the optimistic update in handleSendMessage already added the message.
      // The inbox listener firing again would create a duplicate.
      if (senderPubKeyRaw === userPub) {
        const selfMsgId = data.msgId;
        if (selfMsgId) {
          // Check if we already have this message from the optimistic update
          const existingMsgs = messages[userPub] || [];
          if (existingMsgs.some(m => m.id === selfMsgId)) {
            console.log(`[Signal] Skipping self-message ${selfMsgId} (already in local state via optimistic update)`);
            if (userPub) saveProcessedKey(userPub, gunKey);
            return;
          }
        }
      }

      // DIAGNOSTIC: Log every incoming raw inbox item
      console.log(`[Signal] Raw inbox hit: ${gunKey} from ${senderPubKeyRaw.slice(0, 8)}... (body type: ${typeof data.body})`);

      // Convert timestamp safely
      let messageTimestamp: Date;
      try {
        const rawTs = data.timestamp || Date.now();
        messageTimestamp = new Date(typeof rawTs === 'string' || typeof rawTs === 'number' ? rawTs : Date.now());
        if (isNaN(messageTimestamp.getTime())) messageTimestamp = new Date();
      } catch (e) {
        messageTimestamp = new Date();
      }

      if (processedRef.current.has(gunKey)) return;

      if (!messageQueueRef.current[senderPubKeyRaw]) {
        messageQueueRef.current[senderPubKeyRaw] = Promise.resolve();
      }

      // Chain the message processing to ensure sequential execution per sender
      messageQueueRef.current[senderPubKeyRaw] = messageQueueRef.current[senderPubKeyRaw].then(async () => {
        try {
          if (processedRef.current.has(gunKey)) return;
          
          await communicationService.waitReady();

          const msgTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
          const isFreshMessage = msgTime > sessionStartTime - 30000;
          let senderPubKey = senderPubKeyRaw;
          
          if (senderPubKey.length < 30) {
            try {
              senderPubKey = await communicationService.getPubKeyFromUsername(data.sender);
            } catch (err) {
              console.warn("[Signal] Could not resolve sender pubkey:", data.sender);
            }
          }

          try {
            console.log(`[Signal] Decrypting message ${gunKey} from ${senderPubKey.slice(0, 8)}...`);
            const plaintextValue = await communicationService.decryptMessage(senderPubKey, {
              type: data.type,
              body: data.body,
            });
            
            // Type Safety: Ensure we have a string before proceeding with string methods
            if (plaintextValue === "LEGACY_UNSUPPORTED") {
               if (userPub) saveProcessedKey(userPub, gunKey);
               setMessages((prev) => {
                  const userMsgs = prev[senderPubKey] || [];
                  const msgId = data.msgId || gunKey;
                  if (userMsgs.some(m => m.id === msgId)) return prev;
                  const next = {
                    ...prev,
                    [senderPubKey]: [
                      ...userMsgs,
                      {
                        id: msgId,
                        sender: senderPubKey,
                        text: "📜 [Messaggio del vecchio sistema - non più supportato]",
                        timestamp: messageTimestamp,
                        status: "read" as const,
                        type: "text",
                      },
                    ],
                  };
                  if (userPub) saveMessages(userPub, next);
                  return next;
               });
               return;
            }
            if (!plaintextValue || typeof plaintextValue !== 'string') {
               throw new Error(`Decryption result for ${gunKey} is not a valid string (${typeof plaintextValue}).`);
            }

            const validPlaintext = plaintextValue;

            // Successfully decrypted! Mark as processed now.
            if (userPub) saveProcessedKey(userPub, gunKey);
            setContactErrors((prev) => ({ ...prev, [senderPubKey]: false }));
            resetsRef.current.delete(senderPubKey);

            if (validPlaintext.startsWith(" Linda:DELETE:")) {
              const delMsgId = validPlaintext.substring(
                " Linda:DELETE:".length,
              );
              console.log(
                `[Signal] Received DELETE request for message ${delMsgId} from ${senderPubKey.slice(0, 8)}`,
              );
              setDeletedMessages((prev) => {
                const contactDeletions = new Set(prev[senderPubKey] || []);
                contactDeletions.add(delMsgId);
                const next = { ...prev, [senderPubKey]: contactDeletions };
                if (userPub) saveDeletedMessages(userPub, next);
                return next;
              });
              return;
            }

            if (validPlaintext === "PING_HEAL") {
              console.log(`[Signal] Received PING_HEAL from ${senderPubKey.slice(0, 8)}. Resetting session and re-publishing bundle...`);
              await communicationService.resetSession(senderPubKey);
              await communicationService.republishBundle().catch(() => {});
              return;
            }

            if (validPlaintext.startsWith("RECEIPT_")) {
              const parts = validPlaintext.split("_");
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
                const options = {
                  body: validPlaintext.length > 50 ? validPlaintext.substring(0, 50) + "..." : validPlaintext,
                  icon: "/logo.svg",
                  badge: "/logo.svg",
                  tag: senderPubKey,
                  renotify: true,
                  data: `/chat/${senderPubKey}`
                };

                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(title, options);
                  }).catch(() => {
                    new Notification(title, options);
                  });
                } else {
                  new Notification(title, options);
                }
              }
            }

            // Send receipt
            try {
              const receiptCipher = await communicationService.encryptMessage(senderPubKey, `RECEIPT_delivered_${msgId}`);
              db.gun.get(`signal_v3_inbox_${senderPubKey}`).set({
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
                    (m.text === validPlaintext || m.audio === validPlaintext) &&
                    Math.abs(m.timestamp.getTime() - new Date(data.timestamp || Date.now()).getTime()) < 10000)
              );

              if (isDuplicate) {
                if (userMsgs.some(m => m.id === msgId)) {
                  const updatedUserMsgs = userMsgs.map(m => m.id === msgId ? { ...m, status: "delivered" as const } : m);
                  return { ...prev, [senderPubKey]: updatedUserMsgs };
                }
                return prev;
              }

              const appType = (data.msgType as any) || "text";
              const isFile = appType === 'file' || appType === 'image';
              let fileMeta: FileMetadata | undefined;
              if (isFile) {
                try {
                  fileMeta = JSON.parse(validPlaintext);
                } catch (e) {}
              }

              // Extract hashtags for easy filtering even if sender didn't include them
              const incomingTags: string[] = [];
              if (appType === "text" || !appType) {
                const hashtagRegex = /#(\w+)/g;
                let match;
                while ((match = hashtagRegex.exec(validPlaintext)) !== null) {
                  incomingTags.push(match[1].toLowerCase());
                }
              }

              const updated = {
                ...prev,
                [senderPubKey]: [
                  ...userMsgs,
                  {
                    id: msgId,
                    gunKey: gunKey,
                    sender: senderPubKey,
                    text: (appType === 'audio' || isFile) ? undefined : validPlaintext,
                    audio: appType === 'audio' ? validPlaintext : undefined,
                    fileMetadata: fileMeta,
                    tags: incomingTags.length > 0 ? incomingTags : undefined,
                    type: appType,
                    timestamp: new Date(data.timestamp || Date.now()),
                    status: "delivered" as const,
                  },
                ],
              };
              if (userPub) saveMessages(userPub, updated);
              return updated;
            });

            setContacts((prev) => {
              if (!prev.includes(senderPubKey)) {
                saveContact(senderPubKey);
                return [...prev, senderPubKey];
              }
              return prev;
            });

          } catch (e: any) {
            // Decryption failed.
            console.error(`[Signal] Decryption failed for ${senderPubKey} (Message: ${gunKey}):`, e.message);
            
            const hasResetRecently = resetsRef.current.has(senderPubKey);
            const isFreshMessage = messageTimestamp.getTime() > sessionStartTime - 30000;

            if (isFreshMessage && !hasResetRecently && !pendingResets.has(senderPubKey)) {
              pendingResets.add(senderPubKey);
              resetsRef.current.add(senderPubKey);
              console.log(`[Signal] Decryption failed for ${senderPubKey}. Attempting SILENT HEAL (refreshing keys)...`);
              
              try {
                await communicationService.resetSession(senderPubKey);
                const freshEpub = await communicationService.getEpubFromPub(senderPubKey);
                
                if (freshEpub) {
                  console.log(`[Signal] Fresh keys found for ${senderPubKey.slice(0, 8)}. Retrying decryption...`);
                  const retryPlaintext = await communicationService.decryptMessage(senderPubKey, {
                    type: data.type,
                    body: data.body,
                  });
                  
                  if (retryPlaintext && typeof retryPlaintext === 'string') {
                     console.log(`[Signal] Decryption SUCCESS after Silent HEAL!`);
                     if (userPub) saveProcessedKey(userPub, gunKey);
                     setContactErrors((prev) => ({ ...prev, [senderPubKey]: false }));
                     resetsRef.current.delete(senderPubKey);
                     
                     const appType = (data.msgType as any) || "text";
                     const msgId = data.msgId || gunKey;
                     const isFile = appType === 'file' || appType === 'image';
                     let fileMeta: FileMetadata | undefined;
                     if (isFile) {
                       try { fileMeta = JSON.parse(retryPlaintext); } catch (e) {}
                     }
                     
                     setMessages((prev) => {
                       const userMsgs = prev[senderPubKey] || [];
                       if (userMsgs.some(m => m.id === msgId)) return prev;
                       const updated = {
                         ...prev,
                         [senderPubKey]: [
                           ...userMsgs,
                           {
                             id: msgId,
                             gunKey: gunKey,
                             sender: senderPubKey,
                             text: (appType === 'audio' || isFile) ? undefined : retryPlaintext,
                             audio: appType === 'audio' ? retryPlaintext : undefined,
                             fileMetadata: fileMeta,
                             type: appType,
                             timestamp: new Date(data.timestamp || Date.now()),
                             status: "delivered" as const,
                           },
                         ],
                       };
                       if (userPub) saveMessages(userPub, updated);
                       return updated;
                     });
                     return; 
                  }
                }
              } catch (retryErr) {
                console.warn(`[Signal] Silent HEAL failed for ${senderPubKey}:`, retryErr);
              }
            } else {
              console.warn(`[Signal] Decryption failed AGAIN for ${senderPubKey}. Displaying placeholder message.`);
              if (userPub) saveProcessedKey(userPub, gunKey);
              setContactErrors((prev) => ({ ...prev, [senderPubKey]: true }));

              setMessages((prev) => {
                const userMsgs = prev[senderPubKey] || [];
                const msgId = data.msgId || gunKey;
                if (userMsgs.some(m => m.id === msgId)) return prev;

                const next = {
                  ...prev,
                  [senderPubKey]: [
                    ...userMsgs,
                    {
                      id: msgId,
                      sender: senderPubKey,
                      text: "⚠️ [Impossibile decriptare il messaggio. Problema di sincronizzazione.]",
                      timestamp: new Date(data.timestamp || Date.now()),
                      status: "delivered" as const,
                    },
                  ],
                };
                if (userPub) saveMessages(userPub, next);
                return next;
              });
            }
          }
        } catch (e: any) {
          console.error(`[Signal] Unexpected error in message queue for ${senderPubKeyRaw}:`, e.message);
        }
      });
    });
  }, [userPub, communicationService, db, saveMessages, saveProcessedKey, setRecipient]);

  // ── Actions ──
  const handleTyping = useCallback(async () => {
    if (!recipient || !userPub || !communicationService) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      try {
        const isGroup = recipient.length === 36 && recipient.includes("-");
        let path = `signal_v2_typing_${recipient}`;
        if (!isGroup) {
          const pub = recipient.length < 30 ? await communicationService.getPubKeyFromUsername(recipient) : recipient;
          path = `signal_v2_typing_${pub}`;
        }
        db.gun.get(path).get(userPub).put({ typing: true, ts: now.toString(), s: generateSecureRandomString(4) } as any);
      } catch (e) {}
    }
  }, [recipient, userPub, communicationService, db]);

  const handleSendMessage = useCallback(async (message?: string, audio?: string, fileMetadata?: FileMetadata) => {
    if (!recipient || (!message && !audio && !fileMetadata) || !communicationService || !userPub || !groupService) return;
    
    await communicationService.waitReady();
    const msgId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + generateSecureRandomString(10);
    const timestamp = new Date();
    
    let type: Message["type"] = "text";
    if (audio) type = "audio";
    else if (fileMetadata) {
      type = fileMetadata.mimeType.startsWith('image/') ? 'image' : 'file';
    }

    // Extract hashtags if it's a text message
    const tags: string[] = [];
    if (type === 'text' && message) {
      const hashtagRegex = /#(\w+)/g;
      let match;
      while ((match = hashtagRegex.exec(message)) !== null) {
        tags.push(match[1].toLowerCase());
      }
    }

    // 1. Optimistic Update: Add message immediately with "sending" status
    setMessages((prev) => {
      const currentMsgs = prev[recipient] || [];
      if (currentMsgs.some(m => m.id === msgId)) return prev;
      
      const next = { 
        ...prev, 
        [recipient]: [
          ...currentMsgs, 
          { 
            id: msgId, 
            sender: "Me", 
            senderPub: userPub, 
            text: type === 'text' ? message : undefined, 
            audio: type === 'audio' ? audio : undefined,
            fileMetadata: (type === 'file' || type === 'image') ? fileMetadata : undefined,
            tags: tags.length > 0 ? tags : undefined,
            type: type,
            timestamp, 
            status: "sending" as const 
          } as Message
        ] 
      };
      saveMessages(userPub, next);
      return next;
    });
    setContacts((prev) => {
      if (!prev.includes(recipient)) {
        saveContact(recipient);
        return [...prev, recipient];
      }
      return prev;
    });

    try {
      const isGroup = recipient.length === 36 && recipient.includes("-");
      let ciphertext: any;
      const payload = audio || (fileMetadata ? JSON.stringify(fileMetadata) : message);

      if (isGroup) {
        const canSend = await groupService.canPerform(recipient, "send_message");
        if (!canSend) {
           throw new Error("You do not have permission to send messages in this group");
        }
        
        const myRole = await groupService.getMemberRole(recipient, userPub);
        if (!myRole) throw new Error("Not a member");
        const meta = await (db.Get as any)(`signal_rooms/${recipient}/meta`);
        ciphertext = await groupService.encryptGroupMessage(meta.secret, payload || "");
        await db.Set(`signal_rooms/${recipient}/messages`, { msgId, sender: userPub, body: ciphertext, timestamp: timestamp.toISOString(), type } as any);
      } else {
        // 1:1 direct message

        try {
          ciphertext = await communicationService.encryptMessage(recipient, payload || "");
        } catch (err) {
          // If encryption fails, try to reset the session (clear cache) and retry once
          await communicationService.resetSession(recipient);
          ciphertext = await communicationService.encryptMessage(recipient, payload || "");
        }

        // For My Cloud (self-chat), we still write to GunDB to sync across devices.
        // The inbox listener handles duplicate prevention on the sending device.
        const pub = recipient.length < 30 ? await communicationService.getPubKeyFromUsername(recipient) : recipient;
        await db.Set(`signal_v3_inbox_${pub}`, { 
          msgId, 
          sender: userPub, 
          type: ciphertext.type, 
          body: ciphertext.body, 
          timestamp: timestamp.toISOString(), 
          msgType: type 
        } as any);
      }

      setContactErrors((prev) => ({ ...prev, [recipient]: false }));

      // 2. Success Update: Change status from "sending" to "sent"
      setMessages((prev) => {
        const currentMsgs = prev[recipient] || [];
        const msgIndex = currentMsgs.findIndex(m => m.id === msgId);
        
        if (msgIndex === -1) return prev;
        
        // Only update to "sent" if current status is "sending"
        // This avoids overwriting "delivered" or "read" if the listener already updated it
        if (currentMsgs[msgIndex].status !== "sending") return prev;

        const updatedMsgs = [...currentMsgs];
        updatedMsgs[msgIndex] = { ...updatedMsgs[msgIndex], status: "sent" as const };
        
        const next = { ...prev, [recipient]: updatedMsgs };
        saveMessages(userPub, next);
        return next;
      });
    } catch (err) {
      console.error("Send failed:", err);
      // Rollback optimistic update on failure (optional, or mark as error)
      setMessages((prev) => {
        const currentMsgs = prev[recipient] || [];
        const next = {
          ...prev,
          [recipient]: currentMsgs.filter((m) => m.id !== msgId),
        };
        saveMessages(userPub, next);
        return next;
      });
      throw err;
    }
  }, [recipient, communicationService, userPub, groupService, db, saveMessages]);

  const handleDeleteMessage = useCallback(
    async (messageId: string, senderPub?: string) => {
      if (!userPub || !recipient) return;

      const isGroup = recipient.length === 36 && recipient.includes("-");

      try {
        if (isGroup) {
          if (!groupService) return;
          console.log(`[Signal] Deleting group message ${messageId}...`);
          await groupService.deleteMessage(
            recipient,
            messageId,
            senderPub || "",
          );
        } else {
          // Private chat deletion protocol
          console.log(`[Signal] Deleting private message ${messageId}...`);

          // 0. Physical deletion from GunDB if we have the gunKey
          // We look for the message in our current state to find its Gun node key
          const msgs = messages[recipient] || [];
          const msgToDelete = msgs.find(m => m.id === messageId);
          if (msgToDelete?.gunKey && db.gun) {
            const path = `signal_v3_inbox_${userPub}`;
            console.log(`[Signal] Nullifying GunDB node at ${path}/${msgToDelete.gunKey}`);
            db.gun.get(path).get(msgToDelete.gunKey).put(null as any);
          }

          // 1. Mark as deleted locally
          setDeletedMessages((prev) => {
            const contactDeletions = new Set(prev[recipient] || []);
            contactDeletions.add(messageId);
            const next = { ...prev, [recipient]: contactDeletions };
            saveDeletedMessages(userPub, next);
            return next;
          });

          // 2. Notify the peer (Delete for everyone)
          if (communicationService) {
            const cipher = await communicationService.encryptMessage(
              recipient,
              ` Linda:DELETE:${messageId}`,
            );
            const pub =
              recipient.length < 30
                ? await communicationService.getPubKeyFromUsername(recipient)
                : recipient;

            db.gun.get(`signal_v3_inbox_${pub}`).set({
              sender: userPub,
              type: cipher.type,
              body: cipher.body,
              timestamp: new Date().toISOString(),
              msgType: "text", // Protocol message
            } as any);
          }
        }
      } catch (err: any) {
        console.error("Delete failed:", err);
        throw err;
      }
    },
    [
      userPub,
      recipient,
      groupService,
      communicationService,
      db,
      saveDeletedMessages,
      messages,
    ],
  );

  const handleClearChat = useCallback(async (contactId: string) => {
    if (!userPub || !db.gun) return;
    const msgs = messages[contactId] || [];
    
    // 1. Clear from GunDB
    const isGroup = contactId.length === 36 && contactId.includes("-");
    const path = isGroup ? `signal_rooms/${contactId}/messages` : `signal_v3_inbox_${userPub}`;
    
    msgs.forEach(m => {
      if (m.gunKey) {
        db.gun.get(path).get(m.gunKey).put(null as any);
      }
    });

    // 2. Clear from local state and Storage
    setMessages(prev => {
      const next = { ...prev };
      delete next[contactId];
      saveMessages(userPub, next);
      return next;
    });
    
    setContacts(prev => prev.filter(c => c !== contactId));
  }, [userPub, db, messages, saveMessages]);

  const handleFixSync = useCallback(async (contactId: string) => {
    if (!communicationService || !userPub) return;
    console.log(`[Signal] Manual Fix Sync for ${contactId}...`);
    try {
      await communicationService.resetSession(contactId);
      await communicationService.republishBundle().catch(() => {});
      
      const ping = await communicationService.encryptMessage(contactId, "PING_HEAL");
      const pub = contactId.length < 30 ? await communicationService.getPubKeyFromUsername(contactId) : contactId;
      await db.Set(`signal_v3_inbox_${pub}`, { 
        sender: userPub, 
        type: ping.type, 
        body: ping.body, 
        timestamp: new Date().toISOString() 
      } as any);
      
      setContactErrors(prev => ({ ...prev, [contactId]: false }));
    } catch (e) {
      console.error("[Signal] Fix Sync failed:", e);
    }
  }, [communicationService, userPub, db]);

  const currentMessages = useMemo(() => {
    const msgs = messages[recipient] || [];
    const deletions = deletedMessages[recipient] || new Set();
    return msgs.filter(m => !deletions.has(m.id));
  }, [messages, recipient, deletedMessages]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) {
      if (messages[c] === lastMessagesRef.current[c] && unreadCountsCache.current[c] !== undefined) {
        counts[c] = unreadCountsCache.current[c];
      } else {
        counts[c] = (messages[c] || []).filter((m) => m.sender === c && m.status !== "read").length;
      }
    }
    lastMessagesRef.current = messages;
    unreadCountsCache.current = counts;
    return counts;
  }, [messages, contacts]);

  return {
    messages,
    setMessages,
    contacts,
    setContacts,
    trustedContacts,
    isContactsLoading,
    blockedContacts,
    acceptContact,
    blockContact,
    typingStatuses,
    contactErrors,
    setContactErrors,
    deletedMessages,
    pinnedMessages,
    currentMessages,
    unreadCounts,
    handleTyping,
    handleSendMessage,
    handleFixSync,
    handleClearChat,
    handleDeleteMessage,
    saveContact,
    removeContact,
    saveMessages,
  };
};

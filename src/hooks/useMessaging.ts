import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DataBase } from 'linda-core';
import { CommunicationService } from 'linda-core';
import { GroupService, type GroupInfo } from 'linda-core';
import { generateSecureRandomString } from 'linda-core';

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
  setRecipient: (id: string) => void,
  showNotification?: (msg: string, type?: "info" | "error") => void
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
    if (!userPub || !db.zen) return;
    db.zen.get(`linda_v3_contacts_${userPub}`).get(contactId).put(true as any);
  }, [userPub, db]);

  const removeContact = useCallback((contactId: string) => {
    if (!userPub || !db.zen) return;
    db.zen.get(`linda_v3_contacts_${userPub}`).get(contactId).put(null as any);
  }, [userPub, db]);

  // ── Initialization Logic ──
  useEffect(() => {
    if (!userPub) return;
    loadSavedMessages(userPub);
    loadSavedDeletedMessages(userPub);
    loadProcessedKeys(userPub);

    db.zen
      .get(`linda_v3_contacts_${userPub}`)
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
    db.zen.get(`linda_v3_contacts_${userPub}`).once(() => {
        setIsContactsLoading(false);
    });
  }, [userPub, db, loadSavedMessages, loadProcessedKeys]);

  const acceptContact = useCallback(async (contactId: string) => {
    if (!userPub || !db.zen || !communicationService) return;
    console.log(`[Messaging] Accepting contact: ${contactId.slice(0, 8)}`);
    
    // 1. Issue certificate for this user (LoneWolf protocol)
    await communicationService.issueCertificate(contactId);
    
    // 2. Add to trusted contacts in GunDB
    db.zen.get(`linda_v3_contacts_${userPub}`).get(contactId).put(true as any);
  }, [userPub, db, communicationService]);

  const blockContact = useCallback(async (contactId: string) => {
    if (!userPub || !db.zen || !communicationService) return;
    console.log(`[Messaging] Blocking contact: ${contactId.slice(0, 8)}`);
    
    // 1. Revoke certificate
    await communicationService.revokeCertificate(contactId);
    
    // 2. Mark as blocked in contacts list
    db.zen.get(`linda_v3_contacts_${userPub}`).get(contactId).put(false as any);
    
    if (recipient === contactId) {
      setRecipient("");
    }
  }, [userPub, db, communicationService, recipient, setRecipient]);


  // ── Typing Listeners ──
  useEffect(() => {
    if (!userPub) return;

    db.zen
      .get(`linda_v2_typing_${userPub}`)
      .map()
      .on((data: any, senderPubKey: string) => {
        if (blockedContactsRef.current.has(senderPubKey)) return;
        if (!data || typeof data !== "object" || Array.isArray(data)) return;
        if (data.typing && data.ts) {
          const now = Date.now();
          const parsedTs = typeof data.ts === "string" ? parseInt(data.ts, 10) : Number(data.ts);
          if (isNaN(parsedTs) || parsedTs > now + 3600000) return;
          // Ignore stale statuses replayed from the graph at startup,
          // otherwise old "typing" events flash in the UI.
          if (now - parsedTs > 4000) return;

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

  // ── Unified Messaging Listener (Groups & TPRE P2P) ──
  useEffect(() => {
    if (!groupService || contacts.length === 0) return;

    contacts.forEach(async (contactId) => {
      // contactId is either a UUID (Group) or a Pubkey (P2P)
      if (groupSubscriptionsRef.current.has(contactId)) return;

      try {
        const isP2P = contactId.length >= 30 && !contactId.includes("-");
        let roomId = contactId;
        
        if (isP2P) {
            const calculatedId = await groupService.getP2PGroupId(contactId);
            if (!calculatedId) return;
            roomId = calculatedId;
        }

        // We use roomId to find the metadata, but we'll store messages under contactId
        const meta = await (db.Get as any)(`linda_rooms/${roomId}/meta`) as (GroupInfo & { encryptionMode?: string });
        if (!meta || (meta as any).err) return;

        groupSubscriptionsRef.current.add(contactId);
        if (isP2P) groupSubscriptionsRef.current.add(roomId);

        // Removed TPRE Proactive Reactor

        // 1. Listen to Messages
        db.zen.get(`linda_rooms/${roomId}/messages`).map().on(async (data: any, gunKey: string) => {
          if (!data || typeof data !== "object" || !data.body || !data.sender) return;
          
          if (processedRef.current.has(gunKey)) return;
          if (userPub) {
            processedRef.current.add(gunKey);
            console.log(`[Messaging] New message observed: ${gunKey.slice(0, 8)} from ${data.sender.slice(0, 8)}`);
          }

          if (blockedContactsRef.current.has(data.sender)) {
            if (userPub) saveProcessedKey(userPub, gunKey);
            return;
          }

          try {
            // Try to decrypt right away: in the common case the fragments are
            // already synced and the message renders instantly. If sync is
            // still catching up, the retry loop below waits with backoff.
            let plaintext = "";
            let retries = 10;
            let delay = 2000;
            
            while (retries > 0) {
              try {
                if (isP2P) {
                  plaintext = (await communicationService!.decryptMessage(contactId, { type: data.type, body: data.body }, data.senderEpub)) || "";
                } else {
                  plaintext = await groupService.decryptGroupMessage(meta, data.body);
                }
                break;
              } catch (e) {
                retries--;
                if (retries === 0) {
                  if (userPub) processedRef.current.delete(gunKey);
                  throw e;
                }
                console.warn(`[Messaging] Decryption failed for ${gunKey.slice(0, 8)}, retrying in ${delay}ms... (${retries} left)`);
                await new Promise(r => setTimeout(r, delay));
                delay += 1000; // Linear backoff
              }
            }
            
            if (userPub) saveProcessedKey(userPub, gunKey);

            if (plaintext === "LEGACY_UNSUPPORTED") {
              console.warn(`[Messaging] Skipping undecryptable/legacy message ${gunKey.slice(0, 8)}`);
              return;
            }

            const cleanSender = data.sender.startsWith('~') ? data.sender.slice(1) : data.sender;
            const isMe = cleanSender === userPub;
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
                if (groupMsgs.some(m => m.id === remoteMsgId)) {
                  const updatedGroupMsgs = groupMsgs.map(m => m.id === remoteMsgId ? { ...m, status: "delivered" as const } : m);
                  return { ...prev, [contactId]: updatedGroupMsgs };
                }
                return prev;
              }

              const actualType = isP2P ? (data.msgType || "text") : (data.type || "text");
              const isFile = actualType === 'file' || actualType === 'image';
              let fileMetadata: FileMetadata | undefined;
              let messageText: string | undefined = plaintext;

              if (isFile) {
                try {
                  fileMetadata = JSON.parse(plaintext);
                  messageText = undefined;
                } catch (e) {
                  console.error("[Messaging] Failed to parse file metadata:", e);
                }
              }

              const resolvedType = isP2P 
                ? (isFile ? (fileMetadata?.mimeType.startsWith('image/') ? 'image' : 'file') : (data.msgType || "text")) 
                : ((data.type as any) || "text");

              const updatedMessages = [
                ...groupMsgs,
                {
                  id: remoteMsgId,
                  gunKey: gunKey,
                  sender: isMe ? "Me" : data.sender,
                  senderPub: data.sender,
                  text: (resolvedType === 'audio' || isFile) ? undefined : messageText,
                  audio: resolvedType === 'audio' ? plaintext : undefined,
                  fileMetadata,
                  type: resolvedType,
                  timestamp: new Date(data.timestamp || Date.now()),
                  status: "delivered" as const,
                },
              ];

              const updated = { ...prev, [contactId]: updatedMessages };
              if (userPub) saveMessages(userPub, updated);
              return updated;
            });

            if (!isMe && (recipientRef.current !== contactId || document.visibilityState !== "visible")) {
              const title = isP2P ? `Message from ${data.sender.slice(0, 8)}` : `New message in ${meta.name}`;
              const options = {
                body: plaintext.substring(0, 50),
                icon: meta.avatar || "/logo.svg",
                badge: "/logo.svg",
                tag: contactId,
                renotify: true,
                data: `/chat/${contactId}`
              };

              if ('serviceWorker' in navigator && Notification.permission === 'granted') {
                 navigator.serviceWorker.ready.then(registration => {
                   registration.showNotification(title, options);
                 });
              } else if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                 new Notification(title, options);
              }
            }
          } catch (e) {
            console.warn(`[Groups] Failed to decrypt message in ${contactId} (${roomId}):`, e);
            if (userPub) processedRef.current.delete(gunKey);
          }
        });

        // 2. Listen to Deletions
        db.zen.get(`linda_rooms/${roomId}/deleted_messages`).map().on((data: any, msgId: string) => {
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

        // 3. Listen to Pins
        db.zen.get(`linda_rooms/${roomId}/pins`).map().on((ts: any, msgId: string) => {
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

  // Removed Admin TPRE Reactor

  // ── Signal 1:1 Messaging (Inbox) ──
  useEffect(() => {
    if (!communicationService || !userPub) return;
    const sessionStartTime = Date.now();
    console.log(`[Signal] Listener started at ${sessionStartTime}`);

    db.zen.get(`linda_v3_inbox_${userPub}`).map().on(async (data: any, gunKey: string) => {
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
      const cleanSenderInbox = senderPubKeyRaw.startsWith('~') ? senderPubKeyRaw.slice(1) : senderPubKeyRaw;
      if (cleanSenderInbox === userPub) {
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

          try {
            const plaintextValue = await communicationService.decryptMessage(senderPubKeyRaw, {
              type: data.type,
              body: data.body,
            }, data.senderEpub);
            
            if (userPub) saveProcessedKey(userPub, gunKey);

            if (plaintextValue && plaintextValue.startsWith("DELETE:")) {
              const deletedMsgId = plaintextValue.split(":")[1];
              console.log(`[Signal] Received DELETE signal for msg ${deletedMsgId} from ${senderPubKeyRaw.slice(0, 8)}`);
              setDeletedMessages((prev) => {
                const contactDeletions = new Set(prev[senderPubKeyRaw] || []);
                contactDeletions.add(deletedMsgId);
                const next = { ...prev, [senderPubKeyRaw]: contactDeletions };
                if (userPub) saveDeletedMessages(userPub, next);
                return next;
              });
            } else if (plaintextValue && plaintextValue.startsWith("P2P_POKE:")) {
              const roomId = plaintextValue.split(":")[1];
              console.log(`[Signal] Received P2P_POKE for room ${roomId.slice(0, 8)}. Promoting sender to contacts.`);
              setContacts((prev) => {
                if (!prev.includes(senderPubKeyRaw)) {
                  saveContact(senderPubKeyRaw);
                  return [...prev, senderPubKeyRaw];
                }
                return prev;
              });
            } else if (plaintextValue === "LEGACY_UNSUPPORTED") {
                // Ignore legacy
            } else {
                console.log(`[Signal] Received unhandled message from ${senderPubKeyRaw.slice(0, 8)} in inbox.`);
            }
          } catch (e: any) {
          }
        } catch (e: any) {
          console.error("[Signal] messageQueue error:", e);
        }
      });
    });
  }, [userPub, communicationService, db, saveMessages, saveProcessedKey, setRecipient]);

  // ── Actions ──
  const handleTyping = useCallback(async () => {
    if (!recipient || !userPub || !communicationService) return;
    if (blockedContactsRef.current.has(recipient)) return;
    
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      try {
        const isGroup = recipient.length === 36 && recipient.includes("-");
        let path = `linda_v2_typing_${recipient}`;
        if (!isGroup) {
          const pub = recipient.length < 30 ? await communicationService.getPubKeyFromUsername(recipient) : recipient;
          path = `linda_v2_typing_${pub}`;
        }
        db.zen.get(path).get(userPub).put({ typing: true, ts: now.toString(), s: generateSecureRandomString(4) } as any);
      } catch (e) {}
    }
  }, [recipient, userPub, communicationService, db]);

  const handleSendMessage = useCallback(async (message?: string, audio?: string, fileMetadata?: FileMetadata) => {
    if (!recipient || (!message && !audio && !fileMetadata) || !communicationService || !userPub || !groupService) return;
    if (blockedContactsRef.current.has(recipient)) {
      console.warn(`[Messaging] Cannot send message to blocked contact ${recipient}`);
      return;
    }
    
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
        const meta = await (db.Get as any)(`linda_rooms/${recipient}/meta`);
        if (!meta) throw new Error("Group metadata not found");
        ciphertext = await groupService.encryptGroupMessage(meta, payload || "");
        await db.Set(`linda_rooms/${recipient}/messages`, { msgId, sender: userPub, body: ciphertext, timestamp: timestamp.toISOString(), type } as any);
      } else {
        // 1:1 direct message -> P2P ECDH
        console.log(`[Signal] Using P2P ECDH for 1:1 chat with ${recipient.slice(0, 8)}...`);
        const p2pGroup = await groupService.getOrCreateP2PGroup(recipient);
        
        const pokeCipher = await communicationService.encryptMessage(recipient, payload || "");
        
        // Write to the P2P room messages node
        await db.Set(`linda_rooms/${p2pGroup.id}/messages`, { 
            msgId,
            sender: userPub,
            body: pokeCipher.body,
            timestamp: timestamp.toISOString(), 
            type: pokeCipher.type,
            msgType: type 
        } as any);

        // POKING: We still write a minimal 'poke' to signal_v3_inbox so their app knows to check the P2P room
        try {
            const pokeMsg = await communicationService.encryptMessage(recipient, `P2P_POKE:${p2pGroup.id}`);
            const inboxCert = await communicationService.getInboxCertificate(recipient).catch(() => null);
            
            await db.Set(`linda_v3_inbox_${recipient}`, {
                sender: userPub,
                type: pokeMsg.type,
                body: pokeMsg.body,
                timestamp: timestamp.toISOString(),
                msgType: 'p2p_poke'
            } as any, { cert: inboxCert });
        } catch (e) {
            console.warn("[Signal] Failed to send P2P_POKE, recipient might take longer to sync.", e);
        }
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

          // 0. Physical deletion from Zen node if we have the gunKey or room ID
          const msgs = messages[recipient] || [];
          const msgToDelete = msgs.find(m => m.id === messageId);
          if (groupService && db.zen) {
            try {
              const p2pGroup = await groupService.getOrCreateP2PGroup(recipient);
              if (msgToDelete?.gunKey) {
                const path = `linda_rooms/${p2pGroup.id}/messages`;
                console.log(`[Signal] Nullifying node at ${path}/${msgToDelete.gunKey}`);
                db.zen.get(path).get(msgToDelete.gunKey).put(null as any);
              }
            } catch (e) {
              console.warn("[Signal] Failed to nullify P2P room message node:", e);
            }
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
              `DELETE:${messageId}`,
            );
            const pub =
              recipient.length < 30
                ? await communicationService.getPubKeyFromUsername(recipient)
                : recipient;

            const inboxCert = await communicationService.getInboxCertificate(pub).catch(() => null);
            await db.Set(`linda_v3_inbox_${pub}`, {
              sender: userPub,
              type: cipher.type,
              body: cipher.body,
              timestamp: new Date().toISOString(),
              msgType: "text", // Protocol message
            } as any, { cert: inboxCert });
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
    if (!userPub || !db.zen) return;
    const msgs = messages[contactId] || [];
    
    // 1. Clear from GunDB
    const isGroup = contactId.length === 36 && contactId.includes("-");
    const path = isGroup ? `linda_rooms/${contactId}/messages` : `linda_v3_inbox_${userPub}`;
    
    msgs.forEach(m => {
      if (m.gunKey) {
        db.zen.get(path).get(m.gunKey).put(null as any);
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
      // 1. Double Ratchet Repair
      await communicationService.resetSession(contactId);
      await communicationService.republishBundle().catch(() => {});
      
      const ping = await communicationService.encryptMessage(contactId, "PING_HEAL");
      const pub = contactId.length < 30 ? await communicationService.getPubKeyFromUsername(contactId) : contactId;
      await db.Set(`linda_v3_inbox_${pub}`, { 
        sender: userPub, 
        type: ping.type, 
        body: ping.body, 
        timestamp: new Date().toISOString() 
      } as any);


      
      setContactErrors(prev => ({ ...prev, [contactId]: false }));
      showNotification?.("Synchronization repaired", "info");
    } catch (e) {
      console.error("[Signal] Fix Sync failed:", e);
      showNotification?.("Repair failed", "error");
    }
  }, [communicationService, userPub, db, groupService, showNotification]);




  const currentMessages = useMemo(() => {
    const msgs = messages[recipient] || [];
    const deletions = deletedMessages[recipient] || new Set();
    return msgs.filter(m => !deletions.has(m.id));
  }, [messages, recipient, deletedMessages]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) {
      const currentMsgs = messages[c] || [];
      const prevMsgs = lastMessagesRef.current[c] || [];
      const prevCount = unreadCountsCache.current[c];

      // 1. If array identity hasn't changed, reuse the cached count
      if (currentMsgs === prevMsgs && prevCount !== undefined) {
        counts[c] = prevCount;
        continue;
      }

      // 2. Optimization: check if it's an append and we have a cached count
      // We verify the prefix by checking the first and previous-last elements.
      const isAppend =
        prevCount !== undefined &&
        currentMsgs.length > prevMsgs.length &&
        prevMsgs.length > 0 &&
        currentMsgs[0] === prevMsgs[0] &&
        currentMsgs[prevMsgs.length - 1] === prevMsgs[prevMsgs.length - 1];

      if (isAppend) {
        const newMessages = currentMsgs.slice(prevMsgs.length);
        const addedUnread = newMessages.filter((m) => m.sender === c && m.status !== "read").length;
        counts[c] = prevCount + addedUnread;
      } else {
        // 3. Fallback: Full scan for first load, deletions, or status updates
        counts[c] = currentMsgs.filter((m) => m.sender === c && m.status !== "read").length;
      }
    }

    // Persist results to refs for next calculation
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
    handlePinMessage: (msgId: string, pin: boolean) => {
       if (!recipient || !groupService) return;
       groupService.pinMessage(recipient, msgId, pin);
    },
    handleReportMessage: () => {
       showNotification?.("Message reported", "info");
    },
    handleRegenerateCertificate: async () => {
       if (!communicationService) return;
       await communicationService.republishBundle();
       showNotification?.("Identity certificate regenerated", "info");
    }
  };
};

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DataBase } from "linda-core";
import { CommunicationService } from "linda-core";
import { GroupService, type GroupInfo } from "linda-core";
import { generateSecureRandomString } from "linda-core";
import { DECRYPT_FAILED, LEGACY_UNSUPPORTED } from "linda-core";
import { sendAppNotification } from "../utils/notifications";
import { requestGroupSecret } from "../utils/inboxSignal";

export interface FileMetadata {
	name: string;
	size: number;
	hash: string;
	mimeType: string;
	id: string; // Internal file transfer ID
	status: "offered" | "incoming" | "transferring" | "completed" | "failed";
	method?: "webrtc" | "wormhole";
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

// localStorage caps. Chat history holds base64 audio/images inline, and the
// persisted "processed keys" set only ever grew, so a long-lived account would
// eventually throw QuotaExceededError from inside a .on() handler — which
// aborted message processing entirely.
const MAX_PERSISTED_MESSAGES_PER_CHAT = 300;
const MAX_PROCESSED_KEYS = 5000;

// Minimum gap between listener re-arms so a burst of visibility/online events
// doesn't tear down and rebuild every room subscription repeatedly.
const RESUBSCRIBE_THROTTLE_MS = 10_000;

export const useMessaging = (
	db: DataBase,
	userPub: string | null,
	communicationService: CommunicationService | null,
	groupService: GroupService | null,
	recipient: string,
	setRecipient: (id: string) => void,
	showNotification?: (msg: string, type?: "info" | "error") => void,
) => {
	const [messages, setMessages] = useState<Record<string, Message[]>>({});
	const [contacts, setContacts] = useState<string[]>([]);
	const [trustedContacts, setTrustedContacts] = useState<Set<string>>(
		new Set(),
	);
	const [isContactsLoading, setIsContactsLoading] = useState(true);
	const [blockedContacts, setBlockedContacts] = useState<Set<string>>(
		new Set(),
	);
	const [typingStatuses, setTypingStatuses] = useState<Record<string, number>>(
		{},
	);
	const [contactErrors, setContactErrors] = useState<Record<string, boolean>>(
		{},
	);
	const [deletedMessages, setDeletedMessages] = useState<
		Record<string, Set<string>>
	>({});
	const [pinnedMessages, setPinnedMessages] = useState<
		Record<string, Set<string>>
	>({});
	const [clearedChats, setClearedChats] = useState<Record<string, number>>({});

	const clearedChatsRef = useRef<Record<string, number>>({});
	const processedRef = useRef<Set<string>>(new Set());
	const blockedContactsRef = useRef<Set<string>>(new Set());
	const lastTypingSentRef = useRef<number>(0);
	const recipientRef = useRef(recipient);
	const groupSubscriptionsRef = useRef<Set<string>>(new Set());
	const messageQueueRef = useRef<Record<string, Promise<void>>>({});
	const unreadCountsCache = useRef<Record<string, number>>({});
	const lastMessagesRef = useRef<Record<string, Message[]>>({});
	// Always-current mirror of `messages` state for use inside .on() closures
	// that would otherwise capture a stale snapshot from the render they were
	// created in (BUG #4 fix).
	const messagesRef = useRef<Record<string, Message[]>>({});

	// Synchronize clearedChatsRef for callbacks inside Gun listeners
	useEffect(() => {
		clearedChatsRef.current = clearedChats;
	}, [clearedChats]);

	// Every Zen chain we hold a live .on() for, so it can be .off()'d and rebuilt
	// when the app comes back to the foreground.
	const liveChainsRef = useRef<any[]>([]);
	const lastResubscribeRef = useRef(0);
	const didLoadLocalRef = useRef(false);
	const [resumeTick, setResumeTick] = useState(0);
	// Bumped when a room secret finally lands, so the group effect re-runs and
	// subscribes the rooms it had to skip for a missing secret.
	const [groupKeyTick, setGroupKeyTick] = useState(0);
	// Rooms we already asked the admin a key for, to keep the retry to one
	// request per room per session.
	const keyRequestedRef = useRef<Set<string>>(new Set());

	const trackChain = useCallback((chain: any) => {
		liveChainsRef.current.push(chain);
		return chain;
	}, []);

	// A room secret just landed: forget that the room was skipped and bump the
	// tick so the group effect attaches the listener it couldn't build before.
	const rearmRoom = useCallback((groupId: string) => {
		groupSubscriptionsRef.current.delete(groupId);
		keyRequestedRef.current.delete(groupId);
		setGroupKeyTick((t) => t + 1);
	}, []);

	useEffect(() => {
		recipientRef.current = recipient;
	}, [recipient]);

	// Keep messagesRef in sync so Signal inbox listeners read current state.
	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	// Persist a capped view of the history: in-memory state keeps everything,
	// only the localStorage copy is trimmed.
	const saveMessages = useCallback(
		(user: string, msgs: Record<string, Message[]>) => {
			const capped: Record<string, Message[]> = {};
			for (const contact in msgs) {
				capped[contact] = msgs[contact].slice(-MAX_PERSISTED_MESSAGES_PER_CHAT);
			}
			try {
				localStorage.setItem(`chat_messages_${user}`, JSON.stringify(capped));
			} catch (e) {
				// Almost certainly QuotaExceededError: inline base64 media dominates
				// the payload, so drop it and keep a short tail of each conversation.
				console.warn(
					"[Messaging] Chat history persist failed, retrying without inline media",
					e,
				);
				const slim: Record<string, Message[]> = {};
				for (const contact in capped) {
					slim[contact] = capped[contact]
						.slice(-50)
						.map((m) => (m.audio ? { ...m, audio: undefined } : m));
				}
				try {
					localStorage.setItem(`chat_messages_${user}`, JSON.stringify(slim));
				} catch (e2) {
					console.error(
						"[Messaging] Could not persist chat history at all",
						e2,
					);
				}
			}
		},
		[],
	);

	const saveDeletedMessages = useCallback(
		(user: string, deleted: Record<string, Set<string>>) => {
			const serializable: Record<string, string[]> = {};
			for (const contact in deleted) {
				serializable[contact] = Array.from(deleted[contact]);
			}
			try {
				localStorage.setItem(
					`deleted_messages_${user}`,
					JSON.stringify(serializable),
				);
			} catch (e) {
				console.warn("[Messaging] Could not persist deleted messages", e);
			}
		},
		[],
	);

	const saveClearedChats = useCallback(
		(user: string, cleared: Record<string, number>) => {
			try {
				localStorage.setItem(`cleared_chats_${user}`, JSON.stringify(cleared));
			} catch (e) {
				console.warn("[Messaging] Could not persist cleared chats", e);
			}
		},
		[],
	);

	const loadClearedChats = useCallback((user: string) => {
		try {
			const raw = localStorage.getItem(`cleared_chats_${user}`);
			if (raw) {
				setClearedChats(JSON.parse(raw));
			}
		} catch (e) {
			console.warn("Failed to load saved cleared chats", e);
		}
	}, []);

	const loadSavedMessages = useCallback((user: string) => {
		try {
			const rawCleared = localStorage.getItem(`cleared_chats_${user}`);
			const clearedMap: Record<string, number> = rawCleared
				? JSON.parse(rawCleared)
				: {};

			const raw = localStorage.getItem(`chat_messages_${user}`);
			if (raw) {
				const parsed = JSON.parse(raw);
				for (const contact in parsed) {
					const clearedAt = clearedMap[contact] || 0;
					parsed[contact] = parsed[contact]
						.map((m: any) => ({
							...m,
							timestamp: new Date(m.timestamp),
						}))
						.filter((m: any) => m.timestamp.getTime() > clearedAt);
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
		// Set iteration is insertion-ordered, so keeping the tail drops the oldest
		// keys first. Without a cap this array grew for the lifetime of the account.
		if (processedRef.current.size > MAX_PROCESSED_KEYS) {
			processedRef.current = new Set(
				Array.from(processedRef.current).slice(-MAX_PROCESSED_KEYS),
			);
		}
		try {
			localStorage.setItem(
				`processed_keys_${user}`,
				JSON.stringify(Array.from(processedRef.current)),
			);
		} catch (e) {
			console.warn("[Messaging] Could not persist processed keys", e);
		}
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

	const saveContact = useCallback(
		(contactId: string) => {
			if (!userPub || !db.zen) return;
			db.zen
				.get(`linda_v3_contacts_${userPub}`)
				.get(contactId)
				.put(true as any);
		},
		[userPub, db],
	);

	const removeContact = useCallback(
		(contactId: string) => {
			if (!userPub || !db.zen) return;
			db.zen
				.get(`linda_v3_contacts_${userPub}`)
				.get(contactId)
				.put(null as any);
		},
		[userPub, db],
	);

	// ── Initialization Logic ──
	useEffect(() => {
		if (!userPub) return;
		// Only hydrate from localStorage on first mount: this effect also re-runs on
		// resume to re-arm the listener, and reloading would clobber live state.
		if (!didLoadLocalRef.current) {
			didLoadLocalRef.current = true;
			loadClearedChats(userPub);
			loadSavedMessages(userPub);
			loadSavedDeletedMessages(userPub);
			loadProcessedKeys(userPub);
		}

		trackChain(db.zen.get(`linda_v3_contacts_${userPub}`))
			.map()
			.on((data: any, contactId: string) => {
				if (data === true) {
					setContacts((prev) =>
						prev.includes(contactId) ? prev : [...prev, contactId],
					);
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
	}, [
		userPub,
		db,
		loadSavedMessages,
		loadProcessedKeys,
		trackChain,
		resumeTick,
	]);

	// Auto-subscribe to recipient if opened directly via deep link URL (/chat/:id)
	useEffect(() => {
		if (recipient && userPub && !contacts.includes(recipient)) {
			saveContact(recipient);
		}
	}, [recipient, userPub, contacts, saveContact]);

	// ── Listener Re-arm on Resume ──
	// Zen's mesh re-sends `get` for souls still in root.next when a socket
	// reconnects, but a subscription whose chain went stale (backgrounded tab,
	// killed socket, OS freeze on Android) never emits again. On resume we tear
	// every live chain down with .off() — which also clears it from root.next —
	// then bump resumeTick so each subscription effect rebuilds from scratch.
	useEffect(() => {
		const rearm = () => {
			if (document.visibilityState === "hidden") return;
			const now = Date.now();
			if (now - lastResubscribeRef.current < RESUBSCRIBE_THROTTLE_MS) return;
			lastResubscribeRef.current = now;

			console.log(
				`[Messaging] Resume detected, re-arming ${liveChainsRef.current.length} listeners`,
			);
			for (const chain of liveChainsRef.current) {
				try {
					chain.off?.();
				} catch (e) {
					console.warn("[Messaging] Failed to detach a chain on resume:", e);
				}
			}
			liveChainsRef.current = [];
			groupSubscriptionsRef.current.clear();
			setResumeTick((t) => t + 1);
		};

		document.addEventListener("visibilitychange", rearm);
		window.addEventListener("online", rearm);
		window.addEventListener("pageshow", rearm);

		// Capacitor native resume — the authoritative lifecycle signal on Android.
		// Web events (visibilitychange, pageshow) are unreliable inside Capacitor's
		// WebView after a long background period, so this is what actually triggers
		// the listener rebuild on mobile.
		let capacitorListenerHandle: { remove: () => Promise<void> } | null = null;
		if (typeof window !== "undefined" && (window as any).Capacitor) {
			import("@capacitor/app")
				.then(({ App }) => {
					App.addListener("appStateChange", (state: { isActive: boolean }) => {
						if (state.isActive) {
							console.log(
								"[Messaging] Capacitor appStateChange → active, re-arming listeners",
							);
							// Force rearm even if visibilityState is stale (Android WebView quirk)
							const now = Date.now();
							if (now - lastResubscribeRef.current < RESUBSCRIBE_THROTTLE_MS)
								return;
							lastResubscribeRef.current = now;

							for (const chain of liveChainsRef.current) {
								try {
									chain.off?.();
								} catch {}
							}
							liveChainsRef.current = [];
							groupSubscriptionsRef.current.clear();
							setResumeTick((t) => t + 1);
						}
					}).then((handle: any) => {
						capacitorListenerHandle = handle;
					});
				})
				.catch(() => {
					/* not on Capacitor */
				});
		}

		return () => {
			document.removeEventListener("visibilitychange", rearm);
			window.removeEventListener("online", rearm);
			window.removeEventListener("pageshow", rearm);
			capacitorListenerHandle?.remove();
		};
	}, []);

	// Detach everything on unmount (logout) so stale handlers don't fire against
	// the next session's state.
	useEffect(
		() => () => {
			for (const chain of liveChainsRef.current) {
				try {
					chain.off?.();
				} catch (e) {}
			}
			liveChainsRef.current = [];
			groupSubscriptionsRef.current.clear();
		},
		[],
	);

	const acceptContact = useCallback(
		async (contactId: string) => {
			if (!userPub || !db.zen || !communicationService) return;
			console.log(`[Messaging] Accepting contact: ${contactId.slice(0, 8)}`);

			// 1. Issue certificate for this user (LoneWolf protocol)
			await communicationService.issueCertificate(contactId);

			// 2. Add to trusted contacts in GunDB
			db.zen
				.get(`linda_v3_contacts_${userPub}`)
				.get(contactId)
				.put(true as any);
		},
		[userPub, db, communicationService],
	);

	const blockContact = useCallback(
		async (contactId: string) => {
			if (!userPub || !db.zen || !communicationService) return;
			console.log(`[Messaging] Blocking contact: ${contactId.slice(0, 8)}`);

			// 1. Revoke certificate
			await communicationService.revokeCertificate(contactId);

			// 2. Mark as blocked in contacts list
			db.zen
				.get(`linda_v3_contacts_${userPub}`)
				.get(contactId)
				.put(false as any);

			if (recipient === contactId) {
				setRecipient("");
			}
		},
		[userPub, db, communicationService, recipient, setRecipient],
	);

	// ── Typing Listeners ──
	useEffect(() => {
		if (!userPub) return;

		trackChain(db.zen.get(`linda_v2_typing_${userPub}`))
			.map()
			.on((data: any, senderPubKey: string) => {
				if (blockedContactsRef.current.has(senderPubKey)) return;
				if (!data || typeof data !== "object" || Array.isArray(data)) return;
				if (data.typing && data.ts) {
					const now = Date.now();
					const parsedTs =
						typeof data.ts === "string"
							? parseInt(data.ts, 10)
							: Number(data.ts);
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
			// The chain itself is detached by the resume/unmount handlers above.
		};
	}, [userPub, db, trackChain, resumeTick]);

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

				// We use roomId to find the metadata, but we'll store messages under contactId.
				// P2P rooms use ECDH encryption — their meta (if any) is irrelevant for
				// decryption, so we skip the retry loop and fall back immediately to a
				// synthetic shell. Without this, a cold P2P contact would wait up to 15s
				// (1+2+3+4+5s) before getting a listener (BUG #6 fix).
				// For real groups the meta IS needed for the symmetric key, so we retry.
				let meta: GroupInfo & { encryptionMode?: string };
				if (isP2P) {
					// Fast path: try once with a real wait window, then synthesize.
					const fetchedMeta = (await (db.Get as any)(
						`linda_rooms/${roomId}/meta`,
						6000,
						true,
						2000,
					)) as GroupInfo;
					meta = fetchedMeta || {
						id: roomId,
						name: "Direct Chat",
						description: "Encrypted P2P Conversation",
						adminPub: userPub || "",
						secret: "",
						encryptionMode: "symmetric",
						type: "group",
					};
				} else {
					// Group: meta holds the symmetric secret — retry up to 5 times.
					meta = (await (db.Get as any)(
						`linda_rooms/${roomId}/meta`,
					)) as GroupInfo;
					for (let i = 0; i < 5 && (!meta || (meta as any).err); i++) {
						await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
						meta = (await (db.Get as any)(
							`linda_rooms/${roomId}/meta`,
						)) as GroupInfo;
					}
					if (!meta || (meta as any).err) return;
				}

				// 1. Listen to Messages
				// A missing local secret is not proof the key is lost: it also happens
				// after a storage wipe or on a fresh device, where the encrypted escrow
				// in our own user space still has it.
				const roomSecret = isP2P
					? ""
					: groupService.getLocalSecret(roomId) ||
						(await groupService.recoverSecret(roomId));
				if (!isP2P && !roomSecret) {
					// Without the secret the room chain can't be derived, so the room
					// stays silent forever (public-group joins used to land here and
					// never recover). Ask the admin once; the GROUP_KEY_DISTRIBUTION
					// handler bumps groupKeyTick, which re-runs this effect and
					// subscribes for real. Deliberately not marked as subscribed.
					const adminPub = (meta as GroupInfo)?.adminPub;
					if (adminPub && adminPub === userPub) {
						// We *are* the admin, so there is nobody to ask, and the escrow
						// lookup above already came back empty. That leaves a group created
						// before escrow existed, or a pub change after a legacy-seed login
						// orphaning the per-pub key. Log it once instead of failing
						// silently forever.
						if (!keyRequestedRef.current.has(roomId)) {
							keyRequestedRef.current.add(roomId);
							console.warn(
								`[Groups] No room secret for ${contactId} and we are the admin — the key is unrecoverable on this device.`,
							);
						}
					} else if (
						adminPub &&
						adminPub !== userPub &&
						!keyRequestedRef.current.has(roomId)
					) {
						// Log inside the guard: this effect re-runs on every tick, and an
						// unguarded warn here floods the console once per room per render.
						console.warn(
							`[Groups] No room secret for ${contactId}, requesting it from the admin`,
						);
						keyRequestedRef.current.add(roomId);
						await requestGroupSecret(communicationService, adminPub, roomId);
					}
					return;
				}

				groupSubscriptionsRef.current.add(contactId);
				if (isP2P) groupSubscriptionsRef.current.add(roomId);

				// Removed TPRE Proactive Reactor

				const messagesChain = isP2P
					? db.zen.get(`linda_rooms/${roomId}/messages`)
					: await communicationService!.getRoomChain(
							roomId,
							roomSecret,
							"messages",
						);
				if (!messagesChain) {
					console.warn(
						`[Groups] No room chain for ${contactId} messages (secret not synced?), skipping listener`,
					);
					return;
				}
				trackChain(messagesChain)
					.map()
					.on(async (data: any, gunKey: string) => {
						if (!data || typeof data !== "object" || !data.body || !data.sender)
							return;

						const msgTs = new Date(data.timestamp || Date.now()).getTime();
						const clearedAt = clearedChatsRef.current[contactId] || 0;
						if (msgTs <= clearedAt) {
							if (userPub) saveProcessedKey(userPub, gunKey);
							return;
						}

						if (processedRef.current.has(gunKey)) return;
						if (userPub) {
							processedRef.current.add(gunKey);
							console.log(
								`[Messaging] New message observed: ${gunKey.slice(0, 8)} from ${data.sender.slice(0, 8)}`,
							);
						}

						if (blockedContactsRef.current.has(data.sender)) {
							if (userPub) saveProcessedKey(userPub, gunKey);
							return;
						}

						try {
							// Try to decrypt right away: in the common case the fragments are
							// already synced and the message renders instantly. If sync is
							// still catching up, the retry loop below waits with backoff.
							// decryptMessage resolves to `undefined` instead of throwing when
							// it can't decrypt, so a falsy result must retry as well — the old
							// loop broke out on the first pass and stored an empty message.
							let plaintext = "";
							let retries = 5;
							let delay = 1000;

							while (retries > 0) {
								try {
									const decrypted = isP2P
										? await communicationService!.decryptMessage(
												contactId,
												{ type: data.type, body: data.body },
												data.senderEpub,
											)
										: await groupService.decryptGroupMessage(meta, data.body, data.sender);
									if (decrypted) {
										plaintext = decrypted;
										break;
									}
								} catch (e) {
									console.warn(
										`[Messaging] Decryption threw for ${gunKey.slice(0, 8)}:`,
										e,
									);
								}

								retries--;
								if (retries === 0) {
									// Don't mark it processed: the fragments may still arrive, and
									// any later emission on this node gets another chance.
									console.warn(
										`[Messaging] Could not decrypt ${gunKey.slice(0, 8)} yet, leaving it unprocessed`,
									);
									processedRef.current.delete(gunKey);
									return;
								}
								console.warn(
									`[Messaging] Decryption failed for ${gunKey.slice(0, 8)}, retrying in ${delay}ms... (${retries} left)`,
								);
								await new Promise((r) => setTimeout(r, delay));
								delay += 1000; // Linear backoff
							}

							if (userPub) saveProcessedKey(userPub, gunKey);

							if (
								plaintext === LEGACY_UNSUPPORTED ||
								plaintext === DECRYPT_FAILED
							) {
								console.warn(
									`[Messaging] Skipping undecryptable/legacy message ${gunKey.slice(0, 8)}`,
								);
								return;
							}

							const cleanSender = data.sender.startsWith("~")
								? data.sender.slice(1)
								: data.sender;
							const isMe = cleanSender === userPub;
							const remoteMsgId = data.msgId || gunKey;

							setMessages((prev) => {
								const groupMsgs = prev[contactId] || [];
								const isDuplicate = groupMsgs.some(
									(m) =>
										m.id === remoteMsgId ||
										(m.sender === (isMe ? "Me" : data.sender) &&
											m.text === plaintext &&
											Math.abs(
												m.timestamp.getTime() -
													new Date(data.timestamp || Date.now()).getTime(),
											) < 10000),
								);
								if (isDuplicate) {
									if (groupMsgs.some((m) => m.id === remoteMsgId)) {
										const updatedGroupMsgs = groupMsgs.map((m) =>
											m.id === remoteMsgId
												? { ...m, status: "delivered" as const }
												: m,
										);
										return { ...prev, [contactId]: updatedGroupMsgs };
									}
									return prev;
								}

								const actualType = isP2P
									? data.msgType || "text"
									: data.type || "text";
								const isFile = actualType === "file" || actualType === "image";
								let fileMetadata: FileMetadata | undefined;
								let messageText: string | undefined = plaintext;

								if (isFile) {
									try {
										fileMetadata = JSON.parse(plaintext);
										messageText = undefined;
									} catch (e) {
										console.error(
											"[Messaging] Failed to parse file metadata:",
											e,
										);
									}
								}

								const resolvedType = isP2P
									? isFile
										? fileMetadata?.mimeType.startsWith("image/")
											? "image"
											: "file"
										: data.msgType || "text"
									: (data.type as any) || "text";

								const updatedMessages = [
									...groupMsgs,
									{
										id: remoteMsgId,
										gunKey: gunKey,
										sender: isMe ? "Me" : data.sender,
										senderPub: data.sender,
										text:
											resolvedType === "audio" || isFile
												? undefined
												: messageText,
										audio: resolvedType === "audio" ? plaintext : undefined,
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

							if (
								!isMe &&
								(recipientRef.current !== contactId ||
									document.visibilityState !== "visible")
							) {
								const title = isP2P
									? `Message from ${data.sender.slice(0, 8)}`
									: `New message in ${meta.name}`;
								const options = {
									body: plaintext.substring(0, 50),
									icon: meta.avatar || "./logo.svg",
									badge: "./logo.svg",
									tag: contactId,
									renotify: true,
									data: `/chat/${contactId}`,
								};

								sendAppNotification(title, options);
							}
						} catch (e) {
							console.warn(
								`[Groups] Failed to decrypt message in ${contactId} (${roomId}):`,
								e,
							);
							if (userPub) processedRef.current.delete(gunKey);
						}
					});

				// 2. Listen to Deletions
				const delChain = isP2P
					? db.zen.get(`linda_rooms/${roomId}/deleted_messages`)
					: await communicationService!.getRoomChain(
							roomId,
							roomSecret,
							"deleted_messages",
						);
				if (!delChain) {
					console.warn(
						`[Groups] No room chain for ${contactId} deleted_messages, skipping`,
					);
				} else {
					trackChain(delChain)
						.map()
						.on((data: any, msgId: string) => {
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
					const pinsChain = isP2P
						? db.zen.get(`linda_rooms/${roomId}/pins`)
						: await communicationService!.getRoomChain(
								roomId,
								roomSecret,
								"pins",
							);
					if (pinsChain) {
						trackChain(pinsChain)
							.map()
							.on((ts: any, msgId: string) => {
								setPinnedMessages((prev) => {
									const groupPins = new Set(prev[contactId] || []);
									if (ts) groupPins.add(msgId);
									else groupPins.delete(msgId);
									return { ...prev, [contactId]: groupPins };
								});
							});
					}
				}
			} catch (err) {
				console.warn(
					`[Groups] Failed to start listener for ${contactId}:`,
					err,
				);
			}
		});
	}, [
		contacts,
		groupService,
		db,
		userPub,
		saveMessages,
		saveProcessedKey,
		trackChain,
		resumeTick,
		groupKeyTick,
	]);

	// Removed Admin TPRE Reactor

	// ── Signal 1:1 Messaging (Inbox) ──
	useEffect(() => {
		if (!communicationService || !userPub) return;
		const sessionStartTime = Date.now();
		console.log(`[Signal] Listener started at ${sessionStartTime}`);

		const handleInboxItem = async (data: any, gunKey: string) => {
			// 1. Strict Data Validation (Avoid GunDB type errors and malformed nodes)
			if (!data || typeof data !== "object") {
				if (data !== null)
					console.warn(
						`[Signal] Skipping non-object inbox data at ${gunKey}:`,
						data,
					);
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
				console.log(
					`[Signal] Ignoring message from blocked contact: ${senderPubKeyRaw.slice(0, 8)}`,
				);
				if (userPub) saveProcessedKey(userPub, gunKey);
				return;
			}

			// Skip self-messages in inbox to prevent duplication in My Cloud
			// When we send to ourselves, the optimistic update in handleSendMessage already added the message.
			// The inbox listener firing again would create a duplicate.
			// Use messagesRef (always current) instead of the `messages` closure which
			// was captured at listener-creation time and is always stale (BUG #4 fix).
			const cleanSenderInbox = senderPubKeyRaw.startsWith("~")
				? senderPubKeyRaw.slice(1)
				: senderPubKeyRaw;
			if (cleanSenderInbox === userPub) {
				const selfMsgId = data.msgId;
				if (selfMsgId) {
					// Check if we already have this message from the optimistic update
					const existingMsgs = messagesRef.current[userPub] || [];
					if (existingMsgs.some((m) => m.id === selfMsgId)) {
						console.log(
							`[Signal] Skipping self-message ${selfMsgId} (already in local state via optimistic update)`,
						);
						if (userPub) saveProcessedKey(userPub, gunKey);
						return;
					}
				}
			}

			// DIAGNOSTIC: Log every incoming raw inbox item
			console.log(
				`[Signal] Raw inbox hit: ${gunKey} from ${senderPubKeyRaw.slice(0, 8)}... (body type: ${typeof data.body})`,
			);

			// Convert timestamp safely
			let messageTimestamp: Date;
			try {
				const rawTs = data.timestamp || Date.now();
				messageTimestamp = new Date(
					typeof rawTs === "string" || typeof rawTs === "number"
						? rawTs
						: Date.now(),
				);
				if (isNaN(messageTimestamp.getTime())) messageTimestamp = new Date();
			} catch (e) {
				messageTimestamp = new Date();
			}

			if (processedRef.current.has(gunKey)) return;

			if (!messageQueueRef.current[senderPubKeyRaw]) {
				messageQueueRef.current[senderPubKeyRaw] = Promise.resolve();
			}

			// Chain the message processing to ensure sequential execution per sender
			messageQueueRef.current[senderPubKeyRaw] = messageQueueRef.current[
				senderPubKeyRaw
			].then(async () => {
				try {
					if (processedRef.current.has(gunKey)) return;
					await communicationService.waitReady();

					try {
						const plaintextValue = await communicationService.decryptMessage(
							senderPubKeyRaw,
							{
								type: data.type,
								body: data.body,
							},
							data.senderEpub,
						);

						if (userPub) saveProcessedKey(userPub, gunKey);

						if (plaintextValue && plaintextValue.startsWith("DELETE:")) {
							const deletedMsgId = plaintextValue.split(":")[1];
							console.log(
								`[Signal] Received DELETE signal for msg ${deletedMsgId} from ${senderPubKeyRaw.slice(0, 8)}`,
							);
							setDeletedMessages((prev) => {
								const contactDeletions = new Set(prev[senderPubKeyRaw] || []);
								contactDeletions.add(deletedMsgId);
								const next = { ...prev, [senderPubKeyRaw]: contactDeletions };
								if (userPub) saveDeletedMessages(userPub, next);
								return next;
							});
						} else if (
							plaintextValue &&
							plaintextValue.startsWith("P2P_POKE:")
						) {
							const roomId = plaintextValue.split(":")[1];
							console.log(
								`[Signal] Received P2P_POKE for room ${roomId.slice(0, 8)}. Promoting sender to contacts.`,
							);
							setContacts((prev) => {
								if (!prev.includes(senderPubKeyRaw)) {
									saveContact(senderPubKeyRaw);
									return [...prev, senderPubKeyRaw];
								}
								return prev;
							});
						} else if (
							plaintextValue === LEGACY_UNSUPPORTED ||
							plaintextValue === DECRYPT_FAILED
						) {
							// Ignore legacy / permanently undecryptable signals
						} else if (plaintextValue && plaintextValue.startsWith("{")) {
							try {
								const parsed = JSON.parse(plaintextValue);
								if (
									data.type === "GROUP_KEY_ROTATION" ||
									parsed.type === "GROUP_KEY_ROTATION"
								) {
									groupService?.setLocalSecret(
										parsed.groupId,
										parsed.newSecret,
									);
									rearmRoom(parsed.groupId);
									console.log(
										`[Signal] Processed GROUP_KEY_ROTATION for room ${parsed.groupId.slice(0, 8)}`,
									);
								} else if (
									data.type === "GROUP_JOIN_REQUEST" ||
									parsed.type === "GROUP_JOIN_REQUEST"
								) {
									const role = await groupService?.getMemberRole(
										parsed.groupId,
										senderPubKeyRaw,
									);
									if (role) {
										const secret =
											groupService?.getLocalSecret(parsed.groupId) ||
											(await groupService?.recoverSecret(parsed.groupId));
										if (secret) {
											await communicationService?.sendMessage(
												senderPubKeyRaw,
												JSON.stringify({
													type: "GROUP_KEY_DISTRIBUTION",
													groupId: parsed.groupId,
													secret: secret,
												}),
												"GROUP_KEY_DISTRIBUTION",
											);
											console.log(
												`[Signal] Sent GROUP_KEY_DISTRIBUTION to ${senderPubKeyRaw.slice(0, 8)}`,
											);
										}
									}
								} else if (
									data.type === "GROUP_KEY_DISTRIBUTION" ||
									parsed.type === "GROUP_KEY_DISTRIBUTION"
								) {
									groupService?.setLocalSecret(parsed.groupId, parsed.secret);
									rearmRoom(parsed.groupId);
									console.log(
										`[Signal] Received GROUP_KEY_DISTRIBUTION for room ${parsed.groupId.slice(0, 8)}`,
									);
								}
							} catch (e) {
								console.log(
									`[Signal] Received unhandled JSON message from ${senderPubKeyRaw.slice(0, 8)} in inbox.`,
								);
							}
						} else {
							console.log(
								`[Signal] Received unhandled message from ${senderPubKeyRaw.slice(0, 8)} in inbox.`,
							);
						}
					} catch (e: any) {}
				} catch (e: any) {
					console.error("[Signal] messageQueue error:", e);
				}
			});
		};

		// Legacy public inbox node (transition) + cert-gated user-space inbox.
		// Writes now land on ~pub/linda_inbox_v13/msgs carrying the recipient's cert,
		// so anonymous relay spam on the legacy public node is ignored.
		trackChain(db.zen.get(`linda_v3_inbox_${userPub}`))
			.map()
			.on(handleInboxItem);
		trackChain(db.zen.get(`~${userPub}/linda_inbox_v13/msgs`))
			.map()
			.on(handleInboxItem);
	}, [
		userPub,
		communicationService,
		db,
		saveMessages,
		saveProcessedKey,
		setRecipient,
		trackChain,
		rearmRoom,
		resumeTick,
	]);

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
					const pub =
						recipient.length < 30
							? await communicationService.getPubKeyFromUsername(recipient)
							: recipient;
					path = `linda_v2_typing_${pub}`;
				}
				db.zen
					.get(path)
					.get(userPub)
					.put({
						typing: true,
						ts: now.toString(),
						s: generateSecureRandomString(4),
					} as any);
			} catch (e) {}
		}
	}, [recipient, userPub, communicationService, db]);

	const handleSendMessage = useCallback(
		async (message?: string, audio?: string, fileMetadata?: FileMetadata) => {
			if (
				!recipient ||
				(!message && !audio && !fileMetadata) ||
				!communicationService ||
				!userPub ||
				!groupService
			)
				return;
			if (blockedContactsRef.current.has(recipient)) {
				console.warn(
					`[Messaging] Cannot send message to blocked contact ${recipient}`,
				);
				return;
			}

			await communicationService.waitReady();
			const msgId = crypto.randomUUID
				? crypto.randomUUID()
				: Date.now().toString() + generateSecureRandomString(10);
			const timestamp = new Date();

			let type: Message["type"] = "text";
			if (audio) type = "audio";
			else if (fileMetadata) {
				type = fileMetadata.mimeType.startsWith("image/") ? "image" : "file";
			}

			// Extract hashtags if it's a text message
			const tags: string[] = [];
			if (type === "text" && message) {
				const hashtagRegex = /#(\w+)/g;
				let match;
				while ((match = hashtagRegex.exec(message)) !== null) {
					tags.push(match[1].toLowerCase());
				}
			}

			// 1. Optimistic Update: Add message immediately with "sending" status
			setMessages((prev) => {
				const currentMsgs = prev[recipient] || [];
				if (currentMsgs.some((m) => m.id === msgId)) return prev;

				const next = {
					...prev,
					[recipient]: [
						...currentMsgs,
						{
							id: msgId,
							sender: "Me",
							senderPub: userPub,
							text: type === "text" ? message : undefined,
							audio: type === "audio" ? audio : undefined,
							fileMetadata:
								type === "file" || type === "image" ? fileMetadata : undefined,
							tags: tags.length > 0 ? tags : undefined,
							type: type,
							timestamp,
							status: "sending" as const,
						} as Message,
					],
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
				const payload =
					audio || (fileMetadata ? JSON.stringify(fileMetadata) : message);

				if (isGroup) {
					const canSend = await groupService.canPerform(
						recipient,
						"send_message",
					);
					if (!canSend) {
						throw new Error(
							"You do not have permission to send messages in this group",
						);
					}

					const myRole = await groupService.getMemberRole(recipient, userPub);
					if (!myRole) throw new Error("Not a member");
					const meta = await (db.Get as any)(`linda_rooms/${recipient}/meta`);
					if (!meta) throw new Error("Group metadata not found");
					ciphertext = await groupService.encryptGroupMessage(
						meta,
						payload || "",
					);
					const groupSecret =
						groupService.getLocalSecret(recipient, meta?.secret) ||
						(await groupService.recoverSecret(recipient));
					// ponytail: cert-gated room write — only holders of the room secret
					// (group members) can write to the room's message node.
					await communicationService.certifiedRoomWrite(
						recipient,
						groupSecret,
						"messages",
						{
							msgId,
							sender: userPub,
							body: ciphertext,
							timestamp: timestamp.toISOString(),
							type,
						} as any,
						msgId,
					);
				} else {
					// 1:1 direct message -> P2P ECDH
					console.log(
						`[Signal] Using P2P ECDH for 1:1 chat with ${recipient.slice(0, 8)}...`,
					);
					const p2pGroup = await groupService.getOrCreateP2PGroup(recipient);

					const pokeCipher = await communicationService.encryptMessage(
						recipient,
						payload || "",
					);

					// Write to the P2P room messages node
					await db.Set(`linda_rooms/${p2pGroup.id}/messages`, {
						msgId,
						sender: userPub,
						body: pokeCipher.body,
						timestamp: timestamp.toISOString(),
						type: pokeCipher.type,
						msgType: type,
					} as any);

					// POKING: We still write a minimal 'poke' to signal_v3_inbox so their app knows to check the P2P room
					try {
						const pokeMsg = await communicationService.encryptMessage(
							recipient,
							`P2P_POKE:${p2pGroup.id}`,
						);

						// No certificate here: linda_v3_inbox_* is a public root node, not
						// user-space (~pub/...), so writes need no authorization. Fetching one
						// blocked the poke for up to ~115s (10 attempts x 3 lookups x 3s
						// timeouts) whenever the peer had published no cert — and the poke is
						// what makes an unknown sender appear in the recipient's contact list,
						// which is what starts their room listener.
						await db.Set(`linda_v3_inbox_${recipient}`, {
							sender: userPub,
							type: pokeMsg.type,
							body: pokeMsg.body,
							timestamp: timestamp.toISOString(),
							msgType: "p2p_poke",
						} as any);
					} catch (e) {
						console.warn(
							"[Signal] Failed to send P2P_POKE, recipient might take longer to sync.",
							e,
						);
					}
				}

				setContactErrors((prev) => ({ ...prev, [recipient]: false }));

				// 2. Success Update: Change status from "sending" to "sent"
				setMessages((prev) => {
					const currentMsgs = prev[recipient] || [];
					const msgIndex = currentMsgs.findIndex((m) => m.id === msgId);

					if (msgIndex === -1) return prev;

					// Only update to "sent" if current status is "sending"
					// This avoids overwriting "delivered" or "read" if the listener already updated it
					if (currentMsgs[msgIndex].status !== "sending") return prev;

					const updatedMsgs = [...currentMsgs];
					updatedMsgs[msgIndex] = {
						...updatedMsgs[msgIndex],
						status: "sent" as const,
					};

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
		},
		[recipient, communicationService, userPub, groupService, db, saveMessages],
	);

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
					// ponytail: also nullify the actual message node via cert-gated write
					// so a non-member/leaker (who only knows the room UUID) can't keep it.
					try {
						const secret = groupService.getLocalSecret(recipient);
						const gunKey = messages[recipient]?.find(
							(m) => m.id === messageId,
						)?.gunKey;
						if (secret && gunKey && communicationService) {
							await communicationService.certifiedRoomWrite(
								recipient,
								secret,
								"messages",
								null,
								gunKey,
							);
						}
					} catch (e) {
						console.warn("[Signal] cert-gated group nullify failed:", e);
					}
				} else {
					// Private chat deletion protocol
					console.log(`[Signal] Deleting private message ${messageId}...`);

					// 0. Physical deletion from Zen node if we have the gunKey or room ID
					const msgs = messages[recipient] || [];
					const msgToDelete = msgs.find((m) => m.id === messageId);
					if (groupService && db.zen) {
						try {
							const p2pGroup =
								await groupService.getOrCreateP2PGroup(recipient);
							if (msgToDelete?.gunKey) {
								const path = `linda_rooms/${p2pGroup.id}/messages`;
								console.log(
									`[Signal] Nullifying node at ${path}/${msgToDelete.gunKey}`,
								);
								db.zen
									.get(path)
									.get(msgToDelete.gunKey)
									.put(null as any);
							}
						} catch (e) {
							console.warn(
								"[Signal] Failed to nullify P2P room message node:",
								e,
							);
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

						// Public root node — no certificate required (see P2P_POKE above).
						await db.Set(`linda_v3_inbox_${pub}`, {
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

	const handleClearChat = useCallback(
		async (contactId: string) => {
			if (!userPub || !db.zen) return;
			const msgs = messages[contactId] || [];
			const now = Date.now();

			// 1. Record clearedAt timestamp persistently
			setClearedChats((prev) => {
				const next = { ...prev, [contactId]: now };
				saveClearedChats(userPub, next);
				return next;
			});

			// 2. Clear from GunDB
			const isGroup = contactId.length === 36 && contactId.includes("-");
			let roomId = contactId;
			if (!isGroup && groupService) {
				const calculatedId = await groupService.getP2PGroupId(contactId);
				if (calculatedId) roomId = calculatedId;
			}
			const path = `linda_rooms/${roomId}/messages`;

			msgs.forEach((m) => {
				if (m.gunKey) {
					try {
						db.zen
							.get(path)
							.get(m.gunKey)
							.put(null as any);
					} catch (e) {}
				}
			});

			// ponytail: for groups, also nullify the cert-gated room message node
			// so a leaker (room UUID only, no secret) can't keep messages alive.
			if (isGroup && communicationService && groupService) {
				try {
					const secret = groupService.getLocalSecret(roomId);
					if (secret) {
						for (const m of msgs) {
							if (m.gunKey) {
								await communicationService.certifiedRoomWrite(
									roomId,
									secret,
									"messages",
									null,
									m.gunKey,
								);
							}
						}
					}
				} catch (e) {
					console.warn("[Clear] cert-gated nullify failed:", e);
				}
			}

			try {
				db.zen
					.get(`linda_v3_inbox_${userPub}`)
					.get(contactId)
					.put(null as any);
			} catch (e) {}

			// 3. Clear from local state and Storage
			setMessages((prev) => {
				const next = { ...prev };
				delete next[contactId];
				saveMessages(userPub, next);
				return next;
			});

			setContacts((prev) => prev.filter((c) => c !== contactId));
		},
		[
			userPub,
			db,
			messages,
			saveMessages,
			saveClearedChats,
			groupService,
			communicationService,
		],
	);

	const handleFixSync = useCallback(
		async (contactId: string) => {
			if (!communicationService || !userPub) return;
			console.log(`[Signal] Manual Fix Sync for ${contactId}...`);
			try {
				// 1. Double Ratchet Repair
				await communicationService.resetSession(contactId);
				await communicationService.republishBundle().catch(() => {});

				const ping = await communicationService.encryptMessage(
					contactId,
					"PING_HEAL",
				);
				const pub =
					contactId.length < 30
						? await communicationService.getPubKeyFromUsername(contactId)
						: contactId;
				await db.Set(`linda_v3_inbox_${pub}`, {
					sender: userPub,
					type: ping.type,
					body: ping.body,
					timestamp: new Date().toISOString(),
				} as any);

				setContactErrors((prev) => ({ ...prev, [contactId]: false }));
				showNotification?.("Synchronization repaired", "info");
			} catch (e) {
				console.error("[Signal] Fix Sync failed:", e);
				showNotification?.("Repair failed", "error");
			}
		},
		[communicationService, userPub, db, groupService, showNotification],
	);

	const currentMessages = useMemo(() => {
		const msgs = messages[recipient] || [];
		const deletions = deletedMessages[recipient] || new Set();
		return msgs.filter((m) => !deletions.has(m.id));
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
				const addedUnread = newMessages.filter(
					(m) => m.sender === c && m.status !== "read",
				).length;
				counts[c] = prevCount + addedUnread;
			} else {
				// 3. Fallback: Full scan for first load, deletions, or status updates
				counts[c] = currentMsgs.filter(
					(m) => m.sender === c && m.status !== "read",
				).length;
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
		},
	};
};

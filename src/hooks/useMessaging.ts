import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DataBase } from "linda-core";
import { CommunicationService } from "linda-core";
import { GroupService, type GroupInfo } from "linda-core";
import { generateSecureRandomString } from "linda-core";
import { DECRYPT_FAILED, LEGACY_UNSUPPORTED } from "linda-core";
import { sendAppNotification } from "../utils/notifications";
import { requestGroupSecret } from "../utils/inboxSignal";
import { groupPath, isGroupId } from '../utils/groupPath.js';

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
	editedAt?: number;
	replyTo?: string;
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
	// contactId -> messageId -> reactorPub -> emoji
	const [messageReactions, setMessageReactions] = useState<
		Record<string, Record<string, Record<string, string>>>
	>({});
	const [clearedChats, setClearedChats] = useState<Record<string, number>>({});

	const clearedChatsRef = useRef<Record<string, number>>({});
	const processedRef = useRef<Set<string>>(new Set());
	const blockedContactsRef = useRef<Set<string>>(new Set());
	// Guards the contacts listener against replayed/reordered echoes of our
	// own writes: Zen delivers a node's history to .on() as it resolves from
	// cache vs relay, not strictly latest-write-wins-first, so a stale "true"
	// from before we blocked someone can resurface later — and does, every
	// time the listener re-attaches on tab-visibility resume (a session can
	// hit that constantly). A short time window isn't enough insulation, so
	// once we've made a local contact decision this session we keep
	// overriding contradicting listener events for that id indefinitely,
	// until we make a different local decision for it ourselves.
	const recentContactActionRef = useRef<Map<string, boolean | null>>(
		new Map(),
	);
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
	const markedReadRef = useRef<Set<string>>(new Set());

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

	// Attaches one handler across every epoch's room node. A key rotation moves
	// the room to a new soul, so the current chain alone shows nothing written
	// before the last kick — the handlers have to run on the old nodes too.
	const attachAll = useCallback(
		(chains: any[], handler: (data: any, key: string) => void) => {
			for (const chain of chains) {
				if (chain) trackChain(chain).map().on(handler);
			}
		},
		[trackChain],
	);

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

	// Mark incoming messages in the open chat as read, once each. The listener
	// above (6. Read Receipts) turns this into the sender's "read" checkmark;
	// the local flip below is what actually clears our own unread badge —
	// unreadCounts reads status off our own copy, not the sender's.
	useEffect(() => {
		if (!recipient || !groupService || !userPub) return;
		if (document.visibilityState !== "visible") return;
		const currentMsgs = messages[recipient] || [];
		const toMark = currentMsgs.filter((m) => {
			if (m.sender === "Me" || m.status === "read") return false;
			const key = `${recipient}:${m.id}`;
			if (markedReadRef.current.has(key)) return false;
			markedReadRef.current.add(key);
			return true;
		});
		if (!toMark.length) return;

		setMessages((prev) => {
			const groupMsgs = prev[recipient] || [];
			const toMarkIds = new Set(toMark.map((m) => m.id));
			const updatedGroupMsgs = groupMsgs.map((m) =>
				toMarkIds.has(m.id) ? { ...m, status: "read" as const } : m,
			);
			return { ...prev, [recipient]: updatedGroupMsgs };
		});

		(async () => {
			// GroupService looks up membership/meta at groupPath(roomId) — for a
			// P2P chat that's the deterministic p2p_<sortedPubs> id, not the raw
			// peer pubkey `recipient` itself. Passing the raw pubkey here always
			// missed that node, so canPerform found no role and every one of
			// these calls silently failed with "Unauthorized".
			const roomId = isGroupId(recipient)
				? recipient
				: await groupService.getP2PGroupId(recipient);
			for (const m of toMark) {
				groupService.markMessageRead(roomId, m.id).catch(() => {
					markedReadRef.current.delete(`${recipient}:${m.id}`);
				});
			}
		})();
	}, [recipient, messages, groupService, userPub]);

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
				setContacts(
					Object.keys(parsed).filter(
						(c) =>
							c !== user &&
							DataBase.cleanPub(c) !== DataBase.cleanPub(user),
					),
				);
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
			recentContactActionRef.current.set(contactId, true);
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
			recentContactActionRef.current.set(contactId, null);
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
				const recentAction = recentContactActionRef.current.get(contactId);
				if (recentAction !== undefined && recentAction !== data) {
					return;
				}

				const isSelfContact =
					contactId === userPub ||
					DataBase.cleanPub(contactId) === DataBase.cleanPub(userPub);

				if (data === true) {
					if (!isSelfContact) {
						setContacts((prev) =>
							prev.includes(contactId) ? prev : [...prev, contactId],
						);
						setTrustedContacts((prev) => new Set(prev).add(contactId));
					}
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
		if (
			recipient &&
			userPub &&
			recipient !== userPub &&
			DataBase.cleanPub(recipient) !== DataBase.cleanPub(userPub) &&
			!contacts.includes(recipient) &&
			!blockedContacts.has(recipient)
		) {
			saveContact(recipient);
		}
	}, [recipient, userPub, contacts, blockedContacts, saveContact]);

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
			recentContactActionRef.current.set(contactId, true);
			db.zen
				.get(`linda_v3_contacts_${userPub}`)
				.get(contactId)
				.put(true as any);

			// Optimistic: the contacts listener mirrors this write back, but that
			// round-trips through the relay — don't wait on it to reflect our own action.
			setContacts((prev) =>
				prev.includes(contactId) ? prev : [...prev, contactId],
			);
			setTrustedContacts((prev) => new Set(prev).add(contactId));
			setBlockedContacts((prev) => {
				if (!prev.has(contactId)) return prev;
				const next = new Set(prev);
				next.delete(contactId);
				blockedContactsRef.current = next;
				return next;
			});
		},
		[userPub, db, communicationService],
	);

	const blockContact = useCallback(
		async (contactId: string) => {
			if (!userPub || !db.zen || !communicationService) return;
			console.log(`[Messaging] Blocking contact: ${contactId.slice(0, 8)}`);

			// Arm the guard and local state FIRST, synchronously — revokeCertificate
			// below is a network/crypto call that can take seconds (observed 2s+),
			// and every incoming-message listener gates on blockedContactsRef. Doing
			// this after the await left that whole window unguarded: an in-flight
			// P2P_POKE or contacts-listener echo from the peer could still land and
			// re-add them to contacts before the block ever took effect.
			recentContactActionRef.current.set(contactId, false);
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
			if (recipient === contactId) {
				setRecipient("");
			}

			db.zen
				.get(`linda_v3_contacts_${userPub}`)
				.get(contactId)
				.put(false as any);

			await communicationService.revokeCertificate(contactId);
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
						`${groupPath(roomId)}/meta`,
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
						`${groupPath(roomId)}/meta`,
					)) as GroupInfo;
					for (let i = 0; i < 5 && (!meta || (meta as any).err); i++) {
						await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
						meta = (await (db.Get as any)(
							`${groupPath(roomId)}/meta`,
						)) as GroupInfo;
					}
					if (!meta || (meta as any).err) return;
				}

				// 1. Listen to Messages
				// syncGroupKey covers all three ways the local key can be wrong: it can
				// be missing (storage wipe, fresh device — the escrow still has it), or
				// present but rotated out while we were offline, which no amount of
				// reading localStorage can detect since a dead key is still well-formed.
				const roomSecret = isP2P
					? ""
					: await groupService.syncGroupKey(roomId);
				// Writes go to the current key; reads span every epoch we hold.
				const roomSecrets = isP2P
					? []
					: groupService.getAllLocalSecrets(roomId).map((k) => k.secret);
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

				const messagesChains = isP2P
					? [db.zen.get(`${groupPath(roomId)}/messages`)]
					: await communicationService!.getRoomChains(
							roomId,
							roomSecrets,
							"messages",
						);
				if (!messagesChains.length) {
					console.warn(
						`[Groups] No room chain for ${contactId} messages (secret not synced?), skipping listener`,
					);
					return;
				}
				attachAll(
					messagesChains,
					async (data: any, gunKey: string) => {
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
										replyTo: data.replyTo,
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

				// 2. Listen to Deletions. P2P deletes arrive as a cert-gated DELETE:
				// signal via the inbox listener instead (see handleDeleteMessage) —
				// this open room node is unauthenticated and, for P2P, unused by our
				// own write path, so trusting it would let anyone who computes the
				// deterministic p2p_<sortedPubs> id forge a deletion.
				const delChains = isP2P
					? []
					: await communicationService!.getRoomChains(
							roomId,
							roomSecrets,
							"deleted_messages",
						);
				if (!delChains.length && !isP2P) {
					console.warn(
						`[Groups] No room chain for ${contactId} deleted_messages, skipping`,
					);
				}
				if (delChains.length) {
					attachAll(delChains, (data: any, msgId: string) => {
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
				}
				{
					// 3. Listen to Pins. P2P pins/reactions/edits/receipts arrive as
					// P2P_ROOM_MIRROR envelopes via the cert-gated inbox instead (see
					// GroupService.mirrorToCertifiedRoom) — these open room nodes are
					// unauthenticated and, for P2P, no longer what our own write path
					// (or GroupService.canPerform, which needs the p2p_ room id, not
					// the raw peer pubkey) actually targets.
					const pinsChains = isP2P
						? []
						: await communicationService!.getRoomChains(
								roomId,
								roomSecrets,
								"pins",
							);
					if (pinsChains.length) {
						attachAll(pinsChains, (ts: any, msgId: string) => {
							setPinnedMessages((prev) => {
								const groupPins = new Set(prev[contactId] || []);
								if (ts) groupPins.add(msgId);
								else groupPins.delete(msgId);
								return { ...prev, [contactId]: groupPins };
							});
						});
					}

					// 4. Listen to Reactions. Key is "<messageId>::<reactorPub>",
					// value is {emoji,...} or null when the reactor cleared it.
					const reactionChains = isP2P
						? []
						: await communicationService!.getRoomChains(
								roomId,
								roomSecrets,
								"reactions",
							);
					if (reactionChains.length) {
						attachAll(reactionChains, (data: any, key: string) => {
							const sep = key.indexOf("::");
							if (sep === -1) return;
							const msgId = key.slice(0, sep);
							const reactorPub = key.slice(sep + 2);
							setMessageReactions((prev) => {
								const groupReactions = { ...(prev[contactId] || {}) };
								const forMsg = { ...(groupReactions[msgId] || {}) };
								if (data && data.emoji) forMsg[reactorPub] = data.emoji;
								else delete forMsg[reactorPub];
								groupReactions[msgId] = forMsg;
								return { ...prev, [contactId]: groupReactions };
							});
						});
					}

					// 5. Listen to Edits. Value is {body: <ciphertext>, editedAt}.
					const editChains = isP2P
						? []
						: await communicationService!.getRoomChains(
								roomId,
								roomSecrets,
								"edited_messages",
							);
					if (editChains.length) {
						attachAll(editChains, async (data: any, msgId: string) => {
							if (!data || !data.body) return;
							try {
								const existing = messagesRef.current[contactId]?.find(
									(m) => m.id === msgId,
								);
								if (!existing) return;
								const decrypted = await groupService.decryptGroupMessage(
									meta,
									data.body,
									existing.senderPub,
								);
								if (!decrypted) return;
								setMessages((prev) => {
									const groupMsgs = prev[contactId] || [];
									const updatedGroupMsgs = groupMsgs.map((m) =>
										m.id === msgId
											? { ...m, text: decrypted, editedAt: data.editedAt }
											: m,
									);
									const updated = { ...prev, [contactId]: updatedGroupMsgs };
									if (userPub) saveMessages(userPub, updated);
									return updated;
								});
							} catch (e) {
								console.warn(
									`[Messaging] Failed to decrypt edit for ${msgId}:`,
									e,
								);
							}
						});
					}

					// 6. Listen to Read Receipts. Key is "<messageId>::<readerPub>".
					// Any reader other than the sender flips the sender's copy to "read".
					const receiptChains = isP2P
						? []
						: await communicationService!.getRoomChains(
								roomId,
								roomSecrets,
								"read_receipts",
							);
					if (receiptChains.length) {
						attachAll(receiptChains, (_data: any, key: string) => {
							const sep = key.indexOf("::");
							if (sep === -1) return;
							const msgId = key.slice(0, sep);
							const readerPub = key.slice(sep + 2);
							if (readerPub === userPub) return;
							setMessages((prev) => {
								const groupMsgs = prev[contactId] || [];
								const target = groupMsgs.find((m) => m.id === msgId);
								if (!target || target.status === "read") return prev;
								const updatedGroupMsgs = groupMsgs.map((m) =>
									m.id === msgId ? { ...m, status: "read" as const } : m,
								);
								return { ...prev, [contactId]: updatedGroupMsgs };
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
		attachAll,
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
					// Re-check: this item may have been queued before the sender was
					// blocked. The queue can take seconds to drain (sequential decrypts),
					// so a block applied mid-drain must still stop already-queued items —
					// otherwise a backlogged P2P_POKE re-adds the blocked sender to
					// contacts right after blocking them.
					if (blockedContactsRef.current.has(senderPubKeyRaw)) {
						if (userPub) saveProcessedKey(userPub, gunKey);
						return;
					}
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
										parsed.epoch,
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
										// Sync rather than read: answering with a key we were
										// rotated off would hand the joiner a dead one.
										const secret = await groupService?.syncGroupKey(
											parsed.groupId,
										);
										if (secret) {
											await communicationService?.sendMessage(
												senderPubKeyRaw,
												JSON.stringify({
													type: "GROUP_KEY_DISTRIBUTION",
													groupId: parsed.groupId,
													secret: secret,
													epoch: groupService?.getLocalEpoch(parsed.groupId),
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
									groupService?.setLocalSecret(
										parsed.groupId,
										parsed.secret,
										parsed.epoch,
									);
									rearmRoom(parsed.groupId);
									console.log(
										`[Signal] Received GROUP_KEY_DISTRIBUTION for room ${parsed.groupId.slice(0, 8)}`,
									);
								} else if (
									data.type === "P2P_CHAT" ||
									parsed.type === "P2P_CHAT"
								) {
									// Delivered via the cert-gated inbox — see the send-side
									// comment in handleSendMessage. blockedContactsRef was
									// already checked twice before we got here (enqueue time
									// and just above, before decrypt), so a currently-blocked
									// sender never reaches this branch.
									const remoteMsgId = parsed.msgId || gunKey;
									const clearedAt =
										clearedChatsRef.current[senderPubKeyRaw] || 0;
									const msgTs = new Date(
										data.timestamp || Date.now(),
									).getTime();
									if (msgTs > clearedAt) {
										const actualType = parsed.msgType || "text";
										const isFile =
											actualType === "file" || actualType === "image";
										let fileMetadata: FileMetadata | undefined;
										let messageText: string | undefined = parsed.text;
										if (isFile) {
											try {
												fileMetadata = JSON.parse(parsed.text);
												messageText = undefined;
											} catch (e) {
												console.error(
													"[Messaging] Failed to parse file metadata:",
													e,
												);
											}
										}

										setMessages((prev) => {
											const existing = prev[senderPubKeyRaw] || [];
											if (existing.some((m) => m.id === remoteMsgId))
												return prev;
											const next = {
												...prev,
												[senderPubKeyRaw]: [
													...existing,
													{
														id: remoteMsgId,
														sender: senderPubKeyRaw,
														senderPub: senderPubKeyRaw,
														text:
															actualType === "audio" || isFile
																? undefined
																: messageText,
														audio:
															actualType === "audio"
																? parsed.text
																: undefined,
														fileMetadata,
														type: actualType,
														timestamp: new Date(
															data.timestamp || Date.now(),
														),
														status: "delivered" as const,
														replyTo: parsed.replyTo,
													} as Message,
												],
											};
											if (userPub) saveMessages(userPub, next);
											return next;
										});

										if (
											recipientRef.current !== senderPubKeyRaw ||
											document.visibilityState !== "visible"
										) {
											sendAppNotification(
												`Message from ${senderPubKeyRaw.slice(0, 8)}`,
												{
													body: (parsed.text || "").substring(0, 50),
													icon: "./logo.svg",
													badge: "./logo.svg",
													tag: senderPubKeyRaw,
													renotify: true,
													data: `/chat/${senderPubKeyRaw}`,
												},
											);
										}
									}
								} else if (
								data.type === "P2P_ROOM_MIRROR" ||
								parsed.type === "P2P_ROOM_MIRROR"
							) {
								// Cert-gated equivalent of GroupService.mirrorToCertifiedRoom
								// for P2P — see the comment there. subpath/key/data mirror the
								// shape the (now-unlistened) open room node used to carry.
								const { subpath, key, data: value } = parsed;
								if (subpath === "pins" && typeof key === "string") {
									setPinnedMessages((prev) => {
										const contactPins = new Set(prev[senderPubKeyRaw] || []);
										if (value) contactPins.add(key);
										else contactPins.delete(key);
										return { ...prev, [senderPubKeyRaw]: contactPins };
									});
								} else if (subpath === "reactions" && typeof key === "string") {
									const sep = key.indexOf("::");
									if (sep !== -1) {
										const msgId = key.slice(0, sep);
										const reactorPub = key.slice(sep + 2);
										setMessageReactions((prev) => {
											const contactReactions = {
												...(prev[senderPubKeyRaw] || {}),
											};
											const forMsg = { ...(contactReactions[msgId] || {}) };
											if (value && value.emoji) forMsg[reactorPub] = value.emoji;
											else delete forMsg[reactorPub];
											contactReactions[msgId] = forMsg;
											return { ...prev, [senderPubKeyRaw]: contactReactions };
										});
									}
								} else if (
									subpath === "edited_messages" &&
									typeof key === "string" &&
									value?.body
								) {
									try {
										const existing = messagesRef.current[
											senderPubKeyRaw
										]?.find((m) => m.id === key);
										if (existing) {
											const decrypted =
												await communicationService.decryptMessage(
													senderPubKeyRaw,
													JSON.parse(value.body),
												);
											if (decrypted) {
												setMessages((prev) => {
													const contactMsgs = prev[senderPubKeyRaw] || [];
													const updated = contactMsgs.map((m) =>
														m.id === key
															? {
																	...m,
																	text: decrypted,
																	editedAt: value.editedAt,
																}
															: m,
													);
													const next = {
														...prev,
														[senderPubKeyRaw]: updated,
													};
													if (userPub) saveMessages(userPub, next);
													return next;
												});
											}
										}
									} catch (e) {
										console.warn(
											`[Messaging] Failed to decrypt P2P edit for ${key}:`,
											e,
										);
									}
								} else if (
									subpath === "read_receipts" &&
									typeof key === "string"
								) {
									const sep = key.indexOf("::");
									if (sep !== -1) {
										const msgId = key.slice(0, sep);
										const readerPub = key.slice(sep + 2);
										if (readerPub !== userPub) {
											setMessages((prev) => {
												const contactMsgs = prev[senderPubKeyRaw] || [];
												const target = contactMsgs.find(
													(m) => m.id === msgId,
												);
												if (!target || target.status === "read") return prev;
												const updated = contactMsgs.map((m) =>
													m.id === msgId
														? { ...m, status: "read" as const }
														: m,
												);
												return { ...prev, [senderPubKeyRaw]: updated };
											});
										}
									}
								}
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

		// Pre-contact fallback (PoW-gated, see CommunicationService.getPowInboxSoul)
		// + cert-gated user-space inbox. The old fully-open linda_v3_inbox_<pub>
		// node is no longer written to or read — anonymous writes there cost
		// nothing, so anyone could spam or forge signals; the PoW soul is open
		// to the same strangers but a write actually costs CPU.
		communicationService
			.getPowInboxSoul()
			.then((soul) => {
				trackChain(db.zen.get(`${soul}/${userPub}`))
					.map()
					.on(handleInboxItem);
			})
			.catch((e) =>
				console.error("[Signal] Failed to resolve PoW inbox soul:", e),
			);
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
				const isGroup = isGroupId(recipient);
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
		async (
			message?: string,
			audio?: string,
			fileMetadata?: FileMetadata,
			replyTo?: string,
		) => {
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
							replyTo,
						} as Message,
					],
				};
				saveMessages(userPub, next);
				return next;
			});
			const isSelfRecipient =
				recipient === userPub ||
				DataBase.cleanPub(recipient) === DataBase.cleanPub(userPub);

			if (!isSelfRecipient) {
				setContacts((prev) => {
					if (!prev.includes(recipient)) {
						saveContact(recipient);
						return [...prev, recipient];
					}
					return prev;
				});
			}

			try {
				const isGroup = isGroupId(recipient);
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
					const meta = await (db.Get as any)(`${groupPath(recipient)}/meta`);
					if (!meta) throw new Error("Group metadata not found");
					ciphertext = await groupService.encryptGroupMessage(
						meta,
						payload || "",
					);
					// Sync rather than read: writing under a key we were rotated off
					// puts the message in the previous epoch's room node, where no
					// remaining member is listening.
					const groupSecret = await groupService.syncGroupKey(recipient);
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
							...(replyTo ? { replyTo } : {}),
						} as any,
						msgId,
					);
				} else {
					// 1:1 direct message -> delivered through the recipient's cert-gated
					// inbox (~pub/linda_inbox_v13), the same certificate issued on
					// contact accept and revoked on block. sendMessage prefers that
					// path and falls back to the open room chain only when no cert
					// exists yet (first message before mutual accept) — so a
					// legitimately not-yet-fully-accepted chat never silently fails.
					// Once a cert exists it's the only delivery path: a blocked peer's
					// cert is revoked, so their honest client's write is rejected by
					// Zen's own ownership verification on ingestion — enforced by any
					// compliant client, not just our own message filter. The old open
					// P2P room chain (linda_rooms/p2p_.../messages) still carries
					// reactions/edits/pins/deletes, which key off msgId independently
					// of where the message text itself lives.
					console.log(
						`[Signal] Delivering P2P message to ${recipient.slice(0, 8)} via cert-gated inbox...`,
					);
					const p2pGroup = await groupService.getOrCreateP2PGroup(recipient);

					await communicationService.sendMessage(
						recipient,
						JSON.stringify({
							type: "P2P_CHAT",
							msgId,
							msgType: type,
							text: payload || "",
							...(replyTo ? { replyTo } : {}),
						}),
						"p2p_chat",
					);

					// POKING: We still send a minimal 'poke' so their app knows to check
					// the P2P room. No cert exists yet at first contact, so this goes
					// through sendMessage's PoW-gated fallback (getPowInboxSoul) rather
					// than a free-for-anyone open node — the poke is what makes an
					// unknown sender appear in the recipient's contact list, which is
					// what starts their room listener, so it can't require a cert.
					try {
						await communicationService.sendMessage(
							recipient,
							`P2P_POKE:${p2pGroup.id}`,
							"p2p_poke",
						);
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

			const isGroup = isGroupId(recipient);

			try {
				if (isGroup) {
					if (!groupService) return;
					console.log(`[Signal] Deleting group message ${messageId}...`);
					await groupService.deleteMessage(
						recipient,
						messageId,
						senderPub || "",
					);

					// Mark as deleted locally: the deletions listener will confirm
					// this once the write round-trips, but that's not instant and
					// the message must disappear the moment delete succeeds.
					setDeletedMessages((prev) => {
						const contactDeletions = new Set(prev[recipient] || []);
						contactDeletions.add(messageId);
						const next = { ...prev, [recipient]: contactDeletions };
						saveDeletedMessages(userPub, next);
						return next;
					});

					// ponytail: also nullify the actual message node via cert-gated write
					// so a non-member/leaker (who only knows the room UUID) can't keep it.
					try {
						// Across every epoch: the message may predate a rotation, and
						// each epoch is a separate room node. Nullifying only the
						// current one would leave the original copy alive.
						const secrets = groupService
							.getAllLocalSecrets(recipient)
							.map((k) => k.secret);
						const gunKey = messages[recipient]?.find(
							(m) => m.id === messageId,
						)?.gunKey;
						if (gunKey && communicationService) {
							for (const secret of secrets) {
								await communicationService.certifiedRoomWrite(
									recipient,
									secret,
									"messages",
									null,
									gunKey,
								);
							}
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
								const path = `${groupPath(p2pGroup.id)}/messages`;
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

					// 2. Notify the peer (Delete for everyone) — cert-gated when we
					// still hold one, same delivery as regular P2P chat messages, so
					// a blocked/revoked peer's forged delete can't reach us; falls
					// back to the open inbox only pre-accept, same as everything else.
					if (communicationService) {
						const pub =
							recipient.length < 30
								? await communicationService.getPubKeyFromUsername(recipient)
								: recipient;
						await communicationService.sendMessage(
							pub,
							`DELETE:${messageId}`,
							"text",
						);
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
			const isGroup = isGroupId(contactId);
			let roomId = contactId;
			if (!isGroup && groupService) {
				const calculatedId = await groupService.getP2PGroupId(contactId);
				if (calculatedId) roomId = calculatedId;
			}
			const path = `${groupPath(roomId)}/messages`;

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
					// Every epoch, for the same reason as single-message deletion: a
					// rotation moved the room, and older messages are still under the
					// node their own key derives.
					for (const { secret } of groupService.getAllLocalSecrets(roomId)) {
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

				const pub =
					contactId.length < 30
						? await communicationService.getPubKeyFromUsername(contactId)
						: contactId;
				await communicationService.sendMessage(pub, "PING_HEAL", "text");

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
					(m) => m.sender !== "Me" && m.status !== "read",
				).length;
				counts[c] = prevCount + addedUnread;
			} else {
				// 3. Fallback: Full scan for first load, deletions, or status updates
				// A group message's sender is the individual member's pubkey, never
				// the group id itself, so `m.sender === c` (correct for P2P, where
				// c IS the peer's pubkey) always missed group messages entirely.
				counts[c] = currentMsgs.filter(
					(m) => m.sender !== "Me" && m.status !== "read",
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
		handlePinMessage: async (msgId: string, pin: boolean) => {
			if (!recipient || !groupService) return;
			const roomId = isGroupId(recipient)
				? recipient
				: await groupService.getP2PGroupId(recipient);
			groupService.pinMessage(roomId, msgId, pin);
		},
		handleEditMessage: async (msgId: string, newText: string) => {
			if (!recipient || !groupService || !communicationService || !userPub)
				return;
			const existing = messages[recipient]?.find((m) => m.id === msgId);
			if (!existing || existing.senderPub !== userPub) return;

			try {
				const isGroup = isGroupId(recipient);
				let newBody: string;
				if (isGroup) {
					const meta = await (db.Get as any)(`${groupPath(recipient)}/meta`);
					if (!meta) throw new Error("Group metadata not found");
					newBody = await groupService.encryptGroupMessage(meta, newText);
				} else {
					const cipher = await communicationService.encryptMessage(
						recipient,
						newText,
					);
					newBody = JSON.stringify(cipher);
				}
				const roomId = isGroup
					? recipient
					: await groupService.getP2PGroupId(recipient);
				await groupService.editMessage(roomId, msgId, userPub, newBody);
				setMessages((prev) => {
					const groupMsgs = prev[recipient] || [];
					const updatedGroupMsgs = groupMsgs.map((m) =>
						m.id === msgId
							? { ...m, text: newText, editedAt: Date.now() }
							: m,
					);
					const updated = { ...prev, [recipient]: updatedGroupMsgs };
					saveMessages(userPub, updated);
					return updated;
				});
			} catch (e) {
				console.warn(`[Groups] Failed to edit message ${msgId}:`, e);
			}
		},
		messageReactions,
		handleReactMessage: async (msgId: string, emoji: string) => {
			if (!recipient || !groupService) return;
			const roomId = isGroupId(recipient)
				? recipient
				: await groupService.getP2PGroupId(recipient);
			groupService
				.reactToMessage(roomId, msgId, emoji)
				.catch((e) =>
					console.warn(`[Groups] Failed to react to ${msgId}:`, e),
				);
		},
		handleReportMessage: (msgId: string) => {
			if (!recipient || !groupService) return;
			groupService
				.reportContent(recipient, msgId, "Reported from chat")
				.then(() => showNotification?.("Message reported", "info"))
				.catch((e) =>
					showNotification?.(
						"Failed to report message: " + (e.message || e),
						"error",
					),
				);
		},
		handleRegenerateCertificate: async () => {
			if (!communicationService) return;
			await communicationService.republishBundle();
			showNotification?.("Identity certificate regenerated", "info");
		},
	};
};

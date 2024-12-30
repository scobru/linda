import { useState, useCallback, useEffect, useRef } from "react";
import { messaging, gun, DAPP_NAME } from "#protocol";
import { toast } from "react-hot-toast";

const { messageList } = messaging;

export const useMessages = (selected) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authorizedMembers, setAuthorizedMembers] = useState({});
  const [memberCount, setMemberCount] = useState(0);
  const subscriptionRef = useRef(null);

  // Carica la lista dei membri autorizzati per la board
  const loadAuthorizedMembers = useCallback(async () => {
    if (!selected?.roomId || selected.type !== "board") return;

    try {
      const { members, count } =
        await messaging.messageService.loadAuthorizedMembers(selected.roomId);
      setAuthorizedMembers(members);
      setMemberCount(count);
    } catch (error) {
      console.error("Errore caricamento membri autorizzati:", error);
    }
  }, [selected]);

  // Verifica se un utente è autorizzato a scrivere nella board
  const isAuthorizedMember = useCallback(
    (userPub) => {
      if (selected?.type !== "board") return true;
      if (selected?.creator === userPub) return true; // Il creatore è sempre autorizzato

      const memberData = authorizedMembers[userPub];
      if (!memberData) return false;

      // Verifica sia canWrite che i permessi di scrittura
      return (
        memberData.canWrite === true || memberData.permissions?.write === true
      );
    },
    [selected, authorizedMembers]
  );

  const loadMessages = useCallback(async () => {
    if (!selected?.roomId) return;

    setLoading(true);
    try {
      // Carica i membri autorizzati se è una board
      if (selected.type === "board") {
        await loadAuthorizedMembers();
      }

      if (selected.type === "chat") {
        // Per le chat private, usa messageList.getMessages
        const privateMessages = await messageList.getMessages(selected.pub);
        setMessages(privateMessages.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        const path =
          selected.type === "channel"
            ? "channels"
            : selected.type === "board"
            ? "boards"
            : "chats";

        const messagesRef = gun
          .get(DAPP_NAME)
          .get(path)
          .get(selected.roomId)
          .get("messages");

        // Sottoscrizione ai messaggi
        const subscription = messagesRef.map().once((data, id) => {
          if (data) {
            setMessages((prev) => {
              // Evita duplicati
              const exists = prev.some((msg) => msg.id === id);
              if (!exists) {
                return [...prev, { ...data, id }].sort(
                  (a, b) => a.timestamp - b.timestamp
                );
              }
              return prev;
            });
          }
        });

        subscriptionRef.current = subscription;
      }
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      setError(error);
      toast.error("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected, loadAuthorizedMembers]);

  // Cleanup quando cambia la selezione
  useEffect(() => {
    loadMessages();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.off();
      }
      setMessages([]);
      setAuthorizedMembers({});
    };
  }, [selected?.roomId, loadMessages]);

  return {
    messages,
    loading,
    error,
    loadMessages,
    isAuthorizedMember,
    authorizedMembers,
    memberCount,
  };
};

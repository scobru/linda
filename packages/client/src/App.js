import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { DAPP_NAME, user, gun, checkConnection } from "#protocol";
import Context from "./contexts/context";
import RequireAuth from "./components/RequireAuth";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, chains } from "./config/wagmi";
import Header from "./components/Header";
import "@rainbow-me/rainbowkit/styles.css";

// Importa le pagine
import LandingPage from "./pages/LandingPage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Homepage from "./pages/Homepage";

const queryClient = new QueryClient();

function App() {
  const [pub, setPub] = React.useState(null);
  const [alias, setAlias] = React.useState(null);
  const [friends, setFriends] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [currentChat, setCurrentChat] = React.useState(null);
  const [connectionState, setConnectionState] = React.useState("connecting");
  const [chatLoading, setChatLoading] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [currentView, setCurrentView] = React.useState("chats");
  const [chatState, setChatState] = React.useState({
    selected: null,
    list: [],
  });
  const [channelState, setChannelState] = React.useState({
    selected: null,
    list: [],
  });
  const selectedRef = useRef(null);

  // Gestione della connessione al peer locale
  useEffect(() => {
    let connectionCheck;
    let isCheckingConnection = false;

    const checkPeerConnection = async () => {
      if (isCheckingConnection) return;

      try {
        isCheckingConnection = true;
        const isConnected = await checkConnection();

        setConnectionState(isConnected ? "connected" : "disconnected");

        if (!isConnected) {
          console.log(
            "Tentativo di riconnessione al peer locale...",
            gun._.opt.peers
          );
          gun.get("ping").put({ timestamp: Date.now() });
        }
      } catch (error) {
        console.error("Errore verifica connessione:", error);
        setConnectionState("disconnected");
      } finally {
        isCheckingConnection = false;
      }
    };

    // Verifica iniziale con un breve delay
    setTimeout(checkPeerConnection, 50000);

    // Eventi di connessione
    const hiHandler = (peer) => {
      if (peer && peer.url) {
        setConnectionState("connected");
      }
    };

    const byeHandler = (peer) => {
      if (peer && peer.url) {
        checkPeerConnection();
      }
    };

    gun.on("hi", hiHandler);
    gun.on("bye", byeHandler);

    // Verifica periodica meno frequente
    connectionCheck = setInterval(checkPeerConnection, 50000);

    return () => {
      clearInterval(connectionCheck);
      gun.off("hi", hiHandler);
      gun.off("bye", byeHandler);
    };
  }, []);

  // Gestione della selezione chat e messaggi
  const handleChatSelection = async (chatId) => {
    try {
      setChatLoading(true);
      setSelected(chatId);
      setMessages([]); // Reset messaggi quando cambia chat

      // Verifica se la chat esiste già
      const chatRef = gun.get(`${DAPP_NAME}/chats`).get(chatId);

      const existingChat = await new Promise((resolve) => {
        chatRef.once((chat) => {
          resolve(chat);
        });
      });

      if (existingChat) {
        setCurrentChat(existingChat);

        // Sottoscrivi ai messaggi della chat
        chatRef
          .get("messages")
          .map()
          .on((msg, id) => {
            if (!msg || !msg.timestamp) return;

            setMessages((prev) => {
              // Evita duplicati
              const exists = prev.some((m) => m.id === id);
              if (exists) return prev;

              // Aggiungi il nuovo messaggio ordinato per timestamp
              const newMessages = [...prev, { ...msg, id }];
              return newMessages.sort((a, b) => a.timestamp - b.timestamp);
            });
          });
      } else {
        // Se la chat non esiste, inizializzala
        const newChat = {
          id: chatId,
          created: Date.now(),
          participants: [pub, chatId],
          messages: [],
        };

        await new Promise((resolve, reject) => {
          chatRef.put(newChat, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
        });

        setCurrentChat(newChat);
      }
    } catch (error) {
      console.error("Errore nella selezione della chat:", error);
      setSelected(null);
      setCurrentChat(null);
      setMessages([]);
    } finally {
      setChatLoading(false);
    }
  };

  // Gestione delle amicizie e chat
  useEffect(() => {
    if (!pub) return;

    const friendRequests = gun.get(`~${pub}/friendRequests`);
    const friends = gun.get(`~${pub}/friends`);

    // Monitora le richieste di amicizia
    const requestsHandler = friendRequests.map().on((request, id) => {
      if (!request) return;
      setFriends((prev) => {
        const existing = prev.find((f) => f.id === request.id);
        if (existing) return prev;
        return [...prev, { ...request, status: "pending" }];
      });
    });

    // Monitora gli amici accettati
    const friendsHandler = friends.map().on((friend, id) => {
      if (!friend) return;
      setFriends((prev) => {
        const existing = prev.find((f) => f.id === friend.id);
        if (existing && existing.status === "accepted") return prev;
        return prev.map((f) =>
          f.id === friend.id ? { ...f, status: "accepted" } : f
        );
      });
    });

    // Monitora le chat attive e i messaggi
    const chatRef = selected
      ? gun.get(`${DAPP_NAME}/chats`).get(selected)
      : null;

    if (chatRef) {
      // Sottoscrivi ai cambiamenti della chat corrente
      const chatHandler = chatRef.on((chat) => {
        if (chat) {
          setCurrentChat(chat);
        }
      });

      // Sottoscrivi ai messaggi
      const messagesHandler = chatRef
        .get("messages")
        .map()
        .on((msg, id) => {
          if (!msg || !msg.timestamp) return;

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === id);
            if (exists) return prev;

            const newMessages = [...prev, { ...msg, id }];
            return newMessages.sort((a, b) => a.timestamp - b.timestamp);
          });
        });

      return () => {
        friendRequests.map().off();
        friends.map().off();
        chatRef.off();
        chatRef.get("messages").map().off();
        messagesHandler.off();
        chatHandler.off();
      };
    }

    return () => {
      friendRequests.map().off();
      friends.map().off();
    };
  }, [pub, selected]);

  // Funzione per gestire la selezione
  const handleSelection = useCallback((item, type = "chat") => {
    console.log("Gestione selezione:", { item, type });

    // Resetta lo stato dei messaggi
    setMessages([]);

    // Imposta il tipo di vista corretto
    setCurrentView(type === "chat" ? "chats" : "channels");

    // Aggiorna il riferimento
    selectedRef.current = item;

    // Aggiorna lo stato appropriato
    if (type === "chat") {
      setChatState((prev) => ({
        ...prev,
        selected: item,
      }));
    } else {
      setChannelState((prev) => ({
        ...prev,
        selected: item,
      }));
    }

    // Aggiorna la selezione globale
    setSelected(item);
  }, []);

  // Effetto per gestire il cambio di vista
  useEffect(() => {
    if (!currentView) return;

    console.log("Cambio vista:", currentView);

    // Resetta la selezione quando si cambia vista
    setMessages([]);
    setSelected(null);

    // Ripristina la selezione appropriata
    if (currentView === "chats" && chatState.selected) {
      setSelected(chatState.selected);
    } else if (currentView === "channels" && channelState.selected) {
      setSelected(channelState.selected);
    }
  }, [currentView, chatState.selected, channelState.selected]);

  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains} modalSize="compact">
          <Context.Provider
            value={{
              pub,
              setPub,
              alias,
              setAlias,
              friends,
              setFriends,
              selected,
              setSelected: handleSelection,
              currentChat,
              setCurrentChat,
              connectionState,
              setConnectionState,
              chatLoading,
              messages,
              setMessages,
              currentView,
              setCurrentView,
              chatState,
              setChatState,
              channelState,
              setChannelState,
            }}
          >
            <Router>
              <div>
                <Routes>
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/login" element={<SignIn />} />
                  <Route path="/register" element={<SignUp />} />
                  <Route
                    path="/homepage"
                    element={
                      <RequireAuth>
                        <Homepage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/"
                    element={<Navigate to="/landing" replace />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/landing" replace />}
                  />
                </Routes>
              </div>
            </Router>
          </Context.Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}

export default App;

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { gun, DAPP_NAME } from "linda-protocol";

const AppContext = createContext();

const initialState = {
  pub: null,
  alias: null,
  address: null,
  metamaskAddress: null,
  isAuthenticated: false,
  user: {
    is: {
      pub: null,
      alias: null,
      address: null,
      metamaskAddress: null,
    },
  },
  friends: [],
  selected: null,
  currentChat: null,
  currentChannel: null,
  currentBoard: null,
  notifications: [],
  unreadMessages: {},
  lastSeen: null,

  friendRequests: [],
  blockedUsers: [],

  activeChat: {
    id: null,
    type: null,
    name: null,
    pub: null,
    isGroup: false,
    members: [],
    creator: null,
    settings: {
      isPublic: true,
      canWrite: true,
    },
  },

  activeChannel: {
    id: null,
    type: "channel",
    name: null,
    description: "",
    creator: null,
    members: [],
    messages: [],
    settings: {
      isPublic: true,
      canWrite: true,
    },
  },

  activeBoard: {
    id: null,
    type: "board",
    name: null,
    description: "",
    creator: null,
    members: [],
    messages: [],
    settings: {
      isPublic: true,
      canWrite: true,
    },
  },

  messages: {},
  channels: {},
  boards: {},

  walletInfo: null,
  transactions: [],

  isMobileView: window.innerWidth <= 768,
  modals: {
    wallet: false,
    userInfo: false,
    transaction: false,
    addFriend: false,
  },

  pendingRequests: [],
  currentUser: null,
  isModalOpen: false,
};

export const AppProvider = ({ children }) => {
  const [appState, setAppState] = useState(initialState);
  const [currentView, setCurrentView] = useState("chats");

  const updateAppState = useCallback((newState) => {
    if (typeof newState === "function") {
      setAppState((prev) => ({
        ...prev,
        ...newState(prev),
      }));
    } else {
      setAppState((prev) => ({
        ...prev,
        ...newState,
      }));
    }
  }, []);

  // Effetto per gestire il resize della finestra
  useEffect(() => {
    const handleResize = () => {
      updateAppState({ isMobileView: window.innerWidth <= 768 });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Effetto per sincronizzare con Gun
  useEffect(() => {
    if (appState.pub) {
      gun.get(DAPP_NAME).get("userList").get("users").get(appState.pub).put({
        pub: appState.pub,
        alias: appState.alias,
        address: appState.address,
        metamaskAddress: appState.metamaskAddress,
        lastSeen: Date.now(),
      });
    }
  }, [
    appState.pub,
    appState.alias,
    appState.address,
    appState.metamaskAddress,
  ]);

  // Effetto per caricare lo stato iniziale
  useEffect(() => {
    const userPub = localStorage.getItem("userPub");
    const username = localStorage.getItem("username");
    const walletAddress = localStorage.getItem("walletAddress");

    if (userPub && username) {
      const userData = {
        pub: userPub,
        alias: username,
        address: walletAddress,
        isAuthenticated: true,
        user: {
          is: {
            pub: userPub,
            alias: username,
            address: walletAddress,
          },
        },
      };

      updateAppState(userData);

      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(userPub)
        .once((data) => {
          if (data) {
            updateAppState({
              address: data.address,
              metamaskAddress: data.metamaskAddress,
              lastSeen: data.lastSeen,
              user: {
                is: {
                  ...userData.user.is,
                  address: data.address,
                  metamaskAddress: data.metamaskAddress,
                },
              },
            });
          }
        });
    }
  }, []);

  // Funzioni helper per gestire i modali
  const openModal = (modalName) => {
    updateAppState({
      modals: {
        ...appState.modals,
        [modalName]: true,
      },
    });
  };

  const closeModal = (modalName) => {
    updateAppState({
      modals: {
        ...appState.modals,
        [modalName]: false,
      },
    });
  };

  return (
    <AppContext.Provider
      value={{
        appState,
        updateAppState,
        openModal,
        closeModal,
        currentView,
        setCurrentView,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState deve essere usato all'interno di AppProvider");
  }
  return context;
};

export default AppContext;

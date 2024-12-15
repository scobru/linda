import React, { createContext, useContext, useState, useEffect } from 'react';
import { gun, DAPP_NAME } from 'linda-protocol';

const AppStateContext = createContext();

export function AppStateProvider({ children }) {
  const [appState, setAppState] = useState({
    pub: null,
    alias: null,
    address: null,
    metamaskAddress: null,
    isAuthenticated: false,
    friends: [],
    selected: null,
    currentChat: null,
    notifications: [],
    unreadMessages: {},
    lastSeen: null
  });

  const updateAppState = (newState) => {
    console.log('Aggiornamento AppState:', newState);
    setAppState(prevState => ({
      ...prevState,
      ...newState
    }));
  };

  // Effetto per sincronizzare con Gun
  useEffect(() => {
    if (appState.pub) {
      // Aggiorna i dati utente in Gun quando cambia lo stato
      gun.get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(appState.pub)
        .put({
          pub: appState.pub,
          alias: appState.alias,
          address: appState.address,
          metamaskAddress: appState.metamaskAddress,
          lastSeen: Date.now()
        });
    }
  }, [appState.pub, appState.alias, appState.address, appState.metamaskAddress]);

  // Effetto per caricare lo stato iniziale
  useEffect(() => {
    const userPub = localStorage.getItem('userPub');
    const username = localStorage.getItem('username');
    const walletAddress = localStorage.getItem('walletAddress');
    
    if (userPub && username) {
      updateAppState({
        pub: userPub,
        alias: username,
        address: walletAddress,
        isAuthenticated: true
      });

      // Carica i dati aggiuntivi da Gun
      gun.get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .once((data) => {
          if (data) {
            updateAppState({
              address: data.address,
              metamaskAddress: data.metamaskAddress,
              lastSeen: data.lastSeen
            });
          }
        });
    }
  }, []);

  return (
    <AppStateContext.Provider value={{ appState, updateAppState }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState deve essere usato all\'interno di un AppStateProvider');
  }
  return context;
} 
import React from "react";

const Context = React.createContext();

export function ContextProvider({ children }) {
  const [selected, setSelected] = React.useState(null);
  const [alias, setAlias] = React.useState("");
  const [pub, setPub] = React.useState("");
  const [friends, setFriends] = React.useState([]);
  const [connectionState, setConnectionState] = React.useState('disconnected');
  const [currentChat, setCurrentChat] = React.useState(null);

  const value = React.useMemo(() => ({
    selected,
    setSelected,
    alias,
    setAlias,
    pub,
    setPub,
    friends,
    setFriends,
    connectionState,
    setConnectionState,
    currentChat,
    setCurrentChat
  }), [selected, alias, pub, friends, connectionState, currentChat]);

  // Aggiungi un effetto per il cleanup quando cambia il tipo di chat
  React.useEffect(() => {
    if (selected?.type !== currentChat?.type) {
      setCurrentChat(null);
    }
  }, [selected?.type]);

  return (
    <Context.Provider value={value}>
      {children}
    </Context.Provider>
  );
}

export default Context;

import React, { createContext } from "react";

const Context = createContext();

const initialState = {
  selected: null,
  alias: "",
  pub: "",
  friends: [],
  connectionState: "disconnected",
  currentChat: null,
};

export function ContextProvider({ children }) {
  const [state, setState] = React.useState(initialState);

  const setSelected = (selected) => {
    setState((prev) => ({ ...prev, selected }));
  };

  const setAlias = (alias) => {
    setState((prev) => ({ ...prev, alias }));
  };

  const setPub = (pub) => {
    setState((prev) => ({ ...prev, pub }));
  };

  const setFriends = (friends) => {
    setState((prev) => ({ ...prev, friends }));
  };

  const setConnectionState = (connectionState) => {
    setState((prev) => ({ ...prev, connectionState }));
  };

  const setCurrentChat = (currentChat) => {
    setState((prev) => ({ ...prev, currentChat }));
  };

  const value = React.useMemo(
    () => ({
      ...state,
      setSelected,
      setAlias,
      setPub,
      setFriends,
      setConnectionState,
      setCurrentChat,
    }),
    [state]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export default Context;

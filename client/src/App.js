import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { user, addPeer } from 'linda-protocol';
import Context from './contexts/context';
import { AuthProvider } from './components/AuthProvider';
import RequireAuth from './components/RequireAuth';
import { useEffect } from 'react';

// Importa le pagine
import LandingPage from './pages/LandingPage';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Homepage from './pages/Homepage';

// Componente per proteggere le rotte
const ProtectedRoute = ({ children }) => {
  if (!user.is) {
    return <Navigate to="/landing" replace />;
  }
  return children;
};

// Componente per reindirizzare gli utenti autenticati
const PublicRoute = ({ children }) => {
  if (user.is) {
    return <Navigate to="/homepage" replace />;
  }
  return children;
};

function App() {
  const [pub, setPub] = React.useState(null);
  const [alias, setAlias] = React.useState(null);
  const [friends, setFriends] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [currentChat, setCurrentChat] = React.useState(null);
  const [connectionState, setConnectionState] = React.useState('disconnected');

  useEffect(() => {
    addPeer('http://localhost:3030/gun');
    addPeer('https://gun-manhattan.herokuapp.com/gun');
  }, []);

  return (
    <Context.Provider
      value={{
        pub,
        setPub,
        alias,
        setAlias,
        friends,
        setFriends,
        selected,
        setSelected,
        currentChat,
        setCurrentChat,
        connectionState,
        setConnectionState,
      }}
    >
      <Router>
        <Routes>
          {/* Rotte pubbliche senza wrapper */}
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/login" element={<SignIn />} />
          <Route path="/register" element={<SignUp />} />

          {/* Rotta protetta */}
          <Route 
            path="/homepage" 
            element={
              <RequireAuth>
                <Homepage />
              </RequireAuth>
            } 
          />

          {/* Reindirizzamenti */}
          <Route 
            path="/" 
            element={<Navigate to="/landing" replace />} 
          />
          <Route 
            path="*" 
            element={<Navigate to="/landing" replace />} 
          />
        </Routes>
      </Router>
    </Context.Provider>
  );
}

export default App;

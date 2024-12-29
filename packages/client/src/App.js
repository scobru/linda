import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { DAPP_NAME, user, gun, checkConnection } from "#protocol";
import { AppProvider } from "./context/AppContext";
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
  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains}>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<SignIn />} />
                <Route path="/register" element={<SignUp />} />
                <Route
                  path="/homepage/*"
                  element={
                    <RequireAuth>
                      <Homepage />
                    </RequireAuth>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </Router>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}

export default App;

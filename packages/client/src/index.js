import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.js";
import reportWebVitals from "./reportWebVitals.js";
import { gun } from "./protocol/index.js";
import { AppProvider } from "./context/AppContext.js";

// Funzione per verificare la connessione di Gun
const waitForGunInitialization = () => {
  return new Promise((resolve) => {
    const checkGun = () => {
      // Verifica se Gun è connesso controllando i peers
      if (gun) {
        console.log("Gun inizializzato con successo");
        resolve();
      } else {
        console.log("In attesa dell'inizializzazione di Gun...");
        setTimeout(checkGun, 100);
      }
    };
    checkGun();
  });
};

// Inizializza l'app solo dopo che Gun è pronto
const initializeApp = async () => {
  try {
    await waitForGunInitialization();

    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <AppProvider>
        <App />
      </AppProvider>
    );
  } catch (error) {
    console.error("Errore durante l'inizializzazione:", error);
  }
};

// Avvia l'inizializzazione
initializeApp();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

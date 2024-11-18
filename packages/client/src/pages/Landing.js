import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { user } from '../protocol/src/useGun.js';

export default function Landing() {
  const navigate = useNavigate();

  // Verifica lo stato di autenticazione
  useEffect(() => {
    // Se l'utente è già autenticato, reindirizza alla homepage
    if (user.is) {
      navigate('/', { replace: true });
      return;
    }

    // Aggiungi un listener per i cambiamenti di autenticazione
    const authCheck = setInterval(() => {
      if (user.is) {
        navigate('/', { replace: true });
      }
    }, 1000);

    return () => clearInterval(authCheck);
  }, [navigate]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="w-full border-b border-gray-100 bg-white">
        <div className="w-full px-4">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-black">linda</h1>
          </div>
        </div>
      </div>

      {/* Contenuto principale */}
      <div className="flex-1 flex flex-col justify-center items-center">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Benvenuto su Linda Messenger
          </h2>
          <p className="text-gray-600">
            Messaggistica decentralizzata e sicura
          </p>
        </div>

        <div className="space-y-4 w-full max-w-sm px-4">
          <Link to="/signin">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
              Accedi
            </button>
          </Link>
          <Link to="/register">
            <button className="w-full bg-white hover:bg-gray-50 text-blue-600 font-medium py-3 px-4 rounded-lg border border-blue-600 transition-colors">
              Registrati
            </button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 text-center text-gray-500 text-sm">
        <p>© 2024 Linda Messenger. Tutti i diritti riservati.</p>
      </div>
    </div>
  );
} 
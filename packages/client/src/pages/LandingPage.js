import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { gun, user, DAPP_NAME, observeAuthState, security } from "#protocol";

const { sessionManager } = security;

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkExistingAuth = async () => {
      const isAuth = await sessionManager.validateSession();
      if (isAuth) {
        navigate("/homepage", { replace: true });
      }
    };

    checkExistingAuth();

    const unsubscribe = observeAuthState((authState) => {
      if (authState && authState.isAuthenticated) {
        navigate("/homepage", { replace: true });
      }
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
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
            Welcome to Linda Messenger
          </h2>
          <p className="text-gray-600">Secure and decentralized messaging</p>
        </div>

        <div className="space-y-4 w-full max-w-sm px-4">
          <Link to="/login">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
              Sign In
            </button>
          </Link>
          <Link to="/register">
            <button className="w-full bg-white hover:bg-gray-50 text-blue-600 font-medium py-3 px-4 rounded-lg border border-blue-600 transition-colors">
              Sign Up
            </button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 text-center text-gray-500 text-sm">
        <p>© 2024 Linda Messenger. All rights reserved.</p>
      </div>
    </div>
  );
}

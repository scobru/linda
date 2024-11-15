import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { user } from "../useGun";
import { authentication } from "../services/lib/protocol";

// spinner
import Loader from "../components/Loader";

// route elements (pages)
const LandingPage = lazy(() => import("../pages/LandingPage"));
const SignIn = lazy(() => import("../pages/SignIn"));
const SignUp = lazy(() => import("../pages/SignUp"));
const Homepage = lazy(() => import("../pages/Homepage"));

// Componente per proteggere le route
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  useEffect(() => {
    let mounted = true;
    
    const subscription = authentication.isAuthenticated.subscribe((isAuth) => {
      if (!mounted) return;
      setIsAuthenticated(isAuth);
      setIsLoading(false);
    });

    // Verifica iniziale
    authentication.checkAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return <Loader />;
  }

  return isAuthenticated ? children : <Navigate to="/" replace />;
};

// Componente per le route pubbliche
const PublicRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  useEffect(() => {
    let mounted = true;
    
    const subscription = authentication.isAuthenticated.subscribe((isAuth) => {
      if (!mounted) return;
      setIsAuthenticated(isAuth);
      setIsLoading(false);
    });

    // Verifica iniziale
    authentication.checkAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return <Loader />;
  }

  return isAuthenticated ? <Navigate to="/homepage" replace /> : children;
};

export default function Router() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* Route pubbliche */}
          <Route 
            path="/" 
            element={
              <PublicRoute>
                <LandingPage />
              </PublicRoute>
            } 
          />
          <Route 
            path="/landing" 
            element={
              <PublicRoute>
                <LandingPage />
              </PublicRoute>
            } 
          />
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <SignIn />
              </PublicRoute>
            } 
          />
          <Route 
            path="/register" 
            element={
              <PublicRoute>
                <SignUp />
              </PublicRoute>
            } 
          />

          {/* Route protette */}
          <Route
            path="/homepage"
            element={
              <ProtectedRoute>
                <Homepage />
              </ProtectedRoute>
            }
          />

          {/* Fallback per route non trovate */}
          <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

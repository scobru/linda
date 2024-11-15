import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authentication } from 'linda-protocol';

const RequireAuth = ({ children }) => {
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const validateSession = async () => {
      const valid = await authentication.sessionManager.validateSession();
      setIsValid(valid);
      setIsValidating(false);
    };

    validateSession();
  }, []);

  if (isValidating) {
    return <div>Verifica sessione in corso...</div>;
  }

  if (!isValid) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth; 
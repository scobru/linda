import React from 'react';
import { authentication } from '../protocol';
import toast, { Toaster } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    // Verifica se l'utente è già autenticato
    const checkAuth = async () => {
      const isAuth = await authentication.sessionManager.validateSession();
      if (isAuth) {
        navigate('/', { replace: true });
      }
    };
    
    checkAuth();
  }, [navigate]);

  const handleRegister = async () => {
    if (isLoading) return;
    if (!username.trim() || !password.trim()) {
      toast.error('Inserisci username e password');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Registrazione in corso...');

    try {
      await new Promise((resolve, reject) => {
        authentication.registerUser({ username, password }, (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.errMessage || 'Errore durante la registrazione'));
          }
        });
      });

      toast.success('Registrazione completata', { id: toastId });
      
      // Reindirizza al login dopo un breve delay
      setTimeout(() => {
        navigate('/signin', { replace: true });
      }, 1500);
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Errore durante la registrazione', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      handleRegister();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-8">Registrati</h2>
          <div className="space-y-4">
            <input
              className="w-full h-14 rounded-full text-center border border-gray-300"
              type="text"
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              value={username}
              placeholder="Username"
              disabled={isLoading}
            />
            <input
              className="w-full h-14 rounded-full text-center border border-gray-300"
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              value={password}
              placeholder="Password"
              disabled={isLoading}
            />
            <button
              onClick={handleRegister}
              disabled={isLoading}
              className={`w-full h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full transition-colors ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Registrazione in corso...
                </div>
              ) : (
                'Registrati'
              )}
            </button>
            
            <Link to="/signin">
              <button className="w-full h-14 bg-white hover:bg-gray-100 text-blue-500 font-bold rounded-full border-2 border-blue-500 transition-colors">
                Hai già un account? Accedi
              </button>
            </Link>
            
            <Link to="/landing">
              <button className="w-full h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-full transition-colors">
                Torna indietro
              </button>
            </Link>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
} 
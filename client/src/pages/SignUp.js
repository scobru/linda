import React from 'react';
import { authentication } from 'linda-protocol';
import toast, { Toaster } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';

export default function SignUp() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (isLoading) return;
    if (!username.trim() || !password.trim()) {
      toast.error('Inserisci username e password');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Registrazione in corso...');

    try {
      const result = await new Promise((resolve, reject) => {
        authentication.registerUser({ username, password }, (response) => {
          console.log('Register response:', response); // Debug log
          if (response.errMessage) reject(new Error(response.errMessage));
          else resolve(response);
        });
      });

      toast.success('Registrazione completata', { id: toastId });
      
      // Attendi un momento prima di reindirizzare
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1000);
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
    <>
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="text-center -mt-24">
          <p className="text-4xl mb-8">Registrati</p>
          <div className="flex flex-col place-items-center mt-3">
            <input
              className="w-80 h-14 mt-3 rounded-full text-center"
              type="text"
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              value={username}
              placeholder="enter username"
              disabled={isLoading}
            />
            <input
              className="w-80 h-14 mt-3 rounded-full text-center"
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              value={password}
              placeholder="enter password"
              disabled={isLoading}
            />
            <button
              onClick={handleRegister}
              disabled={isLoading}
              className={`w-80 h-14 mt-3 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Registrazione in corso...
                </div>
              ) : (
                'Sign me up!'
              )}
            </button>
          </div>
          <p className="mt-8">
            i have an account
            <Link to="/login">
              <span className="text-blue-500 hover:text-blue-800"> login</span>
            </Link>
          </p>
          <p>or</p>
          <p>
            <Link to="/">
              <span className="text-blue-500 hover:text-blue-800">go home</span>
            </Link>
          </p>
        </div>
      </div>
      <Toaster />
    </>
  );
}

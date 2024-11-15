import React from 'react';
import {friends} from 'linda-protocol';
import toast from 'react-hot-toast';

export default function AddFriend({ onClose }) {
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (!input.trim()) {
      toast.error('Inserisci una chiave pubblica o un alias');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Invio richiesta...');

    try {
      await new Promise((resolve, reject) => {
        friends.addFriendRequest(input.trim(), (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.errMessage));
          }
        });
      });

      toast.success('Richiesta inviata con successo', { id: toastId });
      setInput('');
      onClose();
    } catch (error) {
      console.error('Errore invio richiesta:', error);
      toast.error(error.message || "Errore nell'invio della richiesta", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Inserisci chiave pubblica o alias
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && input.trim() && handleSubmit()}
          placeholder="Chiave pubblica o alias..."
          disabled={isLoading}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isLoading ? 'bg-gray-100 cursor-not-allowed' : ''
          }`}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={isLoading}
          className={`px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Annulla
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className={`relative px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors ${
            (isLoading || !input.trim()) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Invio...
            </div>
          ) : (
            'Invia richiesta'
          )}
        </button>
      </div>
    </div>
  );
}

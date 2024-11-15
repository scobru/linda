import React from 'react';
import { gun, user } from 'linda-protocol';
import { messaging } from 'linda-protocol';
const { groups } = messaging;
import { toast } from 'react-hot-toast';

export default function Groups({ onSelect }) {
  const [myGroups, setMyGroups] = React.useState([]);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showSearchModal, setShowSearchModal] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState([]);
  const [isChannel, setIsChannel] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [adminStatus, setAdminStatus] = React.useState({});

  // Carica i gruppi dell'utente
  React.useEffect(() => {
    if (!user.is) return;
    let mounted = true;

    console.log('Starting groups subscription');

    // Sottoscrivi ai gruppi dell'utente
    const subscription = gun.user()
      .get('my_groups')
      .map()
      .on((data) => {
        if (!mounted || !data || !data.groupId) return;
        console.log('Received group data:', data);

        // Carica i dettagli del gruppo
        gun.get('groups')
          .get(data.groupId)
          .once((groupData) => {
            if (!mounted || !groupData) return;
            console.log('Loaded group details:', groupData);

            setMyGroups(prev => {
              const withoutDuplicate = prev.filter(g => g.id !== data.groupId);
              return [...withoutDuplicate, {
                ...groupData,
                id: data.groupId,
                joined: data.joined
              }].sort((a, b) => b.joined - a.joined);
            });

            // Verifica lo stato di admin
            groups.isAdmin(data.groupId, user.is.pub)
              .then(isAdmin => {
                if (mounted) {
                  setAdminStatus(prev => ({
                    ...prev,
                    [data.groupId]: isAdmin
                  }));
                }
              });
          });
      });

    return () => {
      console.log('Cleaning up groups subscription');
      mounted = false;
      if (typeof subscription === 'function') {
        subscription();
      }
    };
  }, []);

  // Crea nuovo gruppo/canale
  const handleCreate = async () => {
    try {
      const groupName = newGroupName.trim(); // Usa il nome inserito dall'utente
      const groupType = isChannel ? 'channel' : 'group'; // Determina il tipo in base al checkbox

      if (!groupName) {
        toast.error('Il nome del gruppo non può essere vuoto');
        return;
      }

      const groupId = await groups.createGroup(groupName, groupType);
      console.log('Group created with ID:', groupId);
      setShowCreateModal(false);
      setNewGroupName(''); // Resetta il nome del gruppo
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Errore nella creazione del gruppo');
    }
  };

  // Cerca gruppi e canali
  const searchGroups = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const results = await groups.searchGroups(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching groups:', error);
      toast.error('Errore nella ricerca');
    } finally {
      setLoading(false);
    }
  };

  // Iscriviti a un gruppo
  const joinGroup = async (groupId) => {
    try {
      await groups.joinGroup(groupId);
      toast.success('Iscrizione effettuata con successo');
      setShowSearchModal(false);
    } catch (error) {
      console.error('Error joining group:', error);
      toast.error(error.message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header con bottoni */}
      <div className="p-4 border-b space-y-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Crea Gruppo/Canale
        </button>
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cerca Gruppi e Canali
        </button>
      </div>

      {/* Lista gruppi */}
      <div className="flex-1 overflow-y-auto">
        {myGroups.map((group) => (
          <div
            key={group.id}
            onClick={() => {
              console.log('Selecting group:', group);
              onSelect({
                ...group,
                id: group.id,
                roomId: group.id,
                type: group.type,
                name: group.name,
                members: group.members,
                isGroup: true,
                isAdmin: adminStatus[group.id],
                pub: group.id
              });
            }}
            className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b"
          >
            <div className="flex-shrink-0 mr-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                {group.type === 'channel' ? '📢' : '👥'}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium truncate">{group.name}</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {group.type === 'channel' ? 'Canale' : 'Gruppo'}
                  </span>
                  {adminStatus[group.id] && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {group.membersCount || 0} membri
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal per creare nuovo gruppo/canale */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">
              Crea nuovo {isChannel ? 'canale' : 'gruppo'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Inserisci un nome..."
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isChannel}
                  onChange={(e) => setIsChannel(e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm text-gray-700">
                  Crea come canale
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Annulla
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !newGroupName.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Creazione...' : 'Crea'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal per cercare gruppi */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">Cerca Gruppi e Canali</h3>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchGroups()}
                  className="flex-1 px-3 py-2 border rounded-md"
                  placeholder="Cerca gruppi e canali..."
                />
                <button
                  onClick={searchGroups}
                  disabled={loading || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  Cerca
                </button>
              </div>

              {/* Risultati della ricerca */}
              <div className="max-h-60 overflow-y-auto">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 border-b"
                  >
                    <div>
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-500">
                        {item.members?.length || 0} membri • {item.type === 'channel' ? 'Canale' : 'Gruppo'}
                      </p>
                    </div>
                    <button
                      onClick={() => joinGroup(item.id)}
                      className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                    >
                      Iscriviti
                    </button>
                  </div>
                ))}
                {searchResults.length === 0 && searchQuery && !loading && (
                  <p className="text-center text-gray-500 py-4">
                    Nessun risultato trovato
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowSearchModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
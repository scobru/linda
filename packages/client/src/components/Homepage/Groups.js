import React from 'react';
import { gun, user, DAPP_NAME } from '../../protocol';
import { messaging } from '../../protocol';
import { toast } from 'react-hot-toast';

export default function Groups({ onSelect }) {
  const { groups } = messaging;

  const [myGroups, setMyGroups] = React.useState([]);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showSearchModal, setShowSearchModal] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState([]);
  const [isChannel, setIsChannel] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [adminStatus, setAdminStatus] = React.useState({});
  const [showAdminModal, setShowAdminModal] = React.useState(false);
  const [selectedGroup, setSelectedGroup] = React.useState(null);
  const [groupMembers, setGroupMembers] = React.useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = React.useState(false);

  // Funzione per generare una chiave veramente unica
  const generateUniqueKey = (group) => {
    return `group_${group.id}_${group.type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  };

  // Modifica l'effetto che carica i gruppi e le richieste
  React.useEffect(() => {
    if (!user.is) return;
    let mounted = true;

    const loadGroupsAndRequests = async () => {
      try {
        const groupsList = new Map();
        const requestsList = new Map();

        // 1. Carica i gruppi di cui l'utente è membro o admin
        await new Promise((resolve) => {
          gun.user()
            .get(DAPP_NAME)
            .get('my_groups')
            .map()
            .once(async (data) => {
              if (!data || !data.groupId) return;

              const groupDetails = await new Promise((resolve) => {
                gun.get(DAPP_NAME)
                  .get('groups')
                  .get(data.groupId)
                  .once((group) => {
                    if (group) {
                      resolve({
                        ...group,
                        id: data.groupId,
                        joined: data.joined || group.created || Date.now()
                      });
                    } else {
                      resolve(null);
                    }
                  });
              });

              if (groupDetails) {
                const isAdmin = await groups.isAdmin(data.groupId, user.is.pub);
                groupsList.set(data.groupId, {
                  ...groupDetails,
                  isAdmin,
                  uniqueKey: generateUniqueKey(groupDetails)
                });
              }
            });
          setTimeout(resolve, 1000);
        });

        // 2. Carica le richieste di iscrizione inviate dall'utente
        await new Promise((resolve) => {
          gun.user()
            .get(DAPP_NAME)
            .get('group_requests')
            .map()
            .once((request) => {
              if (request && request.status === 'pending') {
                requestsList.set(`sent_${request.groupId}`, {
                  ...request,
                  type: 'sent'
                });
              }
            });
          setTimeout(resolve, 1000);
        });

        // 3. Carica le richieste di iscrizione ricevute (solo per admin)
        for (const [groupId, group] of groupsList.entries()) {
          if (group.isAdmin) {
            const requests = await groups.getJoinRequests(groupId);
            requests.forEach(request => {
              requestsList.set(`received_${groupId}_${request.user}`, {
                ...request,
                groupId,
                groupName: group.name,
                type: 'received'
              });
            });
          }
        }

        if (mounted) {
          const groupsArray = Array.from(groupsList.values());
          const requestsArray = Array.from(requestsList.values());
          
          console.log('Gruppi caricati:', groupsArray);
          console.log('Richieste caricate:', requestsArray);
          
          setMyGroups(groupsArray.sort((a, b) => b.joined - a.joined));
        }
      } catch (error) {
        console.error('Error loading groups and requests:', error);
        if (mounted) {
          toast.error('Errore nel caricamento dei gruppi');
        }
      }
    };

    loadGroupsAndRequests();

    // Monitora i cambiamenti nei gruppi
    const groupsSubscription = gun.user()
      .get(DAPP_NAME)
      .get('my_groups')
      .map()
      .on(async (data) => {
        if (!mounted || !data || !data.groupId) return;

        const groupDetails = await new Promise((resolve) => {
          gun.get(DAPP_NAME)
            .get('groups')
            .get(data.groupId)
            .once((group) => {
              if (group) {
                resolve({
                  ...group,
                  id: data.groupId,
                  joined: data.joined || group.created || Date.now()
                });
              } else {
                resolve(null);
              }
            });
        });

        if (groupDetails) {
          const isAdmin = await groups.isAdmin(data.groupId, user.is.pub);
          setMyGroups(prev => {
            const withoutCurrent = prev.filter(g => g.id !== data.groupId);
            return [...withoutCurrent, {
              ...groupDetails,
              isAdmin,
              uniqueKey: generateUniqueKey(groupDetails)
            }].sort((a, b) => b.joined - a.joined);
          });
        }
      });

    return () => {
      mounted = false;
      if (typeof groupsSubscription === 'function') {
        groupsSubscription();
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

  // Modifica la funzione di iscrizione al gruppo
  const joinGroup = async (groupId) => {
    try {
      await groups.joinGroup(groupId);
      toast.success('Iscritto al gruppo con successo');
      setShowSearchModal(false);
    } catch (error) {
      console.error('Error joining group:', error);
      toast.error(error.message);
    }
  };

  // Funzione per gestire i membri del gruppo
  const handleManageGroup = async (group) => {
    setSelectedGroup(group);
    setIsLoadingMembers(true);
    try {
      // Carica la lista dei membri
      const members = await groups.getGroupMembers(group.id);
      setGroupMembers(members);
      setShowAdminModal(true);
    } catch (error) {
      console.error('Error loading group members:', error);
      toast.error('Errore nel caricamento dei membri');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Funzione per aggiungere un admin
  const handleAddAdmin = async (groupId, memberPub) => {
    try {
      await groups.addAdmin(groupId, memberPub);
      toast.success('Admin aggiunto con successo');
      // Ricarica i membri per aggiornare lo stato
      const updatedMembers = await groups.getGroupMembers(groupId);
      setGroupMembers(updatedMembers);
    } catch (error) {
      console.error('Error adding admin:', error);
      toast.error(error.message);
    }
  };

  // Funzione per rimuovere un admin
  const handleRemoveAdmin = async (groupId, memberPub) => {
    try {
      await groups.removeAdmin(groupId, memberPub);
      toast.success('Admin rimosso con successo');
      // Ricarica i membri per aggiornare lo stato
      const updatedMembers = await groups.getGroupMembers(groupId);
      setGroupMembers(updatedMembers);
    } catch (error) {
      console.error('Error removing admin:', error);
      toast.error(error.message);
    }
  };

  // Funzione per espellere un membro
  const handleKickMember = async (groupId, memberPub) => {
    if (window.confirm('Sei sicuro di voler espellere questo membro?')) {
      try {
        await groups.kickMember(groupId, memberPub);
        toast.success('Membro espulso con successo');
        // Ricarica i membri per aggiornare lo stato
        const updatedMembers = await groups.getGroupMembers(groupId);
        setGroupMembers(updatedMembers);
      } catch (error) {
        console.error('Error kicking member:', error);
        toast.error(error.message);
      }
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
            key={group.uniqueKey}
            className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b"
          >
            <div 
              className="flex-1 flex items-center"
              onClick={() => onSelect({
                ...group,
                roomId: group.id,
                type: group.type,
                name: group.name,
                members: group.members,
                isGroup: true,
                isAdmin: group.isAdmin,
                pub: group.id
              })}
            >
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                {group.type === 'channel' ? '📢' : '👥'}
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium truncate">{group.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">
                      {group.type === 'channel' ? 'Canale' : 'Gruppo'}
                    </span>
                    {group.isAdmin && (
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
            
            {/* Pulsante gestione gruppo per admin */}
            {group.isAdmin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleManageGroup(group);
                }}
                className="ml-2 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title="Gestisci gruppo"
              >
                <svg 
                  className="w-5 h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            )}
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

      {/* Modal per gestione gruppo - solo per admin */}
      {showAdminModal && selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                Gestione {selectedGroup.type === 'channel' ? 'Canale' : 'Gruppo'}: {selectedGroup.name}
              </h3>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {isLoadingMembers ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg">
                  <div className="px-4 py-2 bg-gray-50 border-b">
                    <h4 className="font-medium">Membri ({groupMembers.length})</h4>
                  </div>
                  <div className="divide-y">
                    {groupMembers.map((member) => (
                      <div key={member.pub} className="p-4 flex items-center justify-between">
                        <div className="flex items-center">
                          <img
                            className="h-8 w-8 rounded-full mr-2"
                            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${member.username || member.pub}&backgroundColor=b6e3f4`}
                            alt=""
                          />
                          <div>
                            <span className="font-medium">{member.username || member.pub}</span>
                            {member.isAdmin && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                Admin
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Solo gli admin possono espellere membri non admin */}
                        {selectedGroup.isAdmin && !member.isAdmin && member.pub !== user.is.pub && (
                          <button
                            onClick={() => handleKickMember(selectedGroup.id, member.pub)}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Espelli
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 
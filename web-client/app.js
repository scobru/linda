// Configurazione
const RELAY_URL = 'https://gun-relay.scobrudot.dev';

// Stato dell'applicazione
let currentUser = null;

// Utility Functions
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function setLoading(element, isLoading) {
    if (isLoading) {
        element.classList.add('loading');
        element.disabled = true;
    } else {
        element.classList.remove('loading');
        element.disabled = false;
    }
}

function hideAllSections() {
    ['loginForm', 'registerForm', 'timeline', 'profile'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

function showSection(id) {
    hideAllSections();
    document.getElementById(id).classList.remove('hidden');
}

// Auth Functions
function showLoginForm() {
    showSection('loginForm');
}

function showRegisterForm() {
    showSection('registerForm');
}

async function register(event) {
    event.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const submitButton = event.target.querySelector('button');
    
    try {
        setLoading(submitButton, true);
        
        const response = await fetch(`${RELAY_URL}/api/admin/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ account: username })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Errore durante la registrazione');
        
        showNotification(`Registrazione completata! La tua API key è: ${data.apikey}`);
        document.getElementById('loginUsername').value = username;
        document.getElementById('loginApiKey').value = data.apikey;
        showLoginForm();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        setLoading(submitButton, false);
    }
}

async function login(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const apiKey = document.getElementById('loginApiKey').value;
    const submitButton = event.target.querySelector('button');
    
    try {
        setLoading(submitButton, true);
        
        // Verifica le credenziali chiamando l'endpoint del profilo
        const response = await fetch(`${RELAY_URL}/users/${username}`, {
            headers: {
                'Accept': 'application/activity+json'
            }
        });

        if (!response.ok) throw new Error('Credenziali non valide');

        // Salva le credenziali
        currentUser = { username, apiKey };
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        // Aggiorna UI
        document.getElementById('username').textContent = username;
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('authButtons').classList.add('hidden');
        
        // Carica la timeline
        showSection('timeline');
        loadTimeline();
        loadProfile();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        setLoading(submitButton, false);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('user');
    document.getElementById('userInfo').classList.add('hidden');
    document.getElementById('authButtons').classList.remove('hidden');
    showLoginForm();
}

// Post Functions
async function createPost(event) {
    event.preventDefault();
    const content = document.getElementById('postContent').value;
    const submitButton = event.target.querySelector('button');
    
    try {
        setLoading(submitButton, true);
        
        const response = await fetch(`${RELAY_URL}/api/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                acct: currentUser.username,
                apikey: currentUser.apiKey,
                message: content
            })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Errore durante la pubblicazione');
        
        showNotification('Post pubblicato con successo!');
        document.getElementById('postContent').value = '';
        loadTimeline();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        setLoading(submitButton, false);
    }
}

async function loadTimeline() {
    if (!currentUser) return;
    
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '<div class="text-center">Caricamento posts...</div>';
    
    try {
        const response = await fetch(`${RELAY_URL}/users/${currentUser.username}/outbox`);
        const rawData = await response.json();
        
        if (!response.ok) throw new Error('Errore nel caricamento dei post');
        
        postsContainer.innerHTML = '';

        // Funzione helper per deserializzare in modo sicuro
        const safeJSONParse = (str) => {
            try {
                return typeof str === 'string' ? JSON.parse(str) : str;
            } catch (e) {
                return str;
            }
        };

        // Funzione helper per normalizzare un'attività
        const normalizeActivity = (activity) => {
            try {
                // Deserializza l'attività se necessario
                activity = safeJSONParse(activity);

                // Normalizza il contesto
                if (activity['@context']) {
                    activity['@context'] = Array.isArray(activity['@context']) 
                        ? activity['@context'] 
                        : [safeJSONParse(activity['@context'])].flat();
                }

                // Normalizza l'oggetto
                if (activity.object) {
                    activity.object = safeJSONParse(activity.object);
                }

                // Normalizza cc e to
                if (activity.cc) {
                    activity.cc = Array.isArray(activity.cc) 
                        ? activity.cc 
                        : [safeJSONParse(activity.cc)].flat();
                }
                if (activity.to) {
                    activity.to = Array.isArray(activity.to) 
                        ? activity.to 
                        : [safeJSONParse(activity.to)].flat();
                }

                return activity;
            } catch (e) {
                console.warn('Errore nella normalizzazione dell\'attività:', e);
                return null;
            }
        };

        // Normalizza e filtra le attività
        const activities = (rawData.orderedItems || [])
            .map(normalizeActivity)
            .filter(activity => activity !== null)
            .sort((a, b) => {
                const dateA = new Date(a.published || a.object?.published || 0);
                const dateB = new Date(b.published || b.object?.published || 0);
                return dateB - dateA;
            });

        if (activities.length > 0) {
            activities.forEach(activity => {
                try {
                    let post;
                    if (activity.type === 'Create' && activity.object) {
                        post = activity.object;
                    } else if (activity.type === 'Note') {
                        post = activity;
                    } else {
                        return;
                    }

                    // Verifica che il post abbia le proprietà necessarie
                    if (!post.content) return;

                    const postElement = document.createElement('div');
                    postElement.className = 'post bg-white p-6 rounded-lg shadow-md';
                    
                    // Estrai l'username dall'attributedTo o dall'actor
                    let author = '';
                    if (post.attributedTo) {
                        author = typeof post.attributedTo === 'string' 
                            ? post.attributedTo.split('/').pop()
                            : post.attributedTo.id?.split('/').pop() || 'Anonimo';
                    } else if (activity.actor) {
                        author = typeof activity.actor === 'string'
                            ? activity.actor.split('/').pop()
                            : activity.actor.id?.split('/').pop() || 'Anonimo';
                    } else {
                        author = 'Anonimo';
                    }
                    
                    // Formatta la data
                    const publishedDate = new Date(post.published || activity.published || Date.now());
                    const formattedDate = publishedDate.toLocaleString('it-IT', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    postElement.innerHTML = `
                        <div class="flex items-start mb-4">
                            <div class="flex-1">
                                <h3 class="font-bold">${author}</h3>
                                <span class="text-gray-500 text-sm">${formattedDate}</span>
                            </div>
                        </div>
                        <p class="text-gray-700 whitespace-pre-wrap">${post.content}</p>
                    `;
                    postsContainer.appendChild(postElement);
                } catch (error) {
                    console.warn('Errore nel rendering del post:', error);
                }
            });

            if (postsContainer.children.length === 0) {
                postsContainer.innerHTML = '<div class="text-center text-gray-500">Nessun post da mostrare</div>';
            }
        } else {
            postsContainer.innerHTML = '<div class="text-center text-gray-500">Nessun post da mostrare</div>';
        }
    } catch (error) {
        console.error('Errore dettagliato:', error);
        postsContainer.innerHTML = `<div class="text-center text-red-500">Errore: ${error.message}</div>`;
    }
}

async function loadProfile() {
    if (!currentUser) return;
    
    try {
        // Carica following
        const followingResponse = await fetch(`${RELAY_URL}/users/${currentUser.username}/following`);
        const followingData = await followingResponse.json();
        
        const followingList = document.getElementById('followingList');
        followingList.innerHTML = '';
        
        if (followingData.orderedItems && followingData.orderedItems.length > 0) {
            followingData.orderedItems.forEach(following => {
                const element = document.createElement('div');
                element.className = 'bg-gray-50 p-2 rounded';
                element.textContent = following.id.split('/').pop();
                followingList.appendChild(element);
            });
        } else {
            followingList.innerHTML = '<div class="text-gray-500">Non stai seguendo nessuno</div>';
        }
        
        // Carica followers
        const followersResponse = await fetch(`${RELAY_URL}/users/${currentUser.username}/followers`);
        const followersData = await followersResponse.json();
        
        const followersList = document.getElementById('followersList');
        followersList.innerHTML = '';
        
        if (followersData.orderedItems && followersData.orderedItems.length > 0) {
            followersData.orderedItems.forEach(follower => {
                const element = document.createElement('div');
                element.className = 'bg-gray-50 p-2 rounded';
                element.textContent = follower.id.split('/').pop();
                followersList.appendChild(element);
            });
        } else {
            followersList.innerHTML = '<div class="text-gray-500">Nessun follower</div>';
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
    // Controlla se c'è un utente salvato
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('username').textContent = currentUser.username;
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('authButtons').classList.add('hidden');
        showSection('timeline');
        loadTimeline();
        loadProfile();
    } else {
        showLoginForm();
    }
}); 
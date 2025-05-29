// network.js — სერვერთან კომუნიკაცია (WebSocket, API)

let ws = null;

export function initWebSocket(wsUrlOrRoomId, onMessage, onOpen, onClose, onError) {
    // Accept either a full wsUrl (with params) or just a roomId
    let wsUrl = '';
    if (wsUrlOrRoomId.startsWith('/ws') || wsUrlOrRoomId.startsWith('ws')) {
        // Full wsUrl provided
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host;
        wsUrl = wsUrlOrRoomId.startsWith('ws') ? wsUrlOrRoomId : `${protocol}://${host}${wsUrlOrRoomId}`;
    } else {
        // Just roomId provided (legacy)
        let playerCount = 6;
        try {
            const lobby = JSON.parse(localStorage.getItem('great7-lobby'));
            if (lobby && lobby.n) playerCount = parseInt(lobby.n, 10);
        } catch (e) {}
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host;
        wsUrl = `${protocol}://${host}/ws?room=${wsUrlOrRoomId}&players=${playerCount}`;
    }
    ws = new WebSocket(wsUrl);
    // Try to extract userId from wsUrl and set ws._userId
    try {
        const urlObj = new URL(wsUrl, window.location.origin);
        const userId = urlObj.searchParams.get('userId');
        if (userId) ws._userId = userId;
    } catch (e) {}
    ws.onopen = onOpen || (() => {});
    ws.onclose = onClose || (() => {});
    ws.onerror = onError || (() => {});
    ws.onmessage = onMessage || (() => {});
    return ws;
}

export function sendWSMessage(msg) {
    if (ws && ws.readyState === window.WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

export function closeWebSocket() {
    if (ws) ws.close();
}

export function fetchRoomData(roomId, token) {
    return fetch(`/api/rooms/${roomId}`, {
        headers: {
            'Authorization': 'Bearer ' + (token || '')
        }
    }).then(r => r.ok ? r.json() : null);
}

export function fetchLobbyData(token) {
    return fetch('/api/lobby', {
        headers: {
            'Authorization': 'Bearer ' + (token || '')
        }
    }).then(r => r.ok ? r.json() : null);
}

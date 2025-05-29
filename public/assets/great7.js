// --- Great7 main logic moved from great7.html ---
// (Paste all code from the <script>...</script> section of great7.html here) 

// great7.js — მთავარი entrypoint
import * as board from './board.js';
import * as gameLogic from './gameLogic.js';
import * as network from './network.js';
import * as ui from './ui.js';

let selectedStoneId = null;
let allowedTargets = [];
let jumpTargets = [];
let myColor = null;
let colorPlayers = {};
let playerCount = 6;
let hiddenColors = [];
let ws = null;
let DIAGONALS = null;
let pendingColor = null;
let currentTurnColor = null;
let finishTurnBtn = null;
let visitedJumpPositions = new Set();
let colorNames = {};

let svg = null;
let timerDiv = null;
let timerInterval = null;

window.addEventListener('DOMContentLoaded', () => {
    // SVG ელემენტის რეგისტრაცია
    svg = document.getElementById('board');
    board.setSVGElement(svg);
    board.drawStaticColorGroups(svg);
    ui.initLobbyButton();

    // ფერის ინიციალიზაცია
    try {
        const lobby = JSON.parse(localStorage.getItem('great7-lobby'));
        if (lobby && lobby.color) myColor = lobby.color;
        if (lobby && lobby.n) playerCount = parseInt(lobby.n, 10);
    } catch (e) {}

    // ქვების მდგომარეობა და დაფა მოთამაშეების რაოდენობის მიხედვით მხოლოდ თუ არის roomId
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (!roomId) {
        board.resetStonesState(playerCount);
        hiddenColors = (board.filterActiveStonesByPlayerCount(playerCount).length < board.stones.length)
            ? board.filterActiveStonesByPlayerCount(playerCount).map(s => s.color)
            : [];
    }

    // ფერის overlay
    // ui.ensureColorSelected(myColor); // წაშალე ეს ხაზი
    function checkColorOverlay() {
        if (!myColor && !pendingColor) {
            ui.ensureColorSelected(null);
        } else {
    ui.ensureColorSelected(myColor);
        }
    }

    // ჩატვირთე DIAGONALS გარე JSON-დან
    fetch('assets/diagonals115.json')
      .then(r => r.json())
      .then(data => { 
        DIAGONALS = data; 
        render(); 
      });

    // დაფის რენდერი
    function render() {
        board.renderBoard({
            stonesState: board.stonesState,
            holeState: board.holeState,
            selectedStoneId,
            allowedTargets,
            jumpTargets,
            myColor,
            currentTurnColor,
            hiddenColors,
            HOLE_RADIUS: board.HOLE_RADIUS,
            STONE_COLORS: board.STONE_COLORS,
            BOARD_CENTER: board.BOARD_CENTER,
            holeCoords: board.holeCoords,
            playerCount,
            dragging: false,
            dragStoneId: null,
            dragCurrentPos: null
        });
    }

    render();

    // WebSocket ინიციალიზაცია (თუ ოთახის id არსებობს)
    if (roomId) {
        // --- Use stored userId if available ---
        let storedUserId = getStoredUserId();
        let wsUrl = `/ws?room=${roomId}`;
        if (storedUserId) wsUrl += `&userId=${encodeURIComponent(storedUserId)}`;
        ws = network.initWebSocket(
            wsUrl,
            (msg) => {
                let data;
                try { data = JSON.parse(msg.data); } catch (e) { return; }
                if (data.type === 'color-update') {
                    console.log('[NAME SYNC] Received color-update:', data);
                    colorPlayers = data.players || {};
                    if (data.names && Object.keys(data.names).length > 0) {
                        colorNames = data.names;
                    } else if (!data.names) {
                        console.warn('[NAME SYNC] No names in color-update!');
                    }
                    console.log('[NAME SYNC] Updated colorNames:', colorNames);
                    updateMyColorFromPlayers();
                    renderPlayerList(currentTurnColor, window.lastTimers);
                }
                if (data.type === 'color-error') {
                    // ფერი დაკავებულია, სცადე სხვა თავისუფალი ფერი
                    pendingColor = null;
                    tryAutoAssignColor();
                }
                if (data.type === 'whose-turn') {
                    currentTurnColor = data.color;
                    updateMyColorFromPlayers();
                    // გამოაჩინე ვისი სვლაა UI-ში
                    const turnDiv = document.getElementById('turn-indicator') || (() => {
                        const d = document.createElement('div');
                        d.id = 'turn-indicator';
                        d.style.position = 'absolute';
                        d.style.top = '20px';
                        d.style.left = '10px';
                        d.style.background = 'none';
                        d.style.padding = '0';
                        d.style.borderRadius = '0';
                        d.style.boxShadow = 'none';
                        d.style.fontSize = '0.75em';
                        d.style.color = '#fff';
                        d.style.zIndex = '1001';
                        document.body.appendChild(d);
                        return d;
                    })();
                    let colorName = Object.entries(board.STONE_COLORS).find(([name, hex]) => hex === currentTurnColor)?.[0] || '';
                    const colorGeo = {
                        red: 'წითელი', green: 'მწვანე', blue: 'ცისფერი', navy: 'ბადრიჯნისფერი', orange: 'ფორთოხლისფერი', yellow: 'ყვითელი'
                    };
                    turnDiv.textContent = `თამაშობს "${colorGeo[colorName]||colorName}"`;
                    renderPlayerList(currentTurnColor, window.lastTimers);
                }
                // --- სინქრონიზაცია: მიიღე სვლა სხვა მოთამაშისგან ან საწყისი მდგომარეობა ---
                if ((data.type === 'move' || data.type === 'sync') && data.state) {
                    // ქვების მდგომარეობა მთლიანად ჩაანაცვლე სერვერიდან მოსულით
                    board.setStonesState(data.state.stonesState);
                    Object.keys(board.holeState).forEach(k => { delete board.holeState[k]; });
                    Object.assign(board.holeState, data.state.holeState);
                    const presentColors = [...new Set(board.stonesState.map(s => s.color))];
                    console.log('SYNC FROM SERVER:', {
                        stonesCount: board.stonesState.length,
                        colors: presentColors
                    });
                    const allColors = Object.values(board.STONE_COLORS);
                    playerCount = presentColors.length;
                    hiddenColors = allColors.filter(c => !presentColors.includes(c));
                    selectedStoneId = null;
                    allowedTargets = [];
                    jumpTargets = [];
                    window.MOVE_DONE = false;
                    updateMyColorFromPlayers();
                    render();
                    renderPlayerList(currentTurnColor, window.lastTimers);
                    // If after sync, my userId is not in colorPlayers, send join again
                    if (ws && ws._userId && (!colorPlayers[ws._userId] || !colorNames[ws._userId])) {
                        network.sendWSMessage({ type: 'join', name: getCurrentUserName() });
                    }
                }
                if (data.type === 'user-id' && data.userId) {
                    ws._userId = data.userId;
                    setStoredUserId(data.userId);
                    console.log('RECEIVED USER ID:', data.userId);
                    network.sendWSMessage({ type: 'join', name: getCurrentUserName() });
                    return;
                }
                if (data.type === 'game-over' && data.winner) {
                    // Highlight the winner's target ring
                    highlightWinnerRing(data.winner.color);
                    // Show winner message
                    showWinnerMessage(data.winner.color, colorNames[data.winner.userId] || '');
                    // Prevent further moves
                    window.GAME_OVER = true;
                }
                if (data.type === 'timer-update') {
                    window.lastTimers = data.timers;
                    renderPlayerList(currentTurnColor, data.timers);
                }
                if (data.type === 'timer-forfeit') {
                    // Show message that player lost on time only if both timers are out
                    const forfeiter = colorNames[data.userId] || 'მოთამაშე';
                    // Find the timer for this user
                    if (data.userId && window.lastTimers && window.lastTimers[data.userId]) {
                        const t = window.lastTimers[data.userId];
                        if (t.mainTimeLeft <= 0) {
                            alert(forfeiter + ' დროის ამოწურვით დამარცხდა!');
                        }
                    } else {
                        alert(forfeiter + ' დროის ამოწურვით დამარცხდა!');
                    }
                }
                if (data.type === 'game-over') {
                    if (timerDiv) timerDiv.innerHTML = '';
                }
                if (data.type === 'profile-update') {
                    // Fetch latest stats from /api/me and show in a modal or alert
                    const token = localStorage.getItem('token');
                    if (token) {
                        fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } })
                            .then(r => r.ok ? r.json() : null)
                            .then(user => {
                                if (user) {
                                    // Show stats in a modal or alert
                                    alert(`სტატისტიკა განახლდა!\nმოგება: ${user.wins}\nწაგება: ${user.losses}\nთამაშები: ${user.gamesPlayed}\nLevel: ${user.level} (XP: ${user.xp})`);
                                    // If in lobby, update stats visually
                                    if (window.renderLobby) window.renderLobby(true);
                                }
                            });
                    }
                }
            }
        );
    }

    // ქვებზე click-to-move ლოგიკა
    function handleStoneSelect(e) {
        if (window.GAME_OVER) return;
        if (window.MOVE_DONE) return;
        if (Object.keys(colorPlayers).length < playerCount) return;
        if (!myColor || !currentTurnColor || board.STONE_COLORS[myColor] !== currentTurnColor) return;
        let target = e.target.closest('circle[data-stone-id]');
        if (!target && e.touches && e.touches.length === 1) {
            // Touch: find element at touch point
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el && el.hasAttribute('data-stone-id')) target = el;
        }
        if (target) {
            const stoneId = target.getAttribute('data-stone-id');
            const stone = board.stonesState.find(s => s.id === stoneId);
            if (!stone) return;
            // მხოლოდ ჩემი ფერის ქვაზე
            if (myColor && stone.color === board.STONE_COLORS[myColor]) {
                // Always clear jump history when selecting a new stone
                if (selectedStoneId !== stoneId) {
                    visitedJumpPositions.clear();
                }
                if (selectedStoneId === stoneId) {
                    selectedStoneId = null;
                    allowedTargets = [];
                    jumpTargets = [];
                    visitedJumpPositions.clear();
                } else if (!window.MOVE_DONE) {
                    selectedStoneId = stoneId;
                    allowedTargets = gameLogic.getImmediateTargetsFromDiagonals(stone, DIAGONALS, board.holeState);
                    jumpTargets = gameLogic.getJumpTargetsFromDiagonals(stone, DIAGONALS, board.holeState, visitedJumpPositions);
                }
                render();
            }
        }
    }
    svg.addEventListener('click', handleStoneSelect);
    svg.addEventListener('touchstart', handleStoneSelect);

    // --- Handle click-to-move events from board.js ---
    function handleHoleClick(e) {
        if (window.GAME_OVER) return;
        if (window.MOVE_DONE) return;
        if (!selectedStoneId) return;
        let targetNum = e.detail ? e.detail.targetNum : null;
        if (!targetNum && e.touches && e.touches.length === 1) {
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el && el.classList.contains('board-hole')) {
                targetNum = parseInt(el.getAttribute('data-hole-num'), 10);
            }
        }
        if (!targetNum) return;
        const stone = board.stonesState.find(s => s.id === selectedStoneId);
        if (!stone) return;
        // Check if move is allowed
        const allowed = gameLogic.getImmediateTargetsFromDiagonals(stone, DIAGONALS, board.holeState);
        const jumpAllowed = gameLogic.getJumpTargetsFromDiagonals(stone, DIAGONALS, board.holeState, visitedJumpPositions);
        let moveType = 'normal';
        let canJumpAgain = false;
        if (jumpAllowed.includes(targetNum)) {
            moveType = 'jump';
        } else if (!allowed.includes(targetNum)) {
            return; // Not a legal move
        }
        // --- EXTRA SAFETY: Always clear previous position ---
        if (board.holeState[stone.pos] === stone.id) {
            board.holeState[stone.pos] = null;
        }
        // Do the move
        if (moveType === 'jump') {
            visitedJumpPositions.add(stone.pos);
        } else {
            visitedJumpPositions.clear();
        }
        stone.pos = targetNum;
        board.holeState[targetNum] = stone.id;
        // Check for further jumps
        if (moveType === 'jump') {
            const moreJumps = gameLogic.getJumpTargetsFromDiagonals(stone, DIAGONALS, board.holeState, visitedJumpPositions);
            canJumpAgain = moreJumps.length > 0;
            // If no more jumps, clear visitedJumpPositions
            if (!canJumpAgain) {
                visitedJumpPositions.clear();
            }
        } else {
            visitedJumpPositions.clear();
        }
        // Send move to server
        if (ws && ws.readyState === window.WebSocket.OPEN) {
            network.sendWSMessage({
                type: 'move',
                state: {
                    stonesState: board.stonesState.map(s => ({...s})),
                    holeState: {...board.holeState}
                },
                moveType,
                canJumpAgain
            });
        }
        // After move, prevent further moves until next turn
        window.MOVE_DONE = true;
        // Show Finish Turn button ONLY if it's my turn AND I can jump again (multi-jump opportunity)
        if (
            myColor &&
            currentTurnColor &&
            board.STONE_COLORS[myColor] === currentTurnColor &&
            !window.GAME_OVER &&
            moveType === 'jump' &&
            canJumpAgain
        ) {
            finishTurnBtn.disabled = false;
            finishTurnBtn.style.opacity = '1';
            finishTurnBtn.style.cursor = 'pointer';
            finishTurnBtn.style.display = 'block';
        } else {
            finishTurnBtn.disabled = true;
            finishTurnBtn.style.opacity = '0.45';
            finishTurnBtn.style.cursor = 'not-allowed';
            finishTurnBtn.style.display = 'none';
        }
        // Deselect after move
        selectedStoneId = null;
        allowedTargets = [];
        jumpTargets = [];
        render();
    }
    svg.addEventListener('board-hole-click', handleHoleClick);
    svg.addEventListener('touchend', handleHoleClick);

    function ensureFinishTurnBtn() {
        if (!finishTurnBtn) {
            finishTurnBtn = document.createElement('button');
            finishTurnBtn.textContent = 'სვლის დასრულება';
            finishTurnBtn.style.position = 'fixed';
            finishTurnBtn.style.left = '50%';
            finishTurnBtn.style.bottom = '18px';
            finishTurnBtn.style.transform = 'translateX(-50%)';
            finishTurnBtn.style.padding = '14px 32px';
            finishTurnBtn.style.fontSize = '1.25em';
            finishTurnBtn.style.background = '#23272f';
            finishTurnBtn.style.color = '#fff';
            finishTurnBtn.style.border = 'none';
            finishTurnBtn.style.borderRadius = '12px';
            finishTurnBtn.style.boxShadow = '0 2px 8px #0002';
            finishTurnBtn.style.cursor = 'pointer';
            finishTurnBtn.style.zIndex = '1002';
            finishTurnBtn.style.display = 'none';
        }
        document.body.appendChild(finishTurnBtn);
    }
    ensureFinishTurnBtn();

    // --- Player list UI ---
    let playerListDiv = null;
    function ensurePlayerListDiv() {
        playerListDiv = document.getElementById('player-list-indicator');
        if (!playerListDiv) {
            playerListDiv = document.createElement('div');
            playerListDiv.id = 'player-list-indicator';
            playerListDiv.style.position = 'fixed';
            playerListDiv.style.top = '18px';
            playerListDiv.style.left = '18px';
            playerListDiv.style.right = 'unset';
            playerListDiv.style.bottom = 'unset';
            playerListDiv.style.transform = 'none';
            playerListDiv.style.background = 'rgba(30,30,30,0.92)';
            playerListDiv.style.padding = '10px 18px';
            playerListDiv.style.borderRadius = '12px';
            playerListDiv.style.boxShadow = '0 2px 8px #0004';
            playerListDiv.style.fontSize = '1.13em';
            playerListDiv.style.color = '#fff';
            playerListDiv.style.zIndex = '1001';
            playerListDiv.style.minWidth = '180px';
            playerListDiv.style.maxWidth = '90vw';
            playerListDiv.style.maxHeight = 'calc(100vh - 36px)';
            playerListDiv.style.overflowY = 'auto';
        }
        // პატარა ეკრანებზე დააკორექტირე padding და font-size
        function adjustPlayerListDivForMobile() {
            if (window.innerWidth <= 700) {
                playerListDiv.style.padding = '7px 10px';
                playerListDiv.style.fontSize = '0.98em';
            } else {
                playerListDiv.style.padding = '10px 18px';
                playerListDiv.style.fontSize = '1.13em';
            }
        }
        adjustPlayerListDivForMobile();
        window.addEventListener('resize', adjustPlayerListDivForMobile);
        document.body.appendChild(playerListDiv);
    }
    function getCurrentUserName() {
        // Try to get name from JWT token
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload && payload.name) return payload.name;
            }
        } catch (e) {}
        // Fallback to regName
        try {
            const lobby = JSON.parse(localStorage.getItem('great7-lobby'));
            if (lobby && lobby.regName) return lobby.regName;
        } catch (e) {}
        return '';
    }
    function renderPlayerList(currentTurnColor, timers) {
        ensurePlayerListDiv();
        // Map color hex to color name
        const colorHexToName = {};
        for (const [name, hex] of Object.entries(board.STONE_COLORS)) colorHexToName[hex] = name;
        // Use color order for the current game
        const colorOrderFull = [
            '#e74c3c', // red
            '#2ecc40', // green
            '#3498db', // blue
            '#3a3a7a', // navy
            '#ff9800', // orange
            '#f1c40f'  // yellow
        ];
        const joinedColors = Object.values(colorPlayers);
        const totalCount = joinedColors.length;
        let playerInfos = [];
        for (let i = 0; i < playerCount; ++i) {
            const colorHex = colorOrderFull[i];
            const colorName = colorHexToName[colorHex] || '';
            // Use colorNames mapping from server
            let playerName = '';
            let userId = null;
            for (const [uid, cHex] of Object.entries(colorPlayers)) {
                if (cHex === colorHex) {
                    playerName = colorNames[uid] || uid || 'Player';
                    userId = uid;
                    break;
                }
            }
            const isJoined = joinedColors.includes(colorHex);
            const isActive = (currentTurnColor && colorHex === currentTurnColor);
            // Timers
            let turnTime = '0:30';
            let mainTime = '1:00';
            if (timers && userId && timers[userId]) {
                const t = timers[userId];
                let turnMs = isActive ? (t.inMainTime ? 0 : (t.turnTimeLeft||0)) : 30000;
                let mainMs = t.mainTimeLeft||0;
                // If active and in main time, show 0:00 for turn time
                if (isActive && t.inMainTime) {
                    turnMs = 0;
                }
                let turnMin = Math.floor(turnMs/60000);
                let turnSec = Math.floor((turnMs%60000)/1000);
                let mainMin = Math.floor(mainMs/60000);
                let mainSec = Math.floor((mainMs%60000)/1000);
                turnTime = `${turnMin}:${turnSec.toString().padStart(2,'0')}`;
                mainTime = `${mainMin}:${mainSec.toString().padStart(2,'0')}`;
            }
            playerInfos.push({ colorHex, colorName, playerName, isJoined, isActive, turnTime, mainTime });
        }
        // Render
        let html = '';
        if (totalCount < playerCount) {
            html += `<div style="font-size:0.98em;color:#ffe066;margin-bottom:7px;">ველოდებით მოთამაშეებს</div>`;
        }
        html += playerInfos.filter(p => p.isJoined).map(p =>
            `<div style="display:flex;align-items:center;margin-bottom:2px;font-size:0.98em;font-weight:normal;">
                <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${p.colorHex};margin-right:8px;border:2px solid #fff;"></span>
                <span style="color:${p.isActive ? '#ffe066' : (p.isJoined ? '#fff' : '#888')};text-shadow:${p.isActive ? '0 0 6px #ffe06699' : 'none'};">${p.playerName}</span>
                <span style="margin-left:auto;font-size:0.93em;color:#ffe066;min-width:60px;text-align:right;">${p.turnTime}/${p.mainTime}</span>
            </div>`
        ).join('');
        playerListDiv.innerHTML = html;
        // Remove local timerInterval logic
        if (window.timerInterval) clearInterval(window.timerInterval);
        window.timerInterval = null;
    }

    // On initial load, show player list
    renderPlayerList(currentTurnColor, window.lastTimers);

    // Remove winner message and confetti if present
    const msgDiv = document.getElementById('winner-message');
    if (msgDiv) msgDiv.remove();
    const confetti = document.getElementById('confetti-canvas');
    if (confetti) confetti.remove();
    if (svg) board.clearWinnerHighlights(svg);

    // Finish Turn button click handler
    finishTurnBtn.addEventListener('click', () => {
        if (window.GAME_OVER) return;
        if (finishTurnBtn.disabled) return;
        if (ws && ws.readyState === window.WebSocket.OPEN) {
            network.sendWSMessage({ type: 'finish-turn' });
        }
        window.MOVE_DONE = false;
        finishTurnBtn.disabled = true;
        finishTurnBtn.style.opacity = '0.45';
        finishTurnBtn.style.cursor = 'not-allowed';
        finishTurnBtn.style.display = 'none';
    });

    // On new turn, reset MOVE_DONE
    function onNewTurn() {
        window.MOVE_DONE = false;
        // On new turn, hide Finish Turn button for everyone
        finishTurnBtn.disabled = true;
        finishTurnBtn.style.opacity = '0.45';
        finishTurnBtn.style.cursor = 'not-allowed';
        finishTurnBtn.style.display = 'none';
        visitedJumpPositions.clear(); // Always clear on new turn
    }

    // Listen for whose-turn
    window.initWebSocket = ((orig) => function(...args) {
        const cb = args[1];
        args[1] = function(msg) {
            let data;
            try { data = JSON.parse(msg.data); } catch (e) { return; }
            if (data.type === 'whose-turn') {
                onNewTurn();
                visitedJumpPositions.clear(); // Extra safety: clear jump history on new turn
            }
            return cb(msg);
        };
        return orig.apply(this, args);
    })(window.initWebSocket);

    // --- ლობი ღილაკის click-ზე დაუყოვნებლივ განაახლე ლობი ---
    const lobbyBtn = document.getElementById('lobby-btn');
    if (lobbyBtn) {
        lobbyBtn.onclick = function() {
            // აჩვენე გასვლის popup
            let popup = document.getElementById('exit-popup');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'exit-popup';
                popup.style.position = 'fixed';
                popup.style.top = '0';
                popup.style.left = '0';
                popup.style.width = '100vw';
                popup.style.height = '100vh';
                popup.style.background = 'rgba(0,0,0,0.32)';
                popup.style.display = 'flex';
                popup.style.alignItems = 'center';
                popup.style.justifyContent = 'center';
                popup.style.zIndex = '2000';
                popup.innerHTML = `
                  <div style="background:#fff;color:#222;padding:32px 28px 24px 28px;border-radius:16px;box-shadow:0 2px 24px #0008;min-width:260px;text-align:center;max-width:90vw;">
                    <div style="font-size:1.2em;margin-bottom:18px;">ნამდვილად გსურთ თამაშიდან გასვლა?</div>
                    <div style="display:flex;gap:18px;justify-content:center;">
                      <button id="exit-yes" style="background:#e74c3c;color:#fff;padding:8px 22px;font-size:1.1em;border:none;border-radius:7px;cursor:pointer;">დიახ</button>
                      <button id="exit-no" style="background:#bbb;color:#222;padding:8px 22px;font-size:1.1em;border:none;border-radius:7px;cursor:pointer;">არა</button>
                    </div>
                  </div>
                `;
                document.body.appendChild(popup);
                document.getElementById('exit-yes').onclick = function() {
                    // დაუყოვნებლივ განაახლე ლობი
                    if (window.renderLobby) window.renderLobby();
                    window.location.href = 'index.html';
                };
                document.getElementById('exit-no').onclick = function() {
                    popup.remove();
                };
            }
        };
    }
}); 

function tryAutoAssignColor() {
    if (playerCount === 2) {
        const takenColors = Object.values(colorPlayers);
        if (!takenColors.includes(board.STONE_COLORS.red)) {
            pendingColor = 'red';
            network.sendWSMessage({ type: 'choose-color', color: board.STONE_COLORS['red'] });
        } else {
            pendingColor = 'green';
            network.sendWSMessage({ type: 'choose-color', color: board.STONE_COLORS['green'] });
        }
        return;
    }
    const takenColors = Object.values(colorPlayers);
    const allColors = Object.keys(board.STONE_COLORS);
    const freeColor = allColors.find(c => !takenColors.includes(board.STONE_COLORS[c]));
    if (freeColor) {
        pendingColor = freeColor;
        network.sendWSMessage({ type: 'choose-color', color: board.STONE_COLORS[freeColor] });
    }
}

// --- Winner ring highlight and message ---
function highlightWinnerRing(winnerColor) {
    // Map color to target ring
    const colorToTargetRing = {
        '#e74c3c': [1,2,3,4,5,7,8], // red -> green ring
        '#2ecc40': [108,109,111,112,113,114,115], // green -> red ring
        '#3498db': [10,11,21,22,23,33,34], // blue -> orange ring
        '#3a3a7a': [82,83,93,94,95,105,106], // navy -> yellow ring
        '#ff9800': [73,74,84,85,86,96,97], // orange -> blue ring
        '#f1c40f': [19,20,30,31,32,42,43], // yellow -> navy ring
    };
    const ring = colorToTargetRing[winnerColor];
    if (!ring) return;
    const svg = document.getElementById('board');
    board.ensureWinnerGlowFilter(svg);
    board.clearWinnerHighlights(svg);
    ring.forEach(num => {
        const el = svg.querySelector(`circle.board-hole[data-hole-num="${num}"]`);
        // fallback: highlight by drawing a glowing circle over each hole
        if (el) {
            const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            glow.setAttribute('cx', el.getAttribute('cx'));
            glow.setAttribute('cy', el.getAttribute('cy'));
            glow.setAttribute('r', el.getAttribute('r'));
            glow.setAttribute('fill', 'none');
            glow.setAttribute('stroke', winnerColor);
            glow.setAttribute('stroke-width', '7');
            glow.setAttribute('filter', 'url(#glow)');
            glow.setAttribute('class', 'winner-glow');
            svg.appendChild(glow);
        }
    });
    // Add confetti overlay
    showConfetti();
}
function showWinnerMessage(winnerColor, winnerName) {
    let msgDiv = document.getElementById('winner-message');
    if (!msgDiv) {
        msgDiv = document.createElement('div');
        msgDiv.id = 'winner-message';
        msgDiv.style.position = 'absolute';
        msgDiv.style.top = '50%';
        msgDiv.style.left = '50%';
        msgDiv.style.transform = 'translate(-50%, -50%)';
        msgDiv.style.background = 'rgba(30,30,30,0.97)';
        msgDiv.style.padding = '32px 48px';
        msgDiv.style.borderRadius = '18px';
        msgDiv.style.boxShadow = '0 4px 32px #000a';
        msgDiv.style.fontSize = '2.1em';
        msgDiv.style.color = winnerColor;
        msgDiv.style.zIndex = '2000';
        msgDiv.style.textAlign = 'center';
        document.body.appendChild(msgDiv);
    }
    msgDiv.innerHTML = `<div style='font-size:2.5em;margin-bottom:0.2em;'>🎉</div><b style='color:${winnerColor};font-size:1.2em;'>${winnerName || 'მოთამაშე'}</b><br><span style='color:#fff;font-size:0.8em;'>მოიგო!</span>`;
}
// --- Confetti effect ---
function showConfetti() {
    if (document.getElementById('confetti-canvas')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '3000';
    document.body.appendChild(canvas);
    // Simple confetti animation (minimal, for effect)
    const ctx = canvas.getContext('2d');
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    const confetti = Array.from({length: 80}, () => ({
        x: Math.random()*W,
        y: Math.random()*-H,
        r: 6+Math.random()*8,
        d: 8+Math.random()*12,
        color: `hsl(${Math.random()*360},90%,60%)`,
        tilt: Math.random()*10-5,
        tiltAngle: 0,
        tiltAngleInc: (Math.random()*0.07)+0.05
    }));
    function draw() {
        ctx.clearRect(0,0,W,H);
        confetti.forEach(c => {
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, c.r, c.r/2, c.tilt, 0, 2*Math.PI);
            ctx.fillStyle = c.color;
            ctx.fill();
        });
    }
    function update() {
        confetti.forEach(c => {
            c.y += c.d/3;
            c.tilt += c.tiltAngleInc;
            c.x += Math.sin(c.tilt);
            if (c.y > H+20) {
                c.x = Math.random()*W;
                c.y = Math.random()*-40;
            }
        });
    }
    let running = true;
    function loop() {
        if (!running) return;
        draw();
        update();
        requestAnimationFrame(loop);
    }
    loop();
    setTimeout(() => {
        running = false;
        canvas.remove();
    }, 4200);
}

function getStoredUserId() {
    try {
        return localStorage.getItem('great7-userId') || null;
    } catch (e) { return null; }
}
function setStoredUserId(id) {
    try { localStorage.setItem('great7-userId', id); } catch (e) {}
}

function updateMyColorFromPlayers() {
    const myUserId = ws && ws._userId;
    if (myUserId && colorPlayers[myUserId]) {
        for (const [name, hex] of Object.entries(board.STONE_COLORS)) {
            if (hex === colorPlayers[myUserId]) {
                myColor = name;
                console.log('[COLOR SYNC] myUserId:', myUserId, 'color:', myColor, 'colorPlayers:', colorPlayers);
                return;
            }
        }
    } else {
        myColor = null;
        console.log('[COLOR SYNC] myUserId not found in colorPlayers, myColor set to null', myUserId, colorPlayers);
    }
} 
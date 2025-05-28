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

window.addEventListener('DOMContentLoaded', () => {
    // SVG ელემენტის რეგისტრაცია
    const svg = document.getElementById('board');
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
        ws = network.initWebSocket(
            roomId,
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
                    const myUserId = ws._userId || (ws && ws._userId);
                    if (myUserId && colorPlayers[myUserId]) {
                        let foundColor = null;
                        for (const [name, hex] of Object.entries(board.STONE_COLORS)) {
                            if (hex === colorPlayers[myUserId]) {
                                foundColor = name;
                                break;
                            }
                        }
                        if (foundColor) {
                            myColor = foundColor;
                        }
                    }
                    renderPlayerList(currentTurnColor);
                }
                if (data.type === 'color-error') {
                    // ფერი დაკავებულია, სცადე სხვა თავისუფალი ფერი
                    pendingColor = null;
                    tryAutoAssignColor();
                }
                if (data.type === 'whose-turn') {
                    currentTurnColor = data.color;
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
                    renderPlayerList(currentTurnColor);
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
                    render();
                    renderPlayerList(currentTurnColor);
                }
                if (data.type === 'user-id' && data.userId) {
                    ws._userId = data.userId;
                    console.log('RECEIVED USER ID:', data.userId);
                    network.sendWSMessage({ type: 'join', name: getCurrentUserName() });
                    return;
                }
            }
        );
    }

    // ქვებზე click-to-move ლოგიკა
    svg.addEventListener('click', e => {
        if (Object.keys(colorPlayers).length < playerCount) return;
        if (!myColor || !currentTurnColor || board.STONE_COLORS[myColor] !== currentTurnColor) return;
        const target = e.target.closest('circle[data-stone-id]');
        if (target) {
            const stoneId = target.getAttribute('data-stone-id');
            const stone = board.stonesState.find(s => s.id === stoneId);
            if (!stone) return;
            // მხოლოდ ჩემი ფერის ქვაზე
            if (myColor && stone.color === board.STONE_COLORS[myColor]) {
                if (selectedStoneId === stoneId) {
                    selectedStoneId = null;
                    allowedTargets = [];
                    jumpTargets = [];
                    visitedJumpPositions.clear();
                } else {
                    selectedStoneId = stoneId;
                    allowedTargets = gameLogic.getImmediateTargetsFromDiagonals(stone, DIAGONALS, board.holeState);
                    jumpTargets = gameLogic.getJumpTargetsFromDiagonals(stone, DIAGONALS, board.holeState, visitedJumpPositions);
                }
                render();
            }
        }
    });

    // --- Handle click-to-move events from board.js ---
    svg.addEventListener('board-hole-click', e => {
        if (!selectedStoneId) return;
        const targetNum = e.detail.targetNum;
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
        // Do the move
        if (moveType === 'jump') {
            visitedJumpPositions.add(stone.pos);
        } else {
            visitedJumpPositions.clear();
        }
        board.holeState[stone.pos] = null;
        stone.pos = targetNum;
        board.holeState[targetNum] = stone.id;
        // Check for further jumps
        if (moveType === 'jump') {
            const moreJumps = gameLogic.getJumpTargetsFromDiagonals(stone, DIAGONALS, board.holeState, visitedJumpPositions);
            canJumpAgain = moreJumps.length > 0;
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
        // Update Finish Turn button state (same as in drag logic)
        if (moveType === 'jump') {
            const furtherJumps = gameLogic.getJumpTargetsFromDiagonals(stone, DIAGONALS, board.holeState, visitedJumpPositions);
            if (furtherJumps && furtherJumps.length > 0) {
                finishTurnBtn.disabled = false;
                finishTurnBtn.style.opacity = '1';
                finishTurnBtn.style.cursor = 'pointer';
            } else {
                finishTurnBtn.disabled = true;
                finishTurnBtn.style.opacity = '0.45';
                finishTurnBtn.style.cursor = 'not-allowed';
            }
        } else {
            finishTurnBtn.disabled = true;
            finishTurnBtn.style.opacity = '0.45';
            finishTurnBtn.style.cursor = 'not-allowed';
        }
        finishTurnBtn.style.display = 'block';
        // Deselect after move
        selectedStoneId = null;
        allowedTargets = [];
        jumpTargets = [];
        render();
    });

    function ensureFinishTurnBtn() {
        if (!finishTurnBtn) {
            finishTurnBtn = document.createElement('button');
            finishTurnBtn.textContent = 'სვლის დასრულება';
            finishTurnBtn.style.position = 'absolute';
            finishTurnBtn.style.bottom = '30px';
            finishTurnBtn.style.right = '60px';
            finishTurnBtn.style.padding = '10px 22px';
            finishTurnBtn.style.fontSize = '1.1em';
            finishTurnBtn.style.background = '#23272f';
            finishTurnBtn.style.color = '#fff';
            finishTurnBtn.style.border = 'none';
            finishTurnBtn.style.borderRadius = '8px';
            finishTurnBtn.style.boxShadow = '0 2px 8px #0002';
            finishTurnBtn.style.cursor = 'pointer';
            finishTurnBtn.style.zIndex = '1002';
            finishTurnBtn.style.display = 'none';
            document.body.appendChild(finishTurnBtn);
        }
    }
    ensureFinishTurnBtn();

    // --- Player list UI ---
    let playerListDiv = null;
    function ensurePlayerListDiv() {
        playerListDiv = document.getElementById('player-list-indicator');
        if (!playerListDiv) {
            playerListDiv = document.createElement('div');
            playerListDiv.id = 'player-list-indicator';
            playerListDiv.style.position = 'absolute';
            playerListDiv.style.top = '60px';
            playerListDiv.style.left = '10px';
            playerListDiv.style.background = 'rgba(30,30,30,0.92)';
            playerListDiv.style.padding = '10px 18px 10px 18px';
            playerListDiv.style.borderRadius = '10px';
            playerListDiv.style.boxShadow = '0 2px 8px #0004';
            playerListDiv.style.fontSize = '1.13em';
            playerListDiv.style.color = '#fff';
            playerListDiv.style.zIndex = '1001';
            playerListDiv.style.minWidth = '180px';
            document.body.appendChild(playerListDiv);
        }
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
    function renderPlayerList(currentTurnColor) {
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
            for (const [userId, cHex] of Object.entries(colorPlayers)) {
                if (cHex === colorHex && colorNames[userId]) {
                    playerName = colorNames[userId];
                    break;
                }
            }
            const isJoined = joinedColors.includes(colorHex);
            const isActive = (currentTurnColor && colorHex === currentTurnColor);
            playerInfos.push({ colorHex, colorName, playerName, isJoined, isActive });
        }
        // Render
        let html = '';
        if (totalCount < playerCount) {
            html += `<div style="font-size:1.08em;color:#ffe066;margin-bottom:7px;">ველოდებით მოთამაშეებს</div>`;
        }
        html += playerInfos.filter(p => p.isJoined).map(p =>
            `<div style="display:flex;align-items:center;margin-bottom:2px;">
                <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${p.colorHex};margin-right:8px;border:2px solid #fff;"></span>
                <span style="font-weight:${p.isActive ? 'bold' : 'normal'};color:${p.isActive ? '#ffe066' : (p.isJoined ? '#fff' : '#888')};text-shadow:${p.isActive ? '0 0 6px #ffe06699' : 'none'};\">${p.playerName}</span>
            </div>`
        ).join('');
        playerListDiv.innerHTML = html;
    }

    // On initial load, show player list
    renderPlayerList(currentTurnColor);
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
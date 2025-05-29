// board.js — დაფის გენერაცია და ქვების დახატვა

// პარამეტრები
export const ROWS = [2,3,4,11,12,11,10,9,10,11,12,11,4,3,2];
export const BOARD_CENTER = {x: 350, y: 350};
export const HOLE_RADIUS = 11; // ბუდეების და ქვების რადიუსი
export const HOLE_DIST = 13 * 2.7 - 1; // ბუდეებს შორის მანძილი
export const ROW_HEIGHT = HOLE_DIST * 0.92; // ვერტიკალური დაშორება

// ბუდეების კოორდინატების გენერაცია
export const holeCoords = {};
export const holeIndexMap = {}; // num -> {rowIdx, colIdx}
export const indexToNum = {};   // rowIdx,colIdx -> num
let holeNum = 1;
const startY = BOARD_CENTER.y - (ROWS.length-1)/2 * ROW_HEIGHT;
ROWS.forEach((count, rowIdx) => {
    const rowY = startY + rowIdx * ROW_HEIGHT;
    const rowWidth = (count-1) * HOLE_DIST;
    const startX = BOARD_CENTER.x - rowWidth/2;
    for(let colIdx=0; colIdx<count; colIdx++) {
        const x = startX + colIdx * HOLE_DIST;
        const y = rowY;
        holeCoords[holeNum] = {x, y};
        holeIndexMap[holeNum] = {rowIdx, colIdx};
        indexToNum[`${rowIdx},${colIdx}`] = holeNum;
        holeNum++;
    }
});

// ქვების ობიექტური აღწერა
export const STONE_COLORS = {
    green:   '#2ecc40',
    orange:  '#ff9800',
    navy:    '#3a3a7a',
    blue:    '#3498db',
    yellow:  '#f1c40f',
    red:     '#e74c3c',
};
export const stones = [
    ...[3,5,6,9,14,15,16].map((pos,i)=>({id:`g${i+1}`, color:STONE_COLORS.green, pos})),
    ...[11,12,24,35,45,33,44].map((pos,i)=>({id:`o${i+1}`, color:STONE_COLORS.orange, pos})),
    ...[18,19,29,41,52,43,53].map((pos,i)=>({id:`n${i+1}`, color:STONE_COLORS.navy, pos})),
    ...[63,64,73,75,87,97,98].map((pos,i)=>({id:`b${i+1}`, color:STONE_COLORS.blue, pos})),
    ...[71,72,81,83,92,104,105].map((pos,i)=>({id:`y${i+1}`, color:STONE_COLORS.yellow, pos})),
    ...[100,101,102,107,110,111,113].map((pos,i)=>({id:`r${i+1}`, color:STONE_COLORS.red, pos})),
];

// ქვების მდგომარეობა და ბუდეების მდგომარეობა
export let stonesState = JSON.parse(JSON.stringify(stones)); // deep copy
export let holeState = {};
Object.keys(holeCoords).forEach(num => { holeState[num] = null; });
stonesState.forEach(stone => { holeState[stone.pos] = stone.id; });

// SVG creation and board rendering logic
let svg = null;
export function setSVGElement(element) {
    svg = element;
}

export const RING_GROUPS = [
    [1,2,3,4,5,7,8],           // green
    [19,20,30,31,32,42,43],   // navy
    [82,83,93,94,95,105,106], // yellow
    [108,109,111,112,113,114,115], // red
    [73,74,84,85,86,96,97],   // blue
    [10,11,21,22,23,33,34],   // orange
];

export function drawColorGroups(svg, stonesState, holeCoords, HOLE_RADIUS, BOARD_CENTER, STONE_COLORS, holeState, playerCount, hiddenColors) {
    // წაშალე ძველი რგოლები
    Array.from(svg.querySelectorAll('.color-ring')).forEach(e => e.remove());
    // --- რგოლების ცენტრი და რადიუსი: თითოეული ჯგუფის 7 ბუდის მიხედვით ---
    const circleColors = [
        STONE_COLORS.green,
        STONE_COLORS.navy,
        STONE_COLORS.yellow,
        STONE_COLORS.red,
        STONE_COLORS.blue,
        STONE_COLORS.orange
    ];
    for(let i=0; i<6; i++) {
        if (
            (playerCount === 2 && ![3,0].includes(i)) ||
            (playerCount === 3 && [2,5,4].includes(i)) ||
            (playerCount === 4 && [2,5].includes(i)) ||
            (playerCount === 5 && i === 2)
        ) continue;
        const groupHoles = RING_GROUPS[i];
        // ცენტრი: 7 ბუდის საშუალო (centroid)
        const cx = groupHoles.reduce((sum, num) => sum + holeCoords[num].x, 0) / groupHoles.length;
        const cy = groupHoles.reduce((sum, num) => sum + holeCoords[num].y, 0) / groupHoles.length;
        // რადიუსი: საშუალო მანძილი ცენტრიდან თითოეულ ბუდემდე
        const r = groupHoles.reduce((sum, num) => sum + Math.hypot(holeCoords[num].x - cx, holeCoords[num].y - cy), 0) / groupHoles.length + HOLE_RADIUS*1.6;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        circle.setAttribute('stroke', circleColors[i]);
        circle.setAttribute('stroke-width', '3');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('pointer-events', 'none');
        circle.setAttribute('class', 'color-ring');
        svg.appendChild(circle);
    }
}

// ფერები, რომლებიც უნდა დამალოს მოთამაშეების რაოდენობის მიხედვით
const colorHideMap = {
    6: [],
    5: [STONE_COLORS.yellow],
    4: [STONE_COLORS.yellow, STONE_COLORS.orange],
    3: [STONE_COLORS.yellow, STONE_COLORS.orange, STONE_COLORS.blue],
    2: [STONE_COLORS.yellow, STONE_COLORS.orange, STONE_COLORS.blue, STONE_COLORS.navy],
};

export function filterActiveStonesByPlayerCount(playerCount = 6) {
    const hiddenColors = colorHideMap[playerCount] || [];
    return stones.filter(stone => !hiddenColors.includes(stone.color));
}

export function resetStonesState(playerCount = 6) {
    stonesState = JSON.parse(JSON.stringify(filterActiveStonesByPlayerCount(playerCount)));
    holeState = {};
    Object.keys(holeCoords).forEach(num => { holeState[num] = null; });
    stonesState.forEach(stone => { holeState[stone.pos] = stone.id; });
}

import diagonals from '../assets/diagonals115.js';

export function renderBoard({stonesState, holeState, selectedStoneId, allowedTargets, jumpTargets, myColor, currentTurnColor, hiddenColors, HOLE_RADIUS, STONE_COLORS, BOARD_CENTER, holeCoords, playerCount}) {
    if (!svg) return;
    // წაშალე ძველი ქვები და ბუდეების ჰაილაითი
    Array.from(svg.querySelectorAll('[data-stone-id], .stone-highlight, .hole-allowed, .hole-diagonal, .hole-jump, .board-hole')).forEach(e => e.remove());
    Object.entries(holeCoords).forEach(([num, {x, y}]) => {
        const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hole.setAttribute('cx', x);
        hole.setAttribute('cy', y);
        hole.setAttribute('r', HOLE_RADIUS);
        hole.setAttribute('fill', '#f5f5dc');
        hole.setAttribute('stroke', '#bdb76b');
        hole.setAttribute('stroke-width', '1.2');
        hole.setAttribute('class', 'board-hole');
        hole.setAttribute('data-hole-num', num);
        hole.style.touchAction = 'manipulation';
        hole.style.pointerEvents = 'all';
        svg.appendChild(hole);
        // --- draw hole number as in codes.html ---
        const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        numText.setAttribute('x', x);
        numText.setAttribute('y', y + 5);
        numText.setAttribute('text-anchor', 'middle');
        numText.setAttribute('font-size', '9.6');
        numText.setAttribute('fill', '#000');
        numText.setAttribute('font-weight', 'bold');
        numText.textContent = num;
        numText.setAttribute('pointer-events', 'none');
        svg.appendChild(numText);
    });
    // --- highlight all allowed trajectories from diagonals115.json in yellow if stone is selected ---
    if (selectedStoneId) {
        const selectedStone = stonesState.find(s => s.id === selectedStoneId);
        if (selectedStone) {
            const diag = diagonals[selectedStone.pos];
            if (diag) {
                const highlightNums = new Set();
                Object.values(diag).forEach(arr => arr.forEach(n => highlightNums.add(n)));
                highlightNums.forEach(num => {
                    if (!holeCoords[num]) return;
                    const {x, y} = holeCoords[num];
                    const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    highlight.setAttribute('cx', x);
                    highlight.setAttribute('cy', y);
                    highlight.setAttribute('r', HOLE_RADIUS*1.08);
                    highlight.setAttribute('fill', '#ff0');
                    highlight.setAttribute('fill-opacity', '0.18');
                    highlight.setAttribute('stroke', '#ff0');
                    highlight.setAttribute('stroke-width', '1.2');
                    highlight.setAttribute('class', 'hole-diagonal');
                    highlight.setAttribute('pointer-events', 'none');
                    svg.appendChild(highlight);
                });
            }
        }
    }
    // highlight for allowedTargets (blue)
    if (allowedTargets && allowedTargets.length > 0) {
        allowedTargets.forEach(num => {
            if (!holeCoords[num]) return;
            const {x, y} = holeCoords[num];
            const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            highlight.setAttribute('cx', x);
            highlight.setAttribute('cy', y);
            highlight.setAttribute('r', HOLE_RADIUS*1.18);
            highlight.setAttribute('fill', '#00e0ff');
            highlight.setAttribute('fill-opacity', '0.22');
            highlight.setAttribute('stroke', '#00e0ff');
            highlight.setAttribute('stroke-width', '2.5');
            highlight.setAttribute('class', 'hole-jump');
            highlight.setAttribute('pointer-events', 'none');
            svg.appendChild(highlight);
        });
    }
    if (jumpTargets && jumpTargets.length > 0) {
        jumpTargets.forEach(num => {
            if (!holeCoords[num]) return;
            const {x, y} = holeCoords[num];
            const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            highlight.setAttribute('cx', x);
            highlight.setAttribute('cy', y);
            highlight.setAttribute('r', HOLE_RADIUS*1.18);
            highlight.setAttribute('fill', '#00e0ff');
            highlight.setAttribute('fill-opacity', '0.22');
            highlight.setAttribute('stroke', '#00e0ff');
            highlight.setAttribute('stroke-width', '2.5');
            highlight.setAttribute('class', 'hole-jump');
            highlight.setAttribute('pointer-events', 'none');
            svg.appendChild(highlight);
        });
    }
    // --- Add click-to-move logic for allowed/jump targets ---
    if (selectedStoneId && (allowedTargets && allowedTargets.length > 0 || jumpTargets && jumpTargets.length > 0)) {
        const allTargets = new Set([...(allowedTargets||[]), ...(jumpTargets||[])]);
        allTargets.forEach(num => {
            if (!holeCoords[num]) return;
            const {x, y} = holeCoords[num];
            const clickable = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            clickable.setAttribute('cx', x);
            clickable.setAttribute('cy', y);
            clickable.setAttribute('r', HOLE_RADIUS*1.18);
            clickable.setAttribute('fill', '#fff');
            clickable.setAttribute('opacity', '0');
            clickable.setAttribute('style', 'cursor:pointer; pointer-events:all;');
            clickable.addEventListener('mouseenter', () => { svg.style.cursor = 'pointer'; });
            clickable.addEventListener('mouseleave', () => { svg.style.cursor = 'default'; });
            clickable.addEventListener('click', (e) => {
                const event = new CustomEvent('board-hole-click', { detail: { targetNum: num } });
                svg.dispatchEvent(event);
            });
            svg.appendChild(clickable);
        });
    }
    stonesState.forEach(stone => {
        if (hiddenColors && hiddenColors.includes(stone.color)) return;
        let x = holeCoords[stone.pos].x;
        let y = holeCoords[stone.pos].y;
        const gradId = `stonegrad_${stone.id}`;
        const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        shadow.setAttribute('cx', x+2);
        shadow.setAttribute('cy', y+4);
        shadow.setAttribute('rx', HOLE_RADIUS*0.95);
        shadow.setAttribute('ry', HOLE_RADIUS*0.5);
        shadow.setAttribute('class', 'stone-highlight');
        shadow.setAttribute('fill', 'rgba(0,0,0,0.18)');
        svg.appendChild(shadow);
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        s.setAttribute('cx', x);
        s.setAttribute('cy', y);
        s.setAttribute('r', HOLE_RADIUS*0.95);
        s.setAttribute('fill', stone.color);
        s.setAttribute('stroke', '#fff');
        s.setAttribute('stroke-width', '1.5');
        s.setAttribute('data-stone-id', stone.id);
        s.setAttribute('style', 'touch-action: manipulation; pointer-events: all;');
        if (selectedStoneId === stone.id) {
            s.setAttribute('stroke', '#ff0');
            s.setAttribute('stroke-width', '3');
            s.setAttribute('filter', 'drop-shadow(0 0 6px #ff0a)');
        }
        // --- კურსორის შეცვლა ქვებზე ---
        s.style.cursor = 'pointer';
        svg.appendChild(s);
        // highlight (ზედა შუქი)
        const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        highlight.setAttribute('cx', x-3);
        highlight.setAttribute('cy', y-HOLE_RADIUS/2);
        highlight.setAttribute('rx', HOLE_RADIUS*0.45);
        highlight.setAttribute('ry', HOLE_RADIUS*0.18);
        highlight.setAttribute('fill', 'rgba(255,255,255,0.38)');
        highlight.setAttribute('class', 'stone-highlight');
        svg.appendChild(highlight);
    });
}

// Export a function to draw static color rings (call only once on load)
export function drawStaticColorGroups(svg) {
    drawColorGroups(svg, [], holeCoords, HOLE_RADIUS, BOARD_CENTER, STONE_COLORS, {}, 6, []);
}

// Restore setStonesState for syncing stones from server
export function setStonesState(newState) {
    stonesState.length = 0;
    newState.forEach(s => stonesState.push({...s}));
    // Also update holeState to match stonesState
    Object.keys(holeState).forEach(k => { holeState[k] = null; });
    stonesState.forEach(stone => { holeState[stone.pos] = stone.id; });
}

// --- Winner visual effects ---
export function ensureWinnerGlowFilter(svg) {
    if (!svg.querySelector('#glow')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'glow');
        filter.setAttribute('x', '-50%');
        filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%');
        filter.setAttribute('height', '200%');
        const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        blur.setAttribute('stdDeviation', '6');
        blur.setAttribute('result', 'coloredBlur');
        filter.appendChild(blur);
        defs.appendChild(filter);
        svg.insertBefore(defs, svg.firstChild);
    }
}
export function clearWinnerHighlights(svg) {
    Array.from(svg.querySelectorAll('.winner-glow')).forEach(e => e.remove());
}
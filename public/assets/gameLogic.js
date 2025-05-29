// gameLogic.js — თამაშის სვლების გამოთვლა და ლოგიკა

// ყველა ფუნქცია, რომელიც ითვლის შესაძლო სვლებს, გადახტომებს, დიაგონალებს და ა.შ.

export function getSingleStepTargets(stone, holeIndexMap, ROWS, indexToNum, holeState) {
    const {rowIdx, colIdx} = holeIndexMap[stone.pos];
    const MOVE_DIRECTIONS = [
        {dr: -1, dc: 0},  // ზემოთ
        {dr: -1, dc: 1},  // მარჯვნივ ზემოთ
        {dr: 0, dc: 1},   // მარჯვნივ
        {dr: 1, dc: 0},   // ქვემოთ
        {dr: 1, dc: -1},  // მარცხნივ ქვემოთ
        {dr: 0, dc: -1},  // მარცხნივ
    ];
    const targets = [];
    for (const {dr, dc} of MOVE_DIRECTIONS) {
        const r = rowIdx + dr;
        const c = colIdx + dc;
        if (r >= 0 && r < ROWS.length && c >= 0 && c < ROWS[r]) {
            const n = indexToNum[`${r},${c}`];
            if (n && !holeState[n]) targets.push(n);
        }
    }
    return targets;
}

export function getAllJumpTargets(stone, holeIndexMap, ROWS, indexToNum, holeState) {
    const visited = new Set();
    const results = new Set();
    const startNum = stone.pos;
    function dfs(currentNum) {
        const {rowIdx, colIdx} = holeIndexMap[currentNum];
        const MOVE_DIRECTIONS = [
            {dr: -1, dc: 0},  // ზემოთ
            {dr: -1, dc: 1},  // მარჯვნივ ზემოთ
            {dr: 0, dc: 1},   // მარჯვნივ
            {dr: 1, dc: 0},   // ქვემოთ
            {dr: 1, dc: -1},  // მარცხნივ ქვემოთ
            {dr: 0, dc: -1},  // მარცხნივ
        ];
        for (const {dr, dc} of MOVE_DIRECTIONS) {
            let r = rowIdx + dr;
            let c = colIdx + dc;
            let overNum = indexToNum[`${r},${c}`];
            if (!overNum || !holeState[overNum]) continue;
            let jumpR = r + dr;
            let jumpC = c + dc;
            let jumpNum = indexToNum[`${jumpR},${jumpC}`];
            while (jumpNum && !holeState[jumpNum]) {
                if (jumpNum !== startNum) results.add(jumpNum);
                const key = `${jumpNum}-${dr},${dc}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    const prev = holeState[jumpNum];
                    holeState[jumpNum] = stone.id;
                    dfs(jumpNum);
                    holeState[jumpNum] = prev;
                }
                jumpR += dr;
                jumpC += dc;
                jumpNum = indexToNum[`${jumpR},${jumpC}`];
            }
        }
    }
    dfs(startNum);
    return Array.from(results);
}

// Immediate (one-step) diagonal moves from DIAGONALS (codes.html logic)
export function getImmediateTargetsFromDiagonals(stone, DIAGONALS, holeState) {
    if (!DIAGONALS) return [];
    const entry = DIAGONALS[String(stone.pos)];
    if (!entry) return [];
    let immediateTargets = [];
    for (const dir of ["↖","↗","↙","↘"]) {
        if (Array.isArray(entry[dir]) && entry[dir].length > 0) {
            const first = entry[dir][0];
            if (!holeState[first]) immediateTargets.push(first);
        }
    }
    return immediateTargets;
}

// All possible jump targets from DIAGONALS (codes.html logic)
export function getJumpTargetsFromDiagonals(stone, DIAGONALS, holeState, visitedPositions = new Set()) {
    if (!DIAGONALS) return [];
    const entry = DIAGONALS[String(stone.pos)];
    if (!entry) return [];
    let jumpTargets = [];
    for (const dir of ["↖","↗","↙","↘"]) {
        const path = entry[dir];
        if (!Array.isArray(path) || path.length === 0) continue;
        for (let i = 0; i < path.length; ++i) {
            if (!holeState[path[i]]) continue; // skip if not occupied
            const N = i;
            if (N === 0) continue; // must be at least one empty before
            // Check all holes before i are empty
            let allBeforeEmpty = true;
            for (let j = 0; j < N; ++j) {
                if (holeState[path[j]]) {
                    allBeforeEmpty = false;
                    break;
                }
            }
            if (!allBeforeEmpty) continue;
            // Jump to the (i+N+1)-th hole (N holes after occupied, so N+1 after occupied)
            let jumpIdx = i + N + 1;
            if (jumpIdx >= path.length) continue;
            // All holes between occupied and jumpIdx must be empty
            let allAfterEmpty = true;
            for (let j = i + 1; j < jumpIdx; ++j) {
                if (holeState[path[j]]) {
                    allAfterEmpty = false;
                    break;
                }
            }
            if (allAfterEmpty && !holeState[path[jumpIdx]]) {
                // ახალი ლოგიკა: თუ ეს პოზიცია უკვე ნახტუნებია, არ დავამატოთ
                if (!visitedPositions.has(path[jumpIdx])) {
                    jumpTargets.push(path[jumpIdx]);
                }
            }
        }
    }
    // Only unique targets
    return Array.from(new Set(jumpTargets));
}

// All allowed targets from DIAGONALS (all empty holes on the diagonals)
export function getAllowedTargetsFromDiagonals(stone, DIAGONALS, holeState) {
    if (!DIAGONALS) return [];
    const entry = DIAGONALS[String(stone.pos)];
    if (!entry) return [];
    let allTargets = [];
    for (const dir of ["↖","↗","↙","↘"]) {
        if (Array.isArray(entry[dir])) {
            allTargets = allTargets.concat(entry[dir]);
        }
    }
    // Only allow empty holes
    return allTargets.filter(num => !holeState[num]);
}

// ... (გაგრძელება: getAllowedTargets, getDiagonalHoles, getCustomDiagonals, getStarDiagonals, getTrueDiagonals, getManualDiagonals, getAllowedTargetsFromDiagonals, getImmediateTargetsFromDiagonals, getJumpTargetsFromDiagonals და სხვა დამხმარე ფუნქციები) ... 
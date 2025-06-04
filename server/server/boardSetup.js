// boardSetup.js — ქვების და ფერების გენერაცია მოთამაშეების რაოდენობის მიხედვით

const STONE_COLORS = {
  green:   '#2ecc40',
  orange:  '#ff9800',
  navy:    '#3a3a7a',
  blue:    '#3498db',
  yellow:  '#f1c40f',
  red:     '#e74c3c',
};

const colorOrder = [
  STONE_COLORS.red,
  STONE_COLORS.green,
  STONE_COLORS.blue,
  STONE_COLORS.navy,
  STONE_COLORS.orange,
  STONE_COLORS.yellow
];

const stones = [
  ...[3,5,6,9,14,15,16].map((pos,i)=>({id:`g${i+1}`, color:STONE_COLORS.green, pos})),
  ...[11,12,24,35,45,33,44].map((pos,i)=>({id:`o${i+1}`, color:STONE_COLORS.orange, pos})),
  ...[18,19,29,41,52,43,53].map((pos,i)=>({id:`n${i+1}`, color:STONE_COLORS.navy, pos})),
  ...[63,64,73,75,87,97,98].map((pos,i)=>({id:`b${i+1}`, color:STONE_COLORS.blue, pos})),
  ...[71,72,81,83,92,104,105].map((pos,i)=>({id:`y${i+1}`, color:STONE_COLORS.yellow, pos})),
  ...[100,101,102,107,110,111,113].map((pos,i)=>({id:`r${i+1}`, color:STONE_COLORS.red, pos})),
];

const colorHideMap = {
  6: [],
  5: [STONE_COLORS.yellow],
  4: [STONE_COLORS.yellow, STONE_COLORS.orange],
  3: [STONE_COLORS.yellow, STONE_COLORS.orange, STONE_COLORS.blue],
  2: [STONE_COLORS.yellow, STONE_COLORS.orange, STONE_COLORS.blue, STONE_COLORS.navy],
};

function getActiveColors(playerCount) {
  const hiddenColors = colorHideMap[playerCount] || [];
  return colorOrder.filter(c => !hiddenColors.includes(c)).slice(0, playerCount);
}

function getInitialStones(playerCount) {
  const hiddenColors = colorHideMap[playerCount] || [];
  return stones.filter(stone => !hiddenColors.includes(stone.color));
}

function getInitialHoleState(stonesList) {
  const holeState = {};
  for (let i = 1; i <= 115; ++i) holeState[i] = null;
  stonesList.forEach(stone => { holeState[stone.pos] = stone.id; });
  return holeState;
}

function getInitialBoardState(playerCount) {
  const stonesList = getInitialStones(playerCount);
  const holeState = getInitialHoleState(stonesList);
  return {
    stonesState: stonesList,
    holeState
  };
}

module.exports = {
  STONE_COLORS,
  colorOrder,
  colorHideMap,
  getActiveColors,
  getInitialStones,
  getInitialHoleState,
  getInitialBoardState
}; 
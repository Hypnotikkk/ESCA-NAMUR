"use strict";

const GRID_SIZE = 5;
let coordX = 2, coordY = 2; 

let prevX = coordX, prevY = coordY;

/* ========= DOM ========= */
const grid  = document.querySelector('.js-grid');
const cells = [...document.querySelectorAll('.js-cell')];
const player = document.getElementById('player');

/* ========= Utils ========= */
const clamp = (min, max, v) => Math.max(min, Math.min(max, v));
function faceLeft(){  player.style.setProperty('--flip', -1); }
function faceRight(){ player.style.setProperty('--flip',  1); }

/* ====== BGM ====== */
let bgm = null;
let bgmTried = false;

function initBgm(){
  if (bgm) return;
  bgm = new Audio('sons/fond.mp3'); 
  bgm.loop = true;
  bgm.preload = 'auto';
}

async function tryPlayBgm(){
  initBgm();
  if (!bgm || bgmTried) return;
  bgmTried = true;
  try {
    await bgm.play();  
  } catch (err) {
    
    const unlock = () => {
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('pointerdown', unlock);
      bgm.play().catch(()=>{});
    };
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('pointerdown', unlock, { once: true });
  }
}

function stopBgm(){
  if (!bgm) return;
  bgm.pause();
  bgm.currentTime = 0;
}


/* ========= Cellules ========= */
function updateCell(x, y){
  document.querySelector('.js-cell.active')?.classList.remove('active');
  const cell = cells.find(c => +c.dataset.x === x && +c.dataset.y === y);
  if (cell) cell.classList.add('active');

  const tx = -(x * 100);
  const ty = -(y * 100);
  grid.style.transform = `translate(${tx}%, ${ty}%)`;

if (prevX === 0 && prevY === 2 && (x !== 0 || y !== 2)) {
  stopVictoryMusic();
  resumeBgm();
}


  onActiveCellChanged();
}

function goToAbs(x, y){
  prevX = coordX; 
  prevY = coordY;

  coordX = clamp(0, GRID_SIZE - 1, x);
  coordY = clamp(0, GRID_SIZE - 1, y);
  updateCell(coordX, coordY);
}


/* hotspots (bloquée pendant mini-jeux) */
grid.addEventListener('click', (e) => {
  if (isGameActive()) return;
  const btn = e.target.closest('.hotspot');
  if (!btn) return;
  const to = btn.dataset.to;
  if (!to) return;
  const [x, y] = to.split(',').map(n => parseInt(n, 10));
  goToAbs(x, y);
});

/* ========= Joueur ========= */
const PLAYER_SPEED = 150;     

let dir = 0;                  
let playerX = 0;              
let minX = 0, maxX = 0;       
let playerT = 0.5;            

/* ====== ETAT VERROU BORNES ====== */
let lockSide = null;          

/* ====== SÉLECTION CLAVIER ====== */
let selectionActive = false;
let selectionSide   = null;   
let selectionIndex  = 0;
let selectionList   = [];

function getActiveCell(){ return document.querySelector('.js-cell.active'); }
function getActiveBg(){ return getActiveCell()?.querySelector('.cell-bg'); }

/* ====== MINI-JEU :  briques ====== */
let miniGameActive = false;
let mgLayer = null;
let mgRAF = 0;
let mgSpawnTimer = 0;
let mgEndAt = 0;
let mgHud = null;
const MG_SPAWN_EVERY = 480; 
const MG_DURATION_MS = 30000;
const MG_MIN_SPEED = 160;   
const MG_MAX_SPEED = 260;   
const MG_BRICKS = new Set();

/* Vies + message */
let mgHits = 0;
const MG_MAX_HITS = 3;
let mgStartMsg = null;

/* ====== MINI-JEU : particules ====== */
let partGameActive = false;
let partLayer = null;
let partHud = null;
let partList = [];
let partSelectedIndex = 0;

/* ====== État global jeux ====== */
const isGameActive = () => (miniGameActive || partGameActive || kbActive);


/* ======== Sélection hotspots util ======== */
function computeHotspotsBySide(cell){
  const result = { left: [], right: [] };
  if (!cell) return result;

  const hs = cell.querySelector('.hotspots');
  const btns = [...cell.querySelectorAll('.hotspot')];
  if (!hs || !btns.length) return result;

  const hsRect = hs.getBoundingClientRect();
  const midX = hsRect.left + hsRect.width / 2;

  btns.forEach(btn => {
    if (!btn.offsetParent) return;
    const r = btn.getBoundingClientRect();
    const centerX = r.left + r.width / 2;
    const side = (centerX >= midX) ? 'right' : 'left';
    result[side].push(btn);
  });

  const sortByTop = (a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  result.left.sort(sortByTop);
  result.right.sort(sortByTop);
  return result;
}

function clearSelectableClasses(){
  selectionList.forEach(el => el.classList.remove('kbd-selectable','kbd-selected'));
}

function enterSelectionMode(side){
  const cell = getActiveCell();
  const bySide = computeHotspotsBySide(cell);
  selectionList = (side === 'right') ? bySide.right : bySide.left;
  clearSelectableClasses();
  selectionList.forEach(el => el.classList.add('kbd-selectable'));
  selectionIndex = 0;
  highlightSelection();
  selectionActive = true;
  selectionSide = side;
}

function exitSelectionMode(){
  clearSelectableClasses();
  selectionActive = false;
  selectionSide = null;
  selectionIndex = 0;
  selectionList = [];
}

function highlightSelection(){
  selectionList.forEach(el => el.classList.remove('kbd-selected'));
  if (selectionList.length === 0) return;
  const el = selectionList[clamp(0, selectionList.length - 1, selectionIndex)];
  el.classList.add('kbd-selected');
}

function cycleSelection(delta){
  if (!selectionActive || selectionList.length === 0) return;
  selectionIndex = (selectionIndex + delta + selectionList.length) % selectionList.length;
  highlightSelection();
}

function activateSelection(){
  if (!selectionActive || selectionList.length === 0) return;
  const el = selectionList[clamp(0, selectionList.length - 1, selectionIndex)];
  const to = el?.dataset?.to;
  if (!to) return;
  const [x, y] = to.split(',').map(n => parseInt(n, 10));
  goToAbs(x, y);
}

/* ============ image contain ============ *//*ia*/
function getContainedRect(cell, img){
  const cellRect = cell.getBoundingClientRect();
  const cw = cellRect.width, ch = cellRect.height;
  const iw = img.naturalWidth  || cw;
  const ih = img.naturalHeight || ch;
  const scale = Math.min(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const left = (cw - dw) / 2;
  const top  = (ch - dh) / 2;
  return { left, top, right: left + dw, bottom: top + dh, width: dw, height: dh };
}

/* === ancrer joueur image === *//*ia*/
function attachPlayerToActiveCell(){
  const cell = getActiveCell();
  if (!cell || !player) return;

  let anchor = cell.querySelector('.hotspots');
  if (!anchor){
    anchor = document.createElement('div');
    anchor.className = 'hotspots';
    cell.appendChild(anchor);
  }
  positionHotspotsInsideBg(cell);

  if (player.parentElement !== anchor) anchor.appendChild(player);
}

function computeBounds(){
  const cell = getActiveCell();
  const img  = getActiveBg();
  if (!cell || !img || !player) return;

  const r = getContainedRect(cell, img);
  const pw = player.getBoundingClientRect().width || 48;
  const half = pw / 2;

  minX = half;
  maxX = r.width - half;
}

function respawnCenter(){
  const cell = getActiveCell();
  const img  = getActiveBg();
  if (!cell || !img) return;

  const center = () => {
    computeBounds();
    const r = getContainedRect(cell, img);
    playerT = 0.5;
    playerX = r.width * playerT;
    applyPlayerStyle();
  };

  if (!img.complete || img.naturalWidth === 0){
    img.addEventListener('load', center, { once: true });
  } else {
    center();
  }
}

function applyPlayerStyle(){
  player.style.left = `${playerX}px`;
}

function repositionPlayer(){
  const cell = getActiveCell();
  const img  = getActiveBg();
  if (!cell || !img) return;

  computeBounds();
  const r = getContainedRect(cell, img);
  const targetX = playerT * r.width;
  playerX = clamp(minX, maxX, targetX);
  applyPlayerStyle();
}

function onActiveCellChanged(){
  attachPlayerToActiveCell();
  ensureBornesOnCell(getActiveCell());
  lockSide = null;
  exitSelectionMode();
  respawnCenter();
}

/* === Hotspots image === */
function positionHotspotsInsideBg(cell){
  const hs = cell.querySelector('.hotspots');
  const bg = cell.querySelector('.cell-bg');
  if (!hs || !bg) return;

  const r = getContainedRect(cell, bg);
  hs.style.left   = r.left + 'px';
  hs.style.top    = r.top + 'px';
  hs.style.width  = r.width + 'px';
  hs.style.height = r.height + 'px';
  hs.style.right  = 'auto';
  hs.style.bottom = 'auto';
}

function repositionAllHotspots(){
  document.querySelectorAll('.js-cell').forEach(positionHotspotsInsideBg);
  if (selectionActive && selectionSide){
    const bySide = computeHotspotsBySide(getActiveCell());
    selectionList = (selectionSide === 'right') ? bySide.right : bySide.left;
    highlightSelection();
  }
}

/* ======== Input clavier ======== */
window.addEventListener('keydown', (e) => {
  /* === Contrôles particules === */
  if (partGameActive){
    if (e.code === 'ArrowLeft'){  partPrev();   e.preventDefault(); return; }
    if (e.code === 'ArrowRight'){ partNext();   e.preventDefault(); return; }
    if (e.code === 'Enter'){      partRotate(); e.preventDefault(); return; }
    e.preventDefault();
    return;
  }

  if (!isGameActive() && e.code === 'Enter'){
  if (isOverExtraBtn21()){
    goToAbs(2, 2);   
    e.preventDefault();
    return;
  }
}

  if (!isGameActive() && e.code === 'Enter'){
    if (isOverExtraBtn11()){
      startMiniGame();
      e.preventDefault();
      return;
    }
    if (isOverExtraBtn00()){
      startParticlesGame();
      e.preventDefault();
      return;
    }
  }

  
  if (miniGameActive){
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter'){
      e.preventDefault();
      return;
    }
  }

  
if (!isGameActive() && e.code === 'Enter'){
  if (isOverExtraBtn02()){
    stopBgm();
    openKeyboard02();
    e.preventDefault();
    return;
  }
  
}
/*ia*/
if (kbActive){
  
  if (e.code === 'Escape'){ e.preventDefault(); return; }

  
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown'){ moveKb02(+1); e.preventDefault(); return; }
  if (e.code === 'ArrowLeft'  || e.code === 'ArrowUp'){   moveKb02(-1); e.preventDefault(); return; }
  if (e.code === 'Home'){ kb02Sel = 0; updateKb02Selected(); e.preventDefault(); return; }
  if (e.code === 'End'){  kb02Sel = getKb02Buttons().length - 1; updateKb02Selected(); e.preventDefault(); return; }

  if (e.code === 'Enter' || e.code === 'NumpadEnter'){
    activateKb02Selected();
    e.preventDefault();
    return;
  }

  e.preventDefault();
  return;
}




  // Sélection hotspots (si pas mini-jeu)/*ia*/
  if (!isGameActive() && selectionActive){
    if (e.code === 'ArrowUp'){   cycleSelection(-1); e.preventDefault(); return; }
    if (e.code === 'ArrowDown'){ cycleSelection(+1); e.preventDefault(); return; }
    if (e.code === 'Enter'){     activateSelection(); e.preventDefault(); return; }
  }

  // ← / → déplacements joueur 
  if (e.code === 'ArrowLeft'){
    if (lockSide === 'right'){ lockSide = null; exitSelectionMode(); dir = -1; faceLeft(); }
    else if (lockSide === 'left'){ dir = 0; }
    else { dir = -1; faceLeft(); }
    e.preventDefault();
  }
  if (e.code === 'ArrowRight'){
    if (lockSide === 'left'){ lockSide = null; exitSelectionMode(); dir = 1; faceRight(); }
    else if (lockSide === 'right'){ dir = 0; }
    else { dir = 1; faceRight(); }
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if ((e.code === 'ArrowLeft'  && dir === -1) ||
      (e.code === 'ArrowRight' && dir ===  1)){
    dir = 0; e.preventDefault();
  }
});

function updatePlayerRatioFromX(){
  const cell = getActiveCell();
  const img  = getActiveBg();
  if (!cell || !img) return;
  const r = getContainedRect(cell, img);
  playerT = clamp(0, 1, playerX / r.width);
}

/* ======== Overlap   ======== */
function rectsOverlap(a, b){
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/* ======== Clé  ======== */
function advanceKeyStep(){
  if (keyStep < imagesCycle.length - 1){
    keyStep++;
    document.querySelectorAll('.cycle-img').forEach(img => {
      img.src = imagesCycle[keyStep];
      img.dataset.step = keyStep;
    });
    if (keyStep === imagesCycle.length - 1){
      document.querySelectorAll('.batiment-btn').forEach(b => b.remove());
      setTimeout(() => { goToAbs(2, 1); }, 0);
    }
  }
}
/*ia*/
function checkKeyPickup(){
  const cell = getActiveCell();
  if (!cell || !player) return;

  const pRect = player.getBoundingClientRect();
  cell.querySelectorAll('.batiment-btn').forEach(btn => {
    const bRect = btn.getBoundingClientRect();
    if (rectsOverlap(pRect, bRect)){
      btn.remove();
      advanceKeyStep();
    }
  });
}

/* ======== BORNES  ======== */
const BORNES_BY_CELL = {
  "2,2": { left: true, right: true },
  "0,0": { left: { w: "12%"}, right: true },
  "1,1": { left: true, right: true },
  "0,2": { left: { w: "11%"}, right: true },
  "1,2": { left: true, right: true },
  "3,2": { left: true, right: true },
  "4,2": { left: true, right: { w: "12%"} },
  "1,3": { left: { w: "10%"}, right: true },
  "3,3": { left: true, right: true },
  "2,4": { left: true, right: true },
  "3,4": { left: true, right: { w: "10%"} },
};

/* ====== CLAVIER (0,2)  ====== */
let kbActive = false;
let kbLayer02 = null;


const KB02_BTNS = [
  { id: 'kb02-1', label: 'DO', sound : "sons/do.mp3" },
  { id: 'kb02-2', label: 'RE', sound : "sons/re.mp3" },
  { id: 'kb02-3', label: 'MI', sound : "sons/mi.mp3" },
  { id: 'kb02-4', label: 'FA', sound : "sons/fa.mp3" },
  { id: 'kb02-5', label: 'SOL', sound : "sons/sol.mp3" },
  { id: 'kb02-6', label: 'LA', sound : "sons/la.mp3" },
  { id: 'kb02-7', label: 'SI', sound : "sons/si.mp3" },
];

/* ===== Musique de victoire ===== */
let victoryAudio = null;

function playVictoryMusic(){
  if (!victoryAudio){
    victoryAudio = new Audio('sons/victoire.mp3'); 
    victoryAudio.preload = 'auto';
  }
  try {
    victoryAudio.currentTime = 0;
    victoryAudio.play();
  } catch(_) {}
}

function stopVictoryMusic(){
  if (victoryAudio){
    victoryAudio.pause();
    victoryAudio.currentTime = 0;
  }
}


function resumeBgm(){
  initBgm();               
  if (bgm) bgm.play().catch(()=>{});
}


/* ====== COMBINAISON ====== */
let KB02_COMBO = ['SI','LA','SOL','MI','LA','FA','RE','MI','RE','DO','MI','RE']; 

let kb02HintReveal = 0; 

function playKb02LabelSound(label){
  const conf = KB02_BTNS.find(c => (c.label ?? '').toString() === label);
  if (conf && conf.sound) playKb02Sound(conf.sound);
}


/* État de progression/erreurs */
let kb02ComboPos = 0;  
let kb02Errors   = 0;  

/* ====== Sélection clavier  ====== */
let kb02Sel = 0; 

function getKb02Buttons(){
  return kbLayer02?.querySelectorAll('.kb-btn') ?? [];
}

function updateKb02Selected(){
  const btns = getKb02Buttons();
  if (!btns.length) return;
  btns.forEach((b, i) => {
    const selected = (i === kb02Sel);
    b.classList.toggle('kb-selected', selected);
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  btns[kb02Sel].focus?.();
}

function moveKb02(delta){
  const btns = getKb02Buttons();
  if (!btns.length) return;
  const n = btns.length;
  kb02Sel = ((kb02Sel + delta) % n + n) % n;
  updateKb02Selected();
}

function activateKb02Selected(){
  const conf = KB02_BTNS[kb02Sel];
  if (!conf) return;

  const chosenLabel = conf.label ?? `BTN ${kb02Sel+1}`;
  const expected    = KB02_COMBO[kb02ComboPos];


  if (conf.sound) playKb02Sound(conf.sound);

  if (chosenLabel === expected){
    kb02ComboPos++;
    updateKb02UI();
    if (kb02ComboPos >= KB02_COMBO.length){
      advanceKeyStep();
      removeExtraBtn02();
      playVictoryMusic(); 
      closeKeyboard02(); 
    }
  } else {
  kb02Errors++;
  kb02ComboPos = 0;

 
  const newReveal = Math.min(Math.floor(kb02Errors / 2), KB02_COMBO.length);
  if (newReveal > kb02HintReveal){
    kb02HintReveal = newReveal;
    const newLabel = KB02_COMBO[newReveal - 1];
    playKb02LabelSound(newLabel);
  }

  const panel = kbLayer02?.querySelector('.kb-panel');
  panel?.classList.add('shake');
  setTimeout(() => panel?.classList.remove('shake'), 250);

  updateKb02UI();
}

}


/* callback */
function onKb02ButtonPress(info){
  console.log('KB02 press:', info); 
}

function createKbLayer02(){
  if (kbLayer02) kbLayer02.remove();
  const cell = getActiveCell();
  if (!cell) return null;

  const anchor = cell.querySelector('.hotspots') || cell;
  const layer = document.createElement('div');
  layer.className = 'kb-layer';
  layer.tabIndex = -1;

  const panel = document.createElement('div');
  panel.className = 'kb-panel';

  const title = document.createElement('div');
  title.className = 'kb-title';
  title.textContent = 'Trouver la bonne combinaison !';
  panel.appendChild(title);

  /*statut + indice */
  const status = document.createElement('div');
  status.className = 'kb-status';
  panel.appendChild(status);

  const hint = document.createElement('div');
  hint.className = 'kb-hint';
  panel.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'kb-list';

  KB02_BTNS.forEach((conf, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kb-btn';
    if (conf.id) b.id = conf.id;
    b.textContent = conf.label ?? `BTN ${i+1}`;

    list.appendChild(b);
  });
  panel.appendChild(list);

  layer.appendChild(panel);
  anchor.appendChild(layer);
  return layer;
}


function openKeyboard02(){
  if (kbActive) return;
  stopBgm();
  kbLayer02 = createKbLayer02();
  kbActive = !!kbLayer02;
  dir = 0;

  kb02Sel = 0;
  kb02ComboPos = 0;
  kb02Errors = 0;
  kb02HintReveal = 0;    
  updateKb02Selected();
  updateKb02UI();       
}




function closeKeyboard02(){
  kbLayer02?.remove();
  kbLayer02 = null;
  kbActive = false;
}


/* ======== EXTRA BTN ancré ======== */
const EXTRA_BTNS = {
  "1,1": [
    { id: "btn-11", label: "?", mode: "percent", left: 50, top: 60, pctWidth: 7 }
  ],
  "0,0": [
    { id: "btn-00", label: "?", mode: "percent", left: 35, top: 60, pctWidth: 7 }
  ],
  "0,2": [
    { id: "btn-02", label: "?", mode: "percent", left: 50, top: 62, pctWidth: 7 }
  ],
    "2,1": [
    {
      id: "btn-21-explore",
      label: "retourner vers l'exploration",
      mode: "percent",
      left: 25,     
      top:  69,     
      pctWidth: 36  
    }
  ]
};
/* ====== EXTRA BTN (2,1)  ====== */
function getExtraBtn21(){
  const cell = cells.find(c => +c.dataset.x === 2 && +c.dataset.y === 1);
  return cell?.querySelector('#btn-21-explore') || null;
}
function updateExtraBtn21ReadyState(){
  const btn = getExtraBtn21();
  if (!btn) return;
  if (isGameActive() || coordX !== 2 || coordY !== 1 || btn.classList.contains('hidden')){
    btn.classList.remove('extra-ready');
    return;
  }
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  if (rectsOverlap(p, b)) btn.classList.add('extra-ready');
  else                    btn.classList.remove('extra-ready');
}
function isOverExtraBtn21(){
  if (coordX !== 2 || coordY !== 1) return false;
  const btn = getExtraBtn21();
  if (!btn || !player) return false;
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  return rectsOverlap(p, b);
}

/* Helpers extrabtn */
function getExtraBtn11(){
  const cell = cells.find(c => +c.dataset.x === 1 && +c.dataset.y === 1);
  return cell?.querySelector('#btn-11') || null;
}
function hideExtraBtn11(){ getExtraBtn11()?.classList.add('hidden'); }
function showExtraBtn11(){ getExtraBtn11()?.classList.remove('hidden'); }
function removeExtraBtn11(){ getExtraBtn11()?.remove(); }
function updateExtraBtnReadyState(){
  const btn = getExtraBtn11();
  if (!btn) return;
  if (isGameActive() || coordX !== 1 || coordY !== 1 || btn.classList.contains('hidden')){
    btn.classList.remove('extra-ready');
    return;
  }
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  if (rectsOverlap(p, b)) btn.classList.add('extra-ready');
  else                    btn.classList.remove('extra-ready');
}

// Helpers extrabtn (0,0)
function getExtraBtn00(){
  const cell = cells.find(c => +c.dataset.x === 0 && +c.dataset.y === 0);
  return cell?.querySelector('#btn-00') || null;
}
function hideExtraBtn00(){ getExtraBtn00()?.classList.add('hidden'); }
function showExtraBtn00(){ getExtraBtn00()?.classList.remove('hidden'); }
function removeExtraBtn00(){ getExtraBtn00()?.remove(); }

function updateExtraBtn00ReadyState(){
  const btn = getExtraBtn00();
  if (!btn) return;
  if (isGameActive() || coordX !== 0 || coordY !== 0 || btn.classList.contains('hidden')){
    btn.classList.remove('extra-ready');
    return;
  }
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  if (rectsOverlap(p, b)) btn.classList.add('extra-ready');
  else                    btn.classList.remove('extra-ready');
}

// Helpers extrabtn (0,2)
function getExtraBtn02(){
  const cell = cells.find(c => +c.dataset.x === 0 && +c.dataset.y === 2);
  return cell?.querySelector('#btn-02') || null;
}
function hideExtraBtn02(){ getExtraBtn02()?.classList.add('hidden'); }
function showExtraBtn02(){ getExtraBtn02()?.classList.remove('hidden'); }
function removeExtraBtn02(){ getExtraBtn02()?.remove(); }

function updateExtraBtn02ReadyState(){
  const btn = getExtraBtn02();
  if (!btn) return;
  if (isGameActive() || coordX !== 0 || coordY !== 2 || btn.classList.contains('hidden')){
    btn.classList.remove('extra-ready');
    return;
  }
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  if (rectsOverlap(p, b)) btn.classList.add('extra-ready');
  else                    btn.classList.remove('extra-ready');
}

function renderKb02Progress(){
  const el = kbLayer02?.querySelector('.kb-status');
  if (!el) return;
  const parts = KB02_COMBO.map((lab, i) =>
    i < kb02ComboPos ? `<span class="ok">${lab}</span>` : `<span class="todo">_</span>`
  );
  el.innerHTML = `Progression : ${parts.join(' ')} <span class="err">• Erreurs : ${kb02Errors}</span>`;
}
function renderKb02Hint(){
  const el = kbLayer02?.querySelector('.kb-hint');
  if (!el) return;
  const reveal = kb02HintReveal; 
  if (reveal <= 0){ el.textContent = ''; return; }
  const s = KB02_COMBO
    .map((lab, i) => i < reveal ? `<b>${lab}</b>` : '•')
    .join(' ');
  el.innerHTML = `Indice : ${s}`;
}

function updateKb02UI(){
  renderKb02Progress();
  renderKb02Hint();
}


function isOverExtraBtn02(){
  if (coordX !== 0 || coordY !== 2) return false;
  const cell = getActiveCell();
  if (!cell || !player) return false;
  const btn = cell.querySelector('#btn-02');
  if (!btn) return false;
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  return rectsOverlap(p, b);
}
/* ====== Audio KB02 ====== */
const kb02AudioCache = new Map();

function playKb02Sound(url){
  if (!url) return;


  let base = kb02AudioCache.get(url);
  if (!base){
    base = new Audio(url);
    base.preload = 'auto';
    kb02AudioCache.set(url, base);
  }


  const player = (base.paused || base.ended) ? base : new Audio(url);
  try {
    player.currentTime = 0;
    player.play();
  } catch(_) {

  }
}

/* Beffroi -> Beffroi2  */
function upgradeBeffroiOnWin(){
  const cell = cells.find(c => +c.dataset.x === 1 && +c.dataset.y === 1);
  if (!cell) return;
  const img = cell.querySelector('.cell-bg');
  if (!img) return;
  if (img.dataset.upgraded === '1') return;
  img.src = 'img/Beffroi2.png';
  img.dataset.upgraded = '1';
  if (!img.complete || img.naturalWidth === 0){
    img.addEventListener('load', () => { positionHotspotsInsideBg(cell); }, { once:true });
  } else {
    positionHotspotsInsideBg(cell);
  }
}
function upgradeGareOnWin(){
  const cell = cells.find(c => +c.dataset.x === 0 && +c.dataset.y === 0);
  if (!cell) return;
  const img = cell.querySelector('.cell-bg');
  if (!img) return;
  if (img.dataset.upgradedGare === '1') return;
  img.src = 'img/Gare2.png';
  img.dataset.upgradedGare = '1';
  if (!img.complete || img.naturalWidth === 0){
    img.addEventListener('load', () => { positionHotspotsInsideBg(cell); }, { once:true });
  } else {
    positionHotspotsInsideBg(cell);
  }
}
function ensureBornesOnCell(cell){
  if (!cell) return;
  let anchor = cell.querySelector('.hotspots');
  if (!anchor){
    anchor = document.createElement('div');
    anchor.className = 'hotspots';
    cell.appendChild(anchor);
    positionHotspotsInsideBg(cell);
  }
  anchor.querySelectorAll('.borne').forEach(b => b.remove());

  const k = `${cell.dataset.x},${cell.dataset.y}`;
  const conf = BORNES_BY_CELL[k];
  if (!conf) return;

  if (conf.left){
    const bL = document.createElement('div');
    bL.className = 'borne borne-left';
    anchor.appendChild(bL);
    applyBorneSize(bL, conf.left);
  }
  if (conf.right){
    const bR = document.createElement('div');
    bR.className = 'borne borne-right';
    anchor.appendChild(bR);
    applyBorneSize(bR, conf.right);
  }
}

function applyBorneSize(el, confSide){
  if (confSide && typeof confSide === "object" && confSide.w != null){
    const v = (typeof confSide.w === "number") ? confSide.w + "%" : String(confSide.w);
    el.style.setProperty("--w", v);
  }
}

function getActiveBornes(){
  const cell = getActiveCell();
  if (!cell) return { left: null, right: null };
  return {
    left: cell.querySelector('.borne-left'),
    right: cell.querySelector('.borne-right')
  };
}

/* ====== MINI-JEU ====== */
function isOverExtraBtn11(){
  if (coordX !== 1 || coordY !== 1) return false;
  const cell = getActiveCell();
  if (!cell || !player) return false;
  const btn = cell.querySelector('#btn-11');
  if (!btn) return false;
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  return rectsOverlap(p, b);
}

/* ====== EXTRA BTN (0,0)  ====== */
function isOverExtraBtn00(){
  if (coordX !== 0 || coordY !== 0) return false;
  const cell = getActiveCell();
  if (!cell || !player) return false;
  const btn = cell.querySelector('#btn-00');
  if (!btn) return false;
  const p = player.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  return rectsOverlap(p, b);
}

/* ====== LAYER commun ====== */
function createMgLayer(){
  if (mgLayer) mgLayer.remove();
  const cell = getActiveCell();
  if (!cell) return null;
  const anchor = cell.querySelector('.hotspots') || cell;
  const layer = document.createElement('div');
  layer.className = 'mg-layer';

  const hud = document.createElement('div');
  hud.className = 'mg-hud';
  hud.textContent = `${Math.ceil(MG_DURATION_MS/1000)} — Vies: ${MG_MAX_HITS}`;
  layer.appendChild(hud);

  anchor.appendChild(layer);
  mgHud = hud;
  return layer;
}

/* ====== LAYER particules ====== */
function createPartLayer(){
  if (partLayer) partLayer.remove();
  const cell = getActiveCell();
  if (!cell) return null;
  const anchor = cell.querySelector('.hotspots') || cell;

  const layer = document.createElement('div');
  layer.className = 'part-layer';

  const hud = document.createElement('div');
  hud.className = 'mg-hud'; 
  layer.appendChild(hud);

  const hint = document.createElement('div');
  hint.className = 'part-hint';
  hint.textContent = '← / → pour choisir — Entrée pour pivoter de 90°';
  layer.appendChild(hint);

  anchor.appendChild(layer);
  partHud = hud;
  return layer;
}

/* ====== MINI-JEU PARTICULES ====== */
function norm360(v){
  v = Number.isFinite(v) ? v : 0;
  return ((v % 360) + 360) % 360;
}
function getRotDeg(el){
  const raw = el.style.getPropertyValue('--rot') || '0deg';
  const m = raw.match(/-?\d+(\.\d+)?/);
  return norm360(m ? parseFloat(m[0]) : 0);
}
function setRotDeg(el, deg){
  el.style.setProperty('--rot', norm360(deg) + 'deg');
}
function getTargetDeg(el){
  return norm360(parseFloat(el.dataset.target ?? '0'));
}
function matchesTarget(el){
  return getRotDeg(el) === getTargetDeg(el);
}

function updatePartHud(){
  if (!partHud) return;
  const rest = partList.reduce((acc, el) => acc + (matchesTarget(el) ? 0 : 1), 0);
  const sel = partList[partSelectedIndex];
  if (!sel){
    partHud.textContent = (rest === 0) ? '✔️ Terminé' : `${rest} à aligner`;
    return;
  }
  const cur = getRotDeg(sel);
  const tgt = getTargetDeg(sel);
  partHud.textContent = (rest === 0)
    ? '✔️ Terminé'
    : `${rest} à aligner — sélection: ${cur}° → ${tgt}°`;
}

function clearPartSelection(){
  partList.forEach(el => el.classList.remove('part-selected'));
}
function setPartSelection(i){
  if (!partList.length) return;
  partSelectedIndex = (i + partList.length) % partList.length;
  clearPartSelection();
  partList[partSelectedIndex].classList.add('part-selected');
  updatePartHud();
}
function partNext(){ setPartSelection(partSelectedIndex + 1); }
function partPrev(){ setPartSelection(partSelectedIndex - 1); }

function partRotate(){
  const el = partList[partSelectedIndex];
  if (!el) return;
  setRotDeg(el, getRotDeg(el) + 90);
  updatePartHud();
  if (partList.every(matchesTarget)){
    endParticlesGame(true);
  }
}

function startParticlesGame(){
  if (partGameActive) return;
  if (!isOverExtraBtn00()) return;
  partGameActive = true;
  dir = 0;
  lockSide = null;
  exitSelectionMode();
  hideExtraBtn00();
  getExtraBtn00()?.classList.remove('extra-ready');
  partLayer = createPartLayer();
  const cell = getActiveCell();
  partList = [...cell.querySelectorAll('.particules')];
  partList.forEach(el => {
    if (!el.style.getPropertyValue('--rot')) el.style.setProperty('--rot', '0deg');
  });
  setPartSelection(0);
  updatePartHud();
}

function endParticlesGame(won){
  if (!partGameActive) return;
  partGameActive = false;
  clearPartSelection();
  partLayer?.remove(); partLayer = null;
  partHud = null;

  if (won){
    advanceKeyStep();
    upgradeGareOnWin();
    removeExtraBtn00();
  } else {
    showExtraBtn00();
    updateExtraBtn00ReadyState();
  }
}

/* ====== MINI-JEU briques ====== */
function spawnBrick(){
  if (!mgLayer) return;
  const rect = mgLayer.getBoundingClientRect();
  const el = document.createElement('img');
  el.className = 'mg-brick';
  el.src = 'img/brique.png';
  el.alt = '';
  el.draggable = false;

  const w = clamp(22, 40, rect.width * 0.04);
  el.style.width = w + 'px';
  const maxX = rect.width - w;
  const x = Math.random() * maxX;
  el.style.left = x + 'px';
  el.style.top = (-w - 4) + 'px';
  el.dataset.y = String(-w - 4);
  el.dataset.v = String(MG_MIN_SPEED + Math.random() * (MG_MAX_SPEED - MG_MIN_SPEED));
  mgLayer.appendChild(el);
  MG_BRICKS.add(el);
}

function updateMiniGame(dt){
  if (!miniGameActive || !mgLayer) return;

  const leftMs = Math.max(0, mgEndAt - performance.now());
  if (mgHud) mgHud.textContent = `${Math.ceil(leftMs / 1000)} — Vies: ${Math.max(0, MG_MAX_HITS - mgHits)}`;

  mgSpawnTimer += dt * 1000;
  while (mgSpawnTimer >= MG_SPAWN_EVERY){
    spawnBrick();
    mgSpawnTimer -= MG_SPAWN_EVERY;
  }

  const pRect = player.getBoundingClientRect();
  const toDelete = [];
  MG_BRICKS.forEach(brick => {
    const v = parseFloat(brick.dataset.v || '180');
    let y = parseFloat(brick.dataset.y || '-40');
    y += v * dt;
    brick.dataset.y = String(y);
    brick.style.top = `${y}px`;

    const r = brick.getBoundingClientRect();

    if (r.top > (mgLayer.getBoundingClientRect().bottom + 80)){
      toDelete.push(brick);
      return;
    }

    if (rectsOverlap(pRect, r)){
      mgHits++;
      toDelete.push(brick);
    }
  });

  toDelete.forEach(el => { MG_BRICKS.delete(el); el.remove(); });

  if (mgHits >= MG_MAX_HITS){
    endMiniGame(false); 
    return;
  }
  if (leftMs <= 0){
    endMiniGame(true); 
  }
}

function startMiniGame(){
  if (miniGameActive) return;
  miniGameActive = true;

  lockSide = null;
  exitSelectionMode();
  dir = 0;

  mgHits = 0;
  mgLayer = createMgLayer();
  mgSpawnTimer = 0;
  MG_BRICKS.forEach(el => el.remove());
  MG_BRICKS.clear();
  mgEndAt = performance.now() + MG_DURATION_MS;

  hideExtraBtn11();
  getExtraBtn11()?.classList.remove('extra-ready');

  if (mgLayer){
    mgStartMsg = document.createElement('div');
    mgStartMsg.className = 'mg-start';
    mgStartMsg.textContent = 'Esquive les briques pour réparer le Beffroi';
    mgLayer.appendChild(mgStartMsg);
    setTimeout(() => { if (mgStartMsg){ mgStartMsg.classList.add('hide'); } }, 1600);
    setTimeout(() => { mgStartMsg?.remove(); mgStartMsg = null; }, 2000);
  }

  let last = performance.now();
  const loop = (now) => {
    if (!miniGameActive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateMiniGame(dt);
    mgRAF = requestAnimationFrame(loop);
  };
  mgRAF = requestAnimationFrame(loop);
}

function endMiniGame(won){
  if (!miniGameActive) return;
  miniGameActive = false;

  cancelAnimationFrame(mgRAF);
  mgRAF = 0;

  MG_BRICKS.forEach(el => el.remove());
  MG_BRICKS.clear();
  mgStartMsg?.remove(); mgStartMsg = null;
  mgLayer?.remove();
  mgLayer = null;
  mgHud = null;

  if (won){
    advanceKeyStep();
    upgradeBeffroiOnWin();
    removeExtraBtn11();
  } else {
    showExtraBtn11();
    updateExtraBtnReadyState();
  }
}

/* ======== Boucle principale ======== */
let last = performance.now();
function tick(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (dir !== 0){
    const blocked =
      (lockSide === 'left'  && dir === -1) ||
      (lockSide === 'right' && dir ===  1);

    if (!blocked){
      playerX += dir * PLAYER_SPEED * dt;
      playerX = clamp(minX, maxX, playerX);
      applyPlayerStyle();
      updatePlayerRatioFromX();
    }
  }

  if (!isGameActive() && lockSide === null){
    const { left: bLeft, right: bRight } = getActiveBornes();
    if (player && (bLeft || bRight)){
      const pRect = player.getBoundingClientRect();
      if (bLeft){
        const lRect = bLeft.getBoundingClientRect();
        if (rectsOverlap(pRect, lRect)){
          lockSide = 'left'; dir = 0;
          if (!selectionActive) enterSelectionMode('left');
        }
      }
      if (bRight){
        const rRect = bRight.getBoundingClientRect();
        if (rectsOverlap(pRect, rRect)){
          lockSide = 'right'; dir = 0;
          if (!selectionActive) enterSelectionMode('right');
        }
      }
    }
  }

  checkKeyPickup();
  updateExtraBtnReadyState();
  updateExtraBtn00ReadyState();
  updateExtraBtn02ReadyState();
  updateExtraBtn21ReadyState();
  requestAnimationFrame(tick);
}

function injectRotateLock(){
  const lock = document.createElement('div');
  lock.className = 'rotate-lock';
  lock.innerHTML = '<div class="msg">Tourne ton appareil en mode paysage pour jouer 🙂</div>';
  document.body.appendChild(lock);
}
injectRotateLock();

/* ========= Init ========= */
function init(){
  document.querySelectorAll('.js-cell').forEach(ensureBornesOnCell);
  updateCell(coordX, coordY);
  requestAnimationFrame(tick);
}
init();

/* ========= PATCH spawn (2,2) ========= */
(function ensureSpawn22(){
  const TARGET = { x: 2, y: 2 };
  function ensureActiveCell(){
    document.querySelectorAll('.js-cell.active').forEach(el => el.classList.remove('active'));
    const target = [...document.querySelectorAll('.js-cell')].find(
      c => +c.dataset.x === TARGET.x && +c.dataset.y === TARGET.y
    );
    if (target) target.classList.add('active');
  }
  function go(){
    if (window.gsap) gsap.killTweensOf('.js-grid');
    ensureActiveCell();
    coordX = TARGET.x;
    coordY = TARGET.y;
    updateCell(coordX, coordY);
  }
  window.addEventListener('load', () => {
    requestAnimationFrame(() => {
      go();
      requestAnimationFrame(go);
    });
  });
  document.getElementById('start-overlay-btn')?.addEventListener('click', () => {
    setTimeout(go, 0);
    requestAnimationFrame(go);
  });
})();

/* ====== SYSTÈME DE CLÉ ====== */
let keyStep = 0;
const imagesCycle = [
  'img cle/cle0.png',
  'img cle/cle1.png',
  'img cle/cle2.png',
  'img cle/cle3.png',
  'img cle/cle4.png',
  'img cle/cle5.png',
  'img cle/cle6.png',
  'img cle/cle7.png'
];
const keyButtonSrc = 'img cle/cle7.png';

const KEY_BTN_CELLS = new Set([
  "3,3","4,2","1,3","3,4"
]);

const KEY_BTN_BY_CELL = {
  "3,3": { mode: "percent", left: 70, top: 68, pctWidth: 5 },
  "4,2": { mode: "percent", left: 80, top: 68, pctWidth: 5 },
  "1,3": { mode: "percent", left: 12, top: 68, pctWidth: 5 },
  "3,4": { mode: "percent", left: 82, top: 68, pctWidth: 5 },
};

/* === GIFS === */
const GIF_BY_CELL = {
  "2,2": { src: 'gif/cloud.gif', mode: 'percent', left: 70, top: 5, pctWidth: 18 },
  "0,0": { src: 'gif/cloud.gif', mode: 'percent', left: 10, top: -10, pctWidth: 30 },
  "2,1": [
    { src: 'img/cage ouverte.png', mode: 'percent', left: 65, top: 58, pctWidth: 18 },
    { src: 'img/escargot 2.png',   mode: 'percent', left: 60, top: 63, pctWidth: 10 }
  ]
};

/* === TEXTES === */
const TEXT_BY_CELL = {
  "2,1": [
    { 
      text: "Félicition vous avez libéré votre ami !",
      mode: "percent",
      left: 40,          
      top:  22,
      pctWidth: 25,      
      fontRatio: 0.18,   
      align: "center"    
    }
  ]
};


const PARTICLES_BY_CELL = {
  "0,0": [
    { mode: "percent", left: 31.25, top: 45,   pctWidth: 3, rotate: 270, target: 0   },
    { mode: "percent", left: 29.75, top: 52,   pctWidth: 3, rotate: 90,  target: 0  },
    { mode: "percent", left: 30.6,  top: 62.8, pctWidth: 3, rotate: 0,   target: 180 },
    { mode: "percent", left: 37,    top: 62.8, pctWidth: 3, rotate: 270, target: 90 },
    { mode: "percent", left: 38,    top: 59.2, pctWidth: 3, rotate: 90,  target: 270   },
    { mode: "percent", left: 32.2,  top: 50.5, pctWidth: 3, rotate: 0,   target: 180   },
    { mode: "percent", left: 35,    top: 58,   pctWidth: 3, rotate: 270, target: 90  },
    { mode: "percent", left: 36,    top: 45,   pctWidth: 3, rotate: 90,  target: 270 }
  ]
};

imagesCycle.forEach(src => { const i = new Image(); i.src = src; });
const ALL_CELLS = [...document.querySelectorAll('.js-cell')];

function positionInsideBg(cell, el, opt = {}){
  const bg = cell.querySelector('.cell-bg');
  if(!bg) return;

  const r = getContainedRect(cell, bg);
  const pctWidth = opt.pctWidth ?? 10;
  const w = r.width * (pctWidth / 100);
  el.style.width = w + 'px';

  const rectNow = el.getBoundingClientRect();
  const h = rectNow.height || w;

  if (opt.mode === 'percent' && typeof opt.left === 'number' && typeof opt.top === 'number'){
    let left = r.left + (r.width  * (opt.left / 100));
    let top  = r.top  + (r.height * (opt.top  / 100));
    left = clamp(r.left,  r.right  - w, left);
    top  = clamp(r.top,   r.bottom - h, top);
    el.style.left = left + 'px';
    el.style.top  = top  + 'px';
    return;
  }

  const corner = opt.corner || 'bottom-left';
  const margin = (typeof opt.margin === 'number') ? opt.margin : 12;

  let left = r.right - w - margin;
  let top  = r.top + margin;

  if (corner === 'top-left')    { left = r.left + margin;           top = r.top + margin; }
  if (corner === 'bottom-left') { left = r.left + margin;           top = r.bottom - h - margin; }
  if (corner === 'bottom-right'){ left = r.right - w - margin;      top = r.bottom - h - margin; }
  if (corner === 'top-right')   { left = r.right - w - margin;      top = r.top + margin; }

  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}


ALL_CELLS.forEach(cell => {
  const overlay = document.createElement('img');
  overlay.className = 'cycle-img';
  overlay.src = imagesCycle[keyStep];
  overlay.decoding = 'async';
  overlay.draggable = false;
  cell.appendChild(overlay);

  const k = `${cell.dataset.x},${cell.dataset.y}`;
  if (KEY_BTN_CELLS.has(k)){
    const btn = document.createElement('img');
    btn.className = 'batiment-btn';
    btn.src = keyButtonSrc;
    btn.alt = '';
    btn.decoding = 'async';
    btn.draggable = false;
    cell.appendChild(btn);
  }

   const gifConf = GIF_BY_CELL[k];
  const gifList = Array.isArray(gifConf) ? gifConf : (gifConf ? [gifConf] : []);
  gifList.forEach((conf, i) => {
    const gif = document.createElement('img');
    gif.className = 'gif-anim';
    gif.dataset.gifIndex = String(i);
    gif.src = conf.src;
    gif.alt = '';
    gif.decoding = 'async';
    gif.draggable = false;
    cell.appendChild(gif);
  });


  const extraList = EXTRA_BTNS[k];
  if (extraList && extraList.length){
    extraList.forEach((conf, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'extra-btn';
      b.textContent = conf.label || 'BTN';
      b.dataset.extraIndex = String(i);
      if (conf.id) b.id = conf.id;
      cell.appendChild(b);
    });
  }

  const textList = TEXT_BY_CELL[k];
  if (textList && textList.length){
    textList.forEach((conf, i) => {
      const t = document.createElement('div');
      t.className = 'txt-anchored';
      t.dataset.txtIndex = String(i);
      t.textContent = conf.text ?? '';
      if (conf.align) t.style.textAlign = conf.align;
      cell.appendChild(t);
    });
  }

  ensureBornesOnCell(cell);
});

function repositionAllKeys(){
  document.querySelectorAll('.js-cell').forEach(cell => {
    const k = `${cell.dataset.x},${cell.dataset.y}`;

    const keyImg = cell.querySelector('.cycle-img');
    if (keyImg) positionInsideBg(cell, keyImg, { mode: 'corner', corner: 'top-right', pctWidth: 10, margin: 12 });

    const keyBtn = cell.querySelector('.batiment-btn');
    if (keyBtn){
      const conf = KEY_BTN_BY_CELL[k] || { mode: 'corner', corner: 'bottom-left', pctWidth: 5, margin: 12 };
      positionInsideBg(cell, keyBtn, conf);
    }

    const gifConf = GIF_BY_CELL[k];
    const gifList = Array.isArray(gifConf) ? gifConf : (gifConf ? [gifConf] : []);
    const gifs = cell.querySelectorAll('.gif-anim');
    gifList.forEach((conf, i) => {
      const el = gifs[i];
      if (el) positionInsideBg(cell, el, conf);
    });

    const tConfs = TEXT_BY_CELL[k] || [];
    const tEls = cell.querySelectorAll('.txt-anchored');
    tConfs.forEach((conf, i) => {
      const el = tEls[i];
      if (!el) return;
      positionInsideBg(cell, el, conf);
      const w = el.getBoundingClientRect().width || 0;
      const ratio = (typeof conf.fontRatio === 'number') ? conf.fontRatio : 0.18;
      el.style.fontSize = Math.max(10, w * ratio) + 'px';
    });

    const extraList = EXTRA_BTNS[k];
    if (extraList && extraList.length){
      extraList.forEach((conf, i) => {
        const el = cell.querySelector(`.extra-btn[data-extra-index="${i}"]`);
        if (el) positionInsideBg(cell, el, conf);
      });
    }
  });
}

function repositionAllParticles(){
  document.querySelectorAll('.js-cell').forEach(cell => {
    const k = `${cell.dataset.x},${cell.dataset.y}`;
    const confs = PARTICLES_BY_CELL[k] || [];
    const parts = [...cell.querySelectorAll('.particules')];

    parts.forEach((el, i) => {
      const conf = confs[i] || {
        mode: "percent",
        left: 50 + (i - (parts.length - 1)/2) * 6,
        top:  80 + (i % 2) * 4,
        pctWidth: 2.6,
        rotate: 0,
        target: 0             
      };

      positionInsideBg(cell, el, conf);
      el.style.setProperty('--rot', (conf.rotate || 0) + 'deg');
      el.dataset.target = String(conf.target ?? 0);
    });
  });
}

document.querySelectorAll('.cell-bg').forEach(bg => {
  if (!bg.complete || bg.naturalWidth === 0){
    bg.addEventListener('load', repositionAllKeys,       { once: true });
    bg.addEventListener('load', repositionPlayer,        { once: true });
    bg.addEventListener('load', repositionAllHotspots,   { once: true });
  }
});
document.querySelectorAll('.cell-bg').forEach(bg => {
  if (!bg.complete || bg.naturalWidth === 0){
    bg.addEventListener('load', repositionAllParticles, { once: true });
  }
});

window.addEventListener('resize', () => {
  repositionAllParticles();
});
window.addEventListener('orientationchange', () => {
  repositionAllParticles();
});

window.addEventListener('resize', () => {
  repositionAllKeys();
  repositionPlayer();
  repositionAllHotspots();
});
window.addEventListener('orientationchange', () => {
  repositionAllKeys();
  repositionPlayer();
  repositionAllHotspots();
});

window.addEventListener('load', tryPlayBgm);

document.addEventListener('click', (e) => {
  const btn02 = e.target.closest('#btn-02');
  if (btn02) stopBgm();
});


repositionAllKeys();
repositionPlayer();
repositionAllHotspots();
repositionAllParticles();


/*------------- Didacticiel -------------*/
(function(){
  const layer   = document.getElementById('tutorial-layer');
  if(!layer) return;
  const overlay = layer.querySelector('#overlay');
  const b1 = layer.querySelector('#bubble1');
  const b2 = layer.querySelector('#bubble2');
  const b3 = layer.querySelector('#bubble3');

  let step = 'overlay';
  let active = true;

  const show = el => el.classList.remove('hidden');
  const hide = el => el.classList.add('hidden');

  function endTutorial(){
    active = false;
    document.removeEventListener('keydown', onKeyDown, true);
    layer.remove();
  }

  function onKeyDown(e){
    if(!active) return;

    const keys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'];
    if(keys.includes(e.key)){
      e.preventDefault();
      e.stopPropagation();
    }

    if(step === 'overlay' && (e.key==='Enter')){
      overlay.classList.add('fade-out');
      overlay.addEventListener('transitionend', () => overlay.remove(), {once:true});
      step='bubble1'; show(b1); return;
    }
    if(step === 'bubble1' && (e.key==='ArrowLeft' || e.key==='ArrowRight')){
      hide(b1); step='bubble3'; show(b3); return;
    }
    if(step === 'bubble3' && (e.key==='Enter')){
      hide(b3); step='bubble2'; show(b2); return;
    }
    if(step === 'bubble2' && (e.key==='Enter')){
      hide(b2); endTutorial(); return;
    }
  }

  document.addEventListener('keydown', onKeyDown, true);
})();

/*------------- Accordéon player -------*/
(function(){
  const player = document.getElementById('player');
  if(!player) return;

  let flip = 1;
  let holdLeft = false;
  let holdRight = false;
  let moving = false;
  let raf = 0;
  let startTime = 0;

  const originalTransition = player.style.transition;

  function frame(ts){
    if(!moving){
      player.style.transform = `translate(-50%, -100%) scaleX(${flip})`;
      return;
    }
    if(!startTime) startTime = ts;

    const t = (ts - startTime) / 500;
    const amp = 0.10;
    const s = Math.sin(t * Math.PI * 2) * amp;
    const sx = 1 + s;
    const sy = 1 - s;

    player.style.transform = `translate(-50%, -100%) scaleX(${flip}) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    raf = requestAnimationFrame(frame);
  }

  function start(){
    if(moving) return;
    moving = true;
    startTime = 0;
    player.style.transition = 'none';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function stop(){
    if(holdLeft || holdRight) return;
    moving = false;
    startTime = 0;
    cancelAnimationFrame(raf);
    player.style.transform = `translate(-50%, -100%) scaleX(${flip})`;
    player.style.transition = originalTransition || 'transform 120ms linear';
  }

  function onKeyDown(e){
    if(e.key === 'ArrowRight'){ holdRight = true; flip = 1; start(); }
    else if(e.key === 'ArrowLeft'){ holdLeft = true;  flip = -1; start(); }
  }
  function onKeyUp(e){
    if(e.key === 'ArrowRight'){ holdRight = false; stop(); }
    else if(e.key === 'ArrowLeft'){ holdLeft = false; stop(); }
  }

  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);
})();


/**
 * BlindSector — Lógica principal del juego
 *
 * Ciclo de vida (según blindsector-game-lifecycle.puml):
 *   1. Al cargar: getLastSnapshot para reconectar.
 *   2. Fase MOVE: el jugador selecciona destino en el tablero.
 *   3. Fase ATTACK: el jugador selecciona celda de ataque.
 *   4. Submit: POST /api/turn/submit.
 *      - Si waiting=true → polling hasta recibir SnapshotDTO.
 *      - Si SnapshotDTO → actualizar UI.
 *   5. Si status=FINISHED → mostrar overlay de fin.
 */

import { pollState, getLastSnapshot, submitTurn } from './api.js';
import { Board } from './board.js';

// ---- Parámetros de URL ----
const urlParams  = new URLSearchParams(window.location.search);
const GAME_ID    = urlParams.get('gameId');
const PLAYER_ID  = urlParams.get('playerId');

if (!GAME_ID || !PLAYER_ID) {
    alert('Faltan parámetros gameId / playerId en la URL.');
}

// ---- Estado ----
let snapshot    = null;
let phase       = 'move';     // 'move' | 'attack'
let pollTimer   = null;
const POLL_MS   = 2000;

// ---- Selectores DOM ----
const elTurnNum       = document.getElementById('turn-number');
const elStatusTag     = document.getElementById('status-tag');
const elMyHp          = document.getElementById('my-hp');
const elMyHpFill      = document.getElementById('my-hp-fill');
const elMyRegion      = document.getElementById('my-region');
const elEnemyRegion   = document.getElementById('enemy-region');
const elHitOnMe       = document.getElementById('hit-on-me');
const elDmgReceived   = document.getElementById('dmg-received');
const elHitOnEnemy    = document.getElementById('hit-on-enemy');
const elPhaseText     = document.getElementById('phase-text');
const elMoveVal       = document.getElementById('move-val');
const elAttackVal     = document.getElementById('attack-val');
const elBtnSubmit     = document.getElementById('btn-submit');
const elBtnReset      = document.getElementById('btn-reset');
const elTabMove       = document.getElementById('tab-move');
const elTabAttack     = document.getElementById('tab-attack');
const elWaitingOverlay  = document.getElementById('waiting-overlay');
const elEndgameOverlay  = document.getElementById('endgame-overlay');
const elEndgameResult   = document.getElementById('endgame-result');
const elEndgameSubtitle = document.getElementById('endgame-subtitle');
const elTurnLog         = document.getElementById('turn-log');

// ---- Tablero ----
const board = new Board('board', onCellClick);

// ---- Selecciones actuales ----
let selectedMove   = null;  // { col, row }
let selectedAttack = null;  // { col, row }

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

async function init() {
    try {
        const data = await getLastSnapshot(GAME_ID, PLAYER_ID);

        if (data.status === 'WAITING' || data.turn === 0) {
            // Partida iniciada pero aún sin turno resuelto
            setPhaseUI('move');
            logTurn('Partida iniciada. Esperando...', 'info');
            startPolling();
            return;
        }

        snapshot = data;
        updateUI(snapshot);

        if (snapshot.status === 'FINISHED') {
            showEndgame(snapshot);
            return;
        }

        setPhaseUI('move');

    } catch (err) {
        logTurn(`Error de reconexión: ${err.message}`, 'hit');
    }
}

// ====================================================================
// TABLERO — click en celda
// ====================================================================

function onCellClick(col, row, currentPhase) {
    if (snapshot && snapshot.status === 'FINISHED') return;

    if (currentPhase === 'move') {
        selectedMove = { col, row };
        board.selectMove(col, row, snapshot);
        if (elMoveVal) elMoveVal.textContent = `(${col}, ${row})`;
        setPhaseUI('attack');

    } else if (currentPhase === 'attack') {
        selectedAttack = { col, row };
        board.selectAttack(col, row, snapshot);
        if (elAttackVal) elAttackVal.textContent = `(${col}, ${row})`;
    }
}

// ====================================================================
// FASE UI
// ====================================================================

function setPhaseUI(newPhase) {
    phase = newPhase;
    board.setPhase(phase);

    if (elPhaseText) elPhaseText.textContent = phase === 'move' ? 'SELECCIONAR MOVIMIENTO' : 'SELECCIONAR ATAQUE';

    if (elTabMove)   elTabMove.classList.toggle('active',   phase === 'move');
    if (elTabAttack) elTabAttack.classList.toggle('active', phase === 'attack');
}

// ====================================================================
// SUBMIT
// ====================================================================

async function handleSubmit() {
    if (!selectedMove || !selectedAttack) {
        logTurn('Selecciona movimiento Y ataque antes de enviar.', 'hit');
        return;
    }

    elBtnSubmit.disabled = true;

    try {
        const result = await submitTurn(
            GAME_ID,
            PLAYER_ID,
            snapshot?.turn ?? 1,
            selectedMove.col,
            selectedMove.row,
            selectedAttack.col,
            selectedAttack.row
        );

        if (result.waiting) {
            logTurn('Acción enviada. Esperando al rival...', 'info');
            showWaiting(true);
            startPolling();
        } else {
            // Turno resuelto directamente en la respuesta
            snapshot = result;
            updateUI(snapshot);
            showWaiting(false);
            resetSelections();

            if (snapshot.status === 'FINISHED') {
                showEndgame(snapshot);
            } else {
                setPhaseUI('move');
            }
        }

    } catch (err) {
        logTurn(`Error al enviar: ${err.message}`, 'hit');
        elBtnSubmit.disabled = false;
    }
}

// ====================================================================
// POLLING
// ====================================================================

function startPolling() {
    stopPolling();
    pollTimer = setInterval(doPoll, POLL_MS);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function doPoll() {
    try {
        const data = await pollState(GAME_ID, PLAYER_ID);

        if (data.waiting) return; // Aún no resuelto

        // Snapshot recibido
        stopPolling();
        snapshot = data;
        updateUI(snapshot);
        showWaiting(false);
        resetSelections();
        elBtnSubmit.disabled = false;

        if (snapshot.status === 'FINISHED') {
            showEndgame(snapshot);
        } else {
            setPhaseUI('move');
            logTurn(`Turno ${snapshot.turn - 1} resuelto.`, 'info');
        }

    } catch (err) {
        // Silencioso en poll: puede ser transitorio
        console.warn('Poll error:', err.message);
    }
}

// ====================================================================
// ACTUALIZAR UI
// ====================================================================

function updateUI(snap) {
    if (!snap) return;

    if (elTurnNum) elTurnNum.textContent = snap.turn ?? '—';

    if (elStatusTag) {
        elStatusTag.textContent = snap.status || '—';
        elStatusTag.className = 'tag';
        if (snap.status === 'ACTIVE')   elStatusTag.classList.add('tag-active');
        if (snap.status === 'FINISHED') elStatusTag.classList.add('tag-finished');
        if (snap.status === 'WAITING')  elStatusTag.classList.add('tag-waiting');
    }

    // HP
    const hp = snap.myHp ?? 100;
    if (elMyHp) elMyHp.textContent = `${hp} HP`;
    if (elMyHpFill) {
        elMyHpFill.style.width = `${hp}%`;
        elMyHpFill.className = 'hp-fill';
        if (hp <= 25) elMyHpFill.classList.add('crit');
        else if (hp <= 50) elMyHpFill.classList.add('low');
    }

    if (elMyRegion)     elMyRegion.textContent    = snap.myRegion    || '—';
    if (elEnemyRegion)  elEnemyRegion.textContent = snap.enemyRegion || '—';
    if (elHitOnMe)      elHitOnMe.textContent     = snap.hitOnMe     || '—';
    if (elDmgReceived)  elDmgReceived.textContent = snap.damageReceived != null ? `-${snap.damageReceived} HP` : '—';
    if (elHitOnEnemy)   elHitOnEnemy.textContent  = snap.hitOnEnemy  || '—';

    // Log del turno
    if (snap.hitOnMe && snap.hitOnMe !== 'MISS') {
        logTurn(`T${snap.turn}: Recibiste ${snap.hitOnMe} — ${snap.damageReceived} HP`, 'hit');
    } else if (snap.hitOnMe === 'MISS') {
        logTurn(`T${snap.turn}: El rival falló.`, 'miss');
    }

    board.render(snap);
}

function resetSelections() {
    selectedMove   = null;
    selectedAttack = null;
    board.clearSelections();
    if (elMoveVal)   elMoveVal.textContent   = '—';
    if (elAttackVal) elAttackVal.textContent = '—';
}

// ====================================================================
// OVERLAYS
// ====================================================================

function showWaiting(visible) {
    if (elWaitingOverlay) elWaitingOverlay.classList.toggle('hidden', !visible);
}

function showEndgame(snap) {
    if (!elEndgameOverlay) return;
    elEndgameOverlay.classList.remove('hidden');

    let resultText, resultClass, subtitle;

    if (snap.winnerId === 'draw') {
        resultText  = 'EMPATE';
        resultClass = 'draw';
        subtitle    = 'Ningún jugador sobrevivió.';
    } else if (snap.winnerId === PLAYER_ID) {
        resultText  = '¡VICTORIA!';
        resultClass = 'win';
        subtitle    = 'Eliminaste a tu rival.';
    } else {
        resultText  = 'DERROTA';
        resultClass = 'loss';
        subtitle    = `Ganó: ${snap.winnerId}`;
    }

    if (elEndgameResult) {
        elEndgameResult.textContent = resultText;
        elEndgameResult.className   = `endgame-result ${resultClass}`;
    }
    if (elEndgameSubtitle) elEndgameSubtitle.textContent = subtitle;
}

// ====================================================================
// LOG
// ====================================================================

function logTurn(msg, type = '') {
    if (!elTurnLog) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = msg;
    elTurnLog.prepend(entry);
}

// ====================================================================
// EVENT LISTENERS
// ====================================================================

if (elBtnSubmit) elBtnSubmit.addEventListener('click', handleSubmit);

if (elBtnReset) {
    elBtnReset.addEventListener('click', () => {
        resetSelections();
        setPhaseUI('move');
        board.render(snapshot);
    });
}

if (elTabMove) {
    elTabMove.addEventListener('click', () => setPhaseUI('move'));
}

if (elTabAttack) {
    elTabAttack.addEventListener('click', () => setPhaseUI('attack'));
}

document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
    window.location.href = '/index.html';
});

document.getElementById('btn-play-again')?.addEventListener('click', () => {
    window.location.href = '/index.html';
});

// ====================================================================
// ARRANQUE
// ====================================================================

init();

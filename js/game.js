/**
 * BlindSector — Lógica principal del juego
 */

import { pollState, getLastSnapshot, submitTurn } from './api.js';
import { Board } from './board.js';
import {
    screenFlash,
    typewriterLog,
    pulseElement,
    shakeElement,
    rippleButton,
    hpDrop,
    glitchText,
    countUp,
} from './vfx.js';

// ---- Parámetros de URL ----
const urlParams  = new URLSearchParams(window.location.search);
const GAME_ID    = urlParams.get('gameId');
const PLAYER_ID  = urlParams.get('playerId');
const SPAWN_COL  = parseInt(urlParams.get('spawnCol'), 10);
const SPAWN_ROW  = parseInt(urlParams.get('spawnRow'), 10);

if (!GAME_ID || !PLAYER_ID) {
    alert('Faltan parámetros gameId / playerId en la URL.');
}

// ---- Estado ----
let snapshot  = null;
let phase     = 'move';
let pollTimer = null;
let _prevHp   = 100;
const POLL_MS = 2000;

// ---- Selectores DOM ----
const elTurnNum         = document.getElementById('turn-number');
const elStatusTag       = document.getElementById('status-tag');
const elMyHp            = document.getElementById('my-hp');
const elMyHpFill        = document.getElementById('my-hp-fill');
const elMyRegion        = document.getElementById('my-region');
const elEnemyRegion     = document.getElementById('enemy-region');
const elHitOnMe         = document.getElementById('hit-on-me');
const elDmgReceived     = document.getElementById('dmg-received');
const elHitOnEnemy      = document.getElementById('hit-on-enemy');
const elPhaseText       = document.getElementById('phase-text');
const elMoveVal         = document.getElementById('move-val');
const elAttackVal       = document.getElementById('attack-val');
const elBtnSubmit       = document.getElementById('btn-submit');
const elBtnReset        = document.getElementById('btn-reset');
const elTabMove         = document.getElementById('tab-move');
const elTabAttack       = document.getElementById('tab-attack');
const elWaitingOverlay  = document.getElementById('waiting-overlay');
const elEndgameOverlay  = document.getElementById('endgame-overlay');
const elEndgameResult   = document.getElementById('endgame-result');
const elEndgameSubtitle = document.getElementById('endgame-subtitle');
const elTurnLog         = document.getElementById('turn-log');
const elMyHpLabel       = elMyHp; // mismo elemento; se pasa a hpDrop

// ---- Tablero ----
const board = new Board('board', onCellClick);

// ---- Selecciones ----
let selectedMove   = null;
let selectedAttack = null;

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

async function init() {
    // Ripple en todos los botones
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', (e) => rippleButton(btn, e));
    });

    try {
        const data = await getLastSnapshot(GAME_ID, PLAYER_ID);

        if (data.status === 'WAITING' || data.turn === 0) {
            if (!isNaN(SPAWN_COL) && !isNaN(SPAWN_ROW)) {
                board.render({ myCol: SPAWN_COL, myRow: SPAWN_ROW, myHp: 100 });
            }
            setPhaseUI('move');
            _logVfx('Partida iniciada. Esperando...', 'info');
            startPolling();
            return;
        }

        snapshot = data;
        _prevHp  = snapshot.myHp ?? 100;
        updateUI(snapshot, false);

        if (snapshot.status === 'FINISHED') {
            showEndgame(snapshot);
            return;
        }

        setPhaseUI('move');

    } catch (err) {
        _logVfx(`Error de reconexión: ${err.message}`, 'hit');
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
        if (elMoveVal) {
            elMoveVal.textContent = `(${col}, ${row})`;
            elMoveVal.classList.remove('filled');
            void elMoveVal.offsetWidth; // reflow para reiniciar animación
            elMoveVal.classList.add('filled');
        }
        setPhaseUI('attack');

    } else if (currentPhase === 'attack') {
        selectedAttack = { col, row };
        board.selectAttack(col, row, snapshot);
        if (elAttackVal) {
            elAttackVal.textContent = `(${col}, ${row})`;
            elAttackVal.classList.remove('filled');
            void elAttackVal.offsetWidth;
            elAttackVal.classList.add('filled');
        }
    }
}

// ====================================================================
// FASE UI
// ====================================================================

function setPhaseUI(newPhase) {
    phase = newPhase;
    board.setPhase(phase);

    if (elPhaseText) {
        glitchText(
            elPhaseText,
            phase === 'move' ? 'SELECCIONAR MOVIMIENTO' : 'SELECCIONAR ATAQUE'
        );
    }

    if (elTabMove)   elTabMove.classList.toggle('active',   phase === 'move');
    if (elTabAttack) elTabAttack.classList.toggle('active', phase === 'attack');
}

// ====================================================================
// SUBMIT
// ====================================================================

async function handleSubmit() {
    if (!selectedMove || !selectedAttack) {
        _logVfx('Selecciona movimiento Y ataque antes de enviar.', 'hit');
        shakeElement(elBtnSubmit);
        screenFlash('warning', 0.1);
        return;
    }

    elBtnSubmit.disabled = true;
    const currentTurn = (snapshot && (snapshot.turnNumber || snapshot.turn))
        ? (snapshot.turnNumber || snapshot.turn)
        : 1;

    try {
        _logVfx(`Enviando acciones del Turno ${currentTurn}...`, 'info');
        const res = await submitTurn(
            GAME_ID, PLAYER_ID, currentTurn,
            selectedMove.col, selectedMove.row,
            selectedAttack.col, selectedAttack.row
        );

        if (res.waiting || res.received) {
            showWaiting(true);
            startPolling();
        } else {
            snapshot = res;
            updateUI(snapshot, true);
            showWaiting(false);
            resetSelections();

            if (snapshot.status === 'FINISHED') {
                showEndgame(snapshot);
            } else {
                setPhaseUI('move');
                elBtnSubmit.disabled = false;
            }
        }

    } catch (err) {
        _logVfx(`Error al enviar: ${err.message}`, 'hit');
        shakeElement(document.querySelector('.action-controls'));
        screenFlash('danger', 0.15);
        resetSelections();
        setPhaseUI('move');
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
        if (data.waiting) return;

        stopPolling();
        snapshot = data;
        updateUI(snapshot, true);
        showWaiting(false);
        resetSelections();
        elBtnSubmit.disabled = false;

        if (snapshot.status === 'FINISHED') {
            showEndgame(snapshot);
        } else {
            setPhaseUI('move');
            _logVfx(`Turno ${snapshot.turn - 1} resuelto.`, 'info');
        }

    } catch (err) {
        console.warn('Poll error:', err.message);
    }
}

// ====================================================================
// ACTUALIZAR UI
// ====================================================================

function updateUI(snap, withVfx = false) {
    if (!snap) return;

    // Número de turno
    if (elTurnNum) {
        if (withVfx) {
            glitchText(elTurnNum, String(snap.turn ?? '—'));
        } else {
            elTurnNum.textContent = snap.turn ?? '—';
        }
    }

    // Tag de estado
    if (elStatusTag) {
        elStatusTag.textContent = snap.status || '—';
        elStatusTag.className   = 'tag';
        if (snap.status === 'ACTIVE')   elStatusTag.classList.add('tag-active');
        if (snap.status === 'FINISHED') elStatusTag.classList.add('tag-finished');
        if (snap.status === 'WAITING')  elStatusTag.classList.add('tag-waiting');
    }

    // HP con efectos
    const hp    = snap.myHp ?? 100;
    const prevHp = _prevHp;

    if (withVfx && hp < prevHp) {
        // Recibimos daño
        hpDrop(elMyHpFill, elMyHpLabel, hp);
        screenFlash('danger', 0.18);
        shakeElement(document.querySelector('.side-panel'));
        pulseElement(document.querySelector('.side-card'), 'animate-border-hit', 700);
    } else {
        if (elMyHp) elMyHp.textContent = `${hp} HP`;
        if (elMyHpFill) {
            elMyHpFill.style.width = `${hp}%`;
            elMyHpFill.className   = 'hp-fill';
            if (hp <= 25) elMyHpFill.classList.add('crit');
            else if (hp <= 50) elMyHpFill.classList.add('low');
        }
    }
    _prevHp = hp;

    // Regiones
    if (elMyRegion && snap.myRegion && snap.myRegion !== elMyRegion.textContent) {
        if (withVfx) glitchText(elMyRegion, snap.myRegion);
        else         elMyRegion.textContent = snap.myRegion || '—';
        pulseElement(elMyRegion, 'changed', 600);
    }

    if (elEnemyRegion && snap.enemyRegion && snap.enemyRegion !== elEnemyRegion.textContent) {
        if (withVfx) glitchText(elEnemyRegion, snap.enemyRegion);
        else         elEnemyRegion.textContent = snap.enemyRegion || '—';
        pulseElement(elEnemyRegion, 'changed', 600);
    }

    // Resultados del turno con animación pop
    _setResultVal(elHitOnMe,     snap.hitOnMe);
    _setResultVal(elDmgReceived, snap.damageReceived != null ? `-${snap.damageReceived} HP` : '—');
    _setResultVal(elHitOnEnemy,  snap.hitOnEnemy);

    // Log del turno
    if (snap.hitOnMe && snap.hitOnMe !== 'MISS') {
        _logVfx(`T${snap.turn}: Recibiste ${snap.hitOnMe} — ${snap.damageReceived} HP`, 'hit');
    } else if (snap.hitOnMe === 'MISS') {
        _logVfx(`T${snap.turn}: El rival falló.`, 'miss');
    }

    board.render(snap);

    // Flash de éxito si dimos en el blanco
    if (withVfx && snap.hitOnEnemy && snap.hitOnEnemy !== 'MISS') {
        setTimeout(() => screenFlash('success', 0.12), 200);
    }
}

function _setResultVal(el, value) {
    if (!el) return;
    el.textContent = value ?? '—';
    el.classList.remove('updated');
    void el.offsetWidth;
    el.classList.add('updated');
}

function resetSelections() {
    selectedMove   = null;
    selectedAttack = null;
    board.clearSelections();
    if (elMoveVal)   { elMoveVal.textContent   = '—'; elMoveVal.classList.remove('filled'); }
    if (elAttackVal) { elAttackVal.textContent = '—'; elAttackVal.classList.remove('filled'); }
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
        screenFlash('warning', 0.25);
    } else if (snap.winnerId === PLAYER_ID) {
        resultText  = '¡VICTORIA!';
        resultClass = 'win';
        subtitle    = 'Eliminaste a tu rival.';
        screenFlash('success', 0.3);
        // Partículas de victoria en el centro
        setTimeout(() => _victoryBurst(), 300);
        setTimeout(() => _victoryBurst(), 700);
        setTimeout(() => _victoryBurst(), 1100);
    } else {
        resultText  = 'DERROTA';
        resultClass = 'loss';
        subtitle    = `Ganó: ${snap.winnerId}`;
        screenFlash('danger', 0.3);
    }

    if (elEndgameResult) {
        elEndgameResult.className = `endgame-result ${resultClass}`;
        glitchText(elEndgameResult, resultText, 6);
    }
    if (elEndgameSubtitle) elEndgameSubtitle.textContent = subtitle;
}

function _victoryBurst() {
    const fakeCell = {
        getBoundingClientRect: () => ({
            left:   window.innerWidth  / 2 - 2,
            top:    window.innerHeight / 2 - 2,
            width:  4,
            height: 4,
        })
    };
    // Importamos spawnParticles dinámicamente para no crear dependencia circular
    import('./vfx.js').then(({ spawnParticles }) => {
        // Lanzar varias ráfagas desde el centro
        for (let i = 0; i < 3; i++) {
            const proxy = {
                getBoundingClientRect: () => ({
                    left:   window.innerWidth  / 2 + (Math.random() - .5) * 120,
                    top:    window.innerHeight / 2 + (Math.random() - .5) * 80,
                    width:  1,
                    height: 1,
                })
            };
            spawnParticles(proxy, 'attack');
        }
    });
}

// ====================================================================
// LOG VFX
// ====================================================================

function _logVfx(msg, type = '') {
    typewriterLog(elTurnLog, msg, type);
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
        pulseElement(elBtnReset, 'animate-scale-in', 300);
    });
}

if (elTabMove)   elTabMove.addEventListener('click',   () => setPhaseUI('move'));
if (elTabAttack) elTabAttack.addEventListener('click', () => setPhaseUI('attack'));

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

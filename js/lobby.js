/**
 * BlindSector — Lógica del Lobby
 */

import { createGame, joinGame, startGame, getLobbyStatus } from './api.js';

// ---- Estado local del lobby ----
const state = {
    gameId:    null,
    playerId:  null,
    playerAId: null,
    playerBId: null,
    status:    null,
    isHost:    false,
    spawnCol:  null,
    spawnRow:  null
};

let pollTimer = null;
const POLL_MS = 2000;

// ---- Referencias al DOM ----
const elLog             = document.getElementById('lobby-log');
const elRoomPanel       = document.getElementById('room-status');
const elRoomGameId      = document.getElementById('room-game-id');
const elRoomMyPlayerId  = document.getElementById('room-my-player-id');
const elRoomPlayerA     = document.getElementById('room-player-a');
const elRoomPlayerB     = document.getElementById('room-player-b');
const elRoomStatusTag   = document.getElementById('room-status-tag');
const elStartBtn        = document.getElementById('btn-start');
const elCopyBtn         = document.getElementById('btn-copy-id');

// ---- Utilidades ----

function log(msg, type = '') {
    if (!elLog) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `> ${msg}`;
    elLog.prepend(entry);
}

function showRoomPanel() {
    if (!elRoomPanel) return;
    elRoomPanel.classList.remove('hidden');

    if (elRoomGameId)     elRoomGameId.textContent     = state.gameId   || '—';
    if (elRoomMyPlayerId) elRoomMyPlayerId.textContent = state.playerId || '—';
    if (elRoomPlayerA)    elRoomPlayerA.textContent    = state.playerAId || '—';

    if (elRoomPlayerB) {
        if (state.playerBId) {
            elRoomPlayerB.textContent = state.playerBId;
        } else {
            elRoomPlayerB.innerHTML = '<span class="waiting-indicator"><span class="waiting-dot"></span>esperando...</span>';
        }
    }

    if (elRoomStatusTag) {
        elRoomStatusTag.textContent = state.status || '—';
        elRoomStatusTag.className = 'tag';
        if (state.status === 'WAITING')  elRoomStatusTag.classList.add('tag-waiting');
        if (state.status === 'ACTIVE')   elRoomStatusTag.classList.add('tag-active');
        if (state.status === 'FINISHED') elRoomStatusTag.classList.add('tag-finished');
    }

    // El botón de iniciar solo aparece al host cuando ya hay playerB
    if (elStartBtn) {
        elStartBtn.classList.toggle('hidden', !state.isHost || !state.playerBId);
    }
}

function redirectToGame() {
    stopPolling();
    const params = new URLSearchParams({
        gameId:   state.gameId,
        playerId: state.playerId,
        spawnCol: state.spawnCol,
        spawnRow: state.spawnRow
    });
    window.location.href = `/game.html?${params.toString()}`;
}

// ---- Polling del lobby ----

function startPolling() {
    stopPolling();
    pollTimer = setInterval(doPoll, POLL_MS);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function doPoll() {
    try {
        const data = await getLobbyStatus(state.gameId);

        // Detectar que playerB se unió (relevante para el host)
        if (!state.playerBId && data.playerBId) {
            state.playerBId = data.playerBId;
            log(`Jugador B conectado: ${data.playerBId}`, 'ok');
            showRoomPanel();
        }

        // Detectar que la partida fue iniciada (relevante para playerB)
        if (data.status === 'ACTIVE' && state.status !== 'ACTIVE') {
            state.status = 'ACTIVE';
            log('¡Partida iniciada! Entrando al juego...', 'ok');
            redirectToGame();
        }

    } catch (err) {
        // Silencioso: puede ser transitorio
        console.warn('Lobby poll error:', err.message);
    }
}

// ---- Handlers ----

export function initLobby() {
    // Crear partida
    const formCreate = document.getElementById('form-create');
    if (formCreate) {
        formCreate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const playerId = crypto.randomUUID();

            try {
                const res = await createGame(playerId);
                state.gameId    = res.gameId;
                state.playerId  = playerId;
                state.playerAId = res.playerAId;
                state.status    = res.status;
                state.isHost    = true;
                state.spawnCol  = res.spawnCol;
                state.spawnRow  = res.spawnRow;
                log(`Partida creada: ${res.gameId}`, 'ok');
                log(`Tu Player ID: ${playerId}`, 'info');
                showRoomPanel();
                startPolling(); // esperar a que llegue playerB
            } catch (err) {
                log(`Error al crear: ${err.message}`, 'error');
            }
        });
    }

    // Unirse a partida
    const formJoin = document.getElementById('form-join');
    if (formJoin) {
        formJoin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const gameId   = document.getElementById('join-game-id').value.trim();
            if (!gameId) return;
            const playerId = crypto.randomUUID();

            try {
                const res = await joinGame(gameId, playerId);
                state.gameId    = res.gameId;
                state.playerId  = playerId;
                state.playerAId = res.playerAId;
                state.playerBId = res.playerBId;
                state.status    = res.status;
                state.isHost    = false;
                state.spawnCol  = res.spawnCol;
                state.spawnRow  = res.spawnRow;
                log(`Unido a partida: ${res.gameId}`, 'ok');
                log(`Tu Player ID: ${playerId}`, 'info');
                showRoomPanel();
                startPolling(); // esperar a que el host inicie
            } catch (err) {
                log(`Error al unirse: ${err.message}`, 'error');
            }
        });
    }

    // Iniciar partida (solo host)
    if (elStartBtn) {
        elStartBtn.addEventListener('click', async () => {
            try {
                const res = await startGame(state.gameId);
                state.status = res.status;
                log(`Partida iniciada — Turno ${res.turnNumber}`, 'ok');
                redirectToGame();
            } catch (err) {
                log(`Error al iniciar: ${err.message}`, 'error');
            }
        });
    }

    // Copiar gameId
    if (elCopyBtn) {
        elCopyBtn.addEventListener('click', () => {
            if (!state.gameId) return;
            navigator.clipboard.writeText(state.gameId).then(() => {
                log('Game ID copiado al portapapeles', 'info');
            });
        });
    }
}

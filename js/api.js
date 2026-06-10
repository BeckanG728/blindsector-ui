/**
 * BlindSector — Capa de acceso a la API REST
 * Todos los métodos lanzan Error si la respuesta no es 2xx.
 */

const API_BASE = 'https://backend.tpdteam3.com/blind-sector/api';

async function apiRequest(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const err = await res.json(); msg = err.message || msg; } catch (_) {}
        throw new Error(msg);
    }
    return res.json();
}

// ---- Lobby ----

/**
 * POST /api/lobby/create
 * @returns {Promise<{gameId: string, playerAId: string, status: string}>}
 */
export async function createGame(playerId) {
    return apiRequest('POST', '/lobby/create', { playerId });
}

/**
 * POST /api/lobby/join
 * @returns {Promise<{gameId: string, playerAId: string, playerBId: string, status: string}>}
 */
export async function joinGame(gameId, playerId) {
    return apiRequest('POST', '/lobby/join', { gameId, playerId });
}

/**
 * POST /api/lobby/start
 * @returns {Promise<{gameId: string, status: string, turn: number}>}
 */
export async function startGame(gameId) {
    return apiRequest('POST', '/lobby/start', { gameId });
}

/**
 * GET /api/lobby/{gameId}/status
 * Polling del lobby: devuelve playerAId, playerBId (nullable) y status.
 * @returns {Promise<{gameId, playerAId, playerBId, status}>}
 */
export async function getLobbyStatus(gameId) {
    return apiRequest('GET', `/lobby/${gameId}/status`);
}

// ---- Juego ----

/**
 * GET /api/game/{gameId}/state
 * Requiere el playerId como header X-Player-Id.
 * @returns {Promise<SnapshotDTO | {waiting: boolean, status: string}>}
 */
export async function pollState(gameId, playerId) {
    const res = await fetch(`${API_BASE}/game/${gameId}/state`, {
        headers: { 'X-Player-Id': playerId }
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const err = await res.json(); msg = err.message || msg; } catch (_) {}
        throw new Error(msg);
    }
    return res.json();
}

/**
 * GET /api/game/{gameId}/snapshot/last
 * Reconexión: devuelve el último snapshot disponible.
 * @returns {Promise<SnapshotDTO | {status: string, turn: number}>}
 */
export async function getLastSnapshot(gameId, playerId) {
    const res = await fetch(`${API_BASE}/game/${gameId}/snapshot/last`, {
        headers: { 'X-Player-Id': playerId }
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const err = await res.json(); msg = err.message || msg; } catch (_) {}
        throw new Error(msg);
    }
    return res.json();
}

// ---- Turno ----

/**
 * POST /api/turn/submit
 * @param {string} gameId
 * @param {string} playerId
 * @param {number} turn
 * @param {number} moveToCol
 * @param {number} moveToRow
 * @param {number} attackCol
 * @param {number} attackRow
 * @returns {Promise<{received: boolean, waiting: boolean} | SnapshotDTO>}
 */
export async function submitTurn(gameId, playerId, turn, moveToCol, moveToRow, attackCol, attackRow) {
    return apiRequest('POST', '/turn/submit', {
        gameId, playerId, turn, moveToCol, moveToRow, attackCol, attackRow
    });
}

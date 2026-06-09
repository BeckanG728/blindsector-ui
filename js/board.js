/**
 * BlindSector — Renderizado del tablero 15×15
 *
 * El tablero es de 15 columnas × 15 filas (índices 0..14).
 * La celda se identifica por (col, row).
 *
 * Fases del turno:
 *   'move'   — el jugador selecciona su posición de destino
 *   'attack' — el jugador selecciona la celda de ataque
 */

import { spawnParticles, boardScanReveal, pulseElement } from './vfx.js';

const COLS = 15;
const ROWS = 15;

function getRegion(col, row) {
    const colSector = Math.floor(col / 5);
    const rowSector = Math.floor(row / 5);
    return `${String.fromCharCode(65 + colSector)}${rowSector + 1}`;
}

export class Board {
    constructor(containerId, onCellClick) {
        this.container   = document.getElementById(containerId);
        this.onCellClick = onCellClick;
        this.phase       = 'move';

        this.myCol     = null;
        this.myRow     = null;
        this.moveCol   = null;
        this.moveRow   = null;
        this.attackCol = null;
        this.attackRow = null;

        this._cells         = [];
        this._prevSnapshot  = null;
        this._build();
    }

    _build() {
        this.container.innerHTML = '';
        this._cells = [];

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.col = col;
                cell.dataset.row = row;
                cell.title = `${getRegion(col, row)} (${col},${row})`;

                cell.addEventListener('click', (e) => {
                    this._onCellClickVfx(cell, col, row, e);
                });

                cell.addEventListener('mouseenter', () => {
                    this._onCellHoverVfx(cell);
                });

                this.container.appendChild(cell);
                this._cells.push(cell);
            }
        }

        // Reveal inicial en barrido diagonal
        boardScanReveal(this._cells, COLS);
    }

    _cellAt(col, row) {
        return this._cells[row * COLS + col];
    }

    setPhase(phase) {
        this.phase = phase;
        // Cambiar clase del tablero según fase
        if (phase === 'attack') {
            this.container.classList.add('attack-phase');
        } else {
            this.container.classList.remove('attack-phase');
        }
    }

    // ---- Efectos en hover ----
    _onCellHoverVfx(cell) {
        // Chispa sutil al pasar por celdas de ataque o seleccionadas
        if (cell.classList.contains('selected-move') ||
            cell.classList.contains('selected-attack') ||
            cell.classList.contains('player-me')) {
            // Mini partícula accent única
            const rect = cell.getBoundingClientRect();
            const p = document.createElement('div');
            const size = 2 + Math.random() * 2;
            Object.assign(p.style, {
                position:    'fixed',
                left:        `${rect.left + Math.random() * rect.width}px`,
                top:         `${rect.top  + Math.random() * rect.height}px`,
                width:       `${size}px`,
                height:      `${size}px`,
                borderRadius: '50%',
                background:  'var(--accent)',
                pointerEvents: 'none',
                zIndex:      '9996',
                opacity:     '1',
                transition:  'transform .4s ease-out, opacity .4s ease-out',
            });
            document.body.appendChild(p);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    p.style.transform = `translateY(-${8 + Math.random() * 12}px)`;
                    p.style.opacity   = '0';
                });
            });
            setTimeout(() => p.remove(), 450);
        }
    }

    // ---- Click con VFX ----
    _onCellClickVfx(cell, col, row, e) {
        if (this.phase === 'move') {
            spawnParticles(cell, 'move');
        } else {
            spawnParticles(cell, 'attack');
        }
        this.onCellClick(col, row, this.phase);
    }

    /**
     * Actualiza todo el tablero a partir del snapshot + selecciones actuales.
     */
    render(snapshot) {
        const prev = this._prevSnapshot;

        // Limpiar clases dinámicas
        for (const cell of this._cells) {
            cell.className = 'cell';
            cell.innerHTML = '';
        }

        if (!snapshot) return;

        const myCol = snapshot.myCol;
        const myRow = snapshot.myRow;

        // Posición actual del jugador
        if (myCol != null && myRow != null) {
            const c = this._cellAt(myCol, myRow);
            if (c) {
                c.classList.add('player-me');
                c.innerHTML = '<div class="cell-icon">ME</div>';
            }
        }

        // Región del enemigo
        if (snapshot.enemyRegion) {
            this._markRegion(snapshot.enemyRegion, 'enemy-region');
        }

        // Área de impacto recibida — con partículas si es nuevo turno
        if (snapshot.impactAreaReceived) {
            const isNew = !prev || prev.turn !== snapshot.turn;
            for (const pos of snapshot.impactAreaReceived) {
                const c = this._cellAt(pos.col, pos.row);
                if (c) {
                    c.classList.add('impact-received');
                    if (isNew) {
                        // Escalonar partículas por celda
                        const delay = Math.random() * 120;
                        setTimeout(() => spawnParticles(c, 'hit'), delay);
                    }
                }
            }
        }

        // Mi área de ataque del turno anterior
        if (snapshot.myAttackArea) {
            for (const pos of snapshot.myAttackArea) {
                const c = this._cellAt(pos.col, pos.row);
                if (c) c.classList.add('my-attack');
            }
        }

        // Selección de movimiento activa
        if (this.moveCol != null && this.moveRow != null) {
            const c = this._cellAt(this.moveCol, this.moveRow);
            if (c) {
                c.classList.remove('player-me');
                c.classList.add('selected-move');
                c.innerHTML = '<div class="cell-icon">→</div>';
            }
        }

        // Selección de ataque activa
        if (this.attackCol != null && this.attackRow != null) {
            const c = this._cellAt(this.attackCol, this.attackRow);
            if (c) c.classList.add('selected-attack');
        }

        this._prevSnapshot = snapshot;
    }

    _markRegion(region, cssClass) {
        if (!region || region.length < 2) return;
        const colSector = region.charCodeAt(0) - 65;
        const rowSector = parseInt(region[1]) - 1;
        if (colSector < 0 || colSector > 2 || rowSector < 0 || rowSector > 2) return;

        const colStart = colSector * 5;
        const rowStart = rowSector * 5;

        for (let r = rowStart; r < rowStart + 5 && r < ROWS; r++) {
            for (let c = colStart; c < colStart + 5 && c < COLS; c++) {
                const cell = this._cellAt(c, r);
                if (cell) cell.classList.add(cssClass);
            }
        }
    }

    selectMove(col, row, snapshot) {
        this.moveCol = col;
        this.moveRow = row;
        this.render(snapshot);
    }

    selectAttack(col, row, snapshot) {
        this.attackCol = col;
        this.attackRow = row;
        this.render(snapshot);
    }

    clearSelections() {
        this.moveCol   = null;
        this.moveRow   = null;
        this.attackCol = null;
        this.attackRow = null;
    }
}

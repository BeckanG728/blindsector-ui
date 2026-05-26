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

const COLS = 15;
const ROWS = 15;

// Regiones en el tablero (col/row 0..14 → 9 regiones de 5×5, 3 cols × 3 filas)
// Etiqueta: letra de columna de región (A, B, C) + número de fila de región (1, 2, 3)
// Alineado con backend: Region.toLabel() → 'A' + regionCol, regionRow + 1
function getRegion(col, row) {
    const colSector = Math.floor(col / 5); // 0..2
    const rowSector = Math.floor(row / 5); // 0..2
    return `${String.fromCharCode(65 + colSector)}${rowSector + 1}`;
}

export class Board {
    /**
     * @param {string} containerId  — id del elemento #board
     * @param {function} onCellClick — callback(col, row, phase)
     */
    constructor(containerId, onCellClick) {
        this.container = document.getElementById(containerId);
        this.onCellClick = onCellClick;
        this.phase = 'move'; // 'move' | 'attack'

        // Estado visual
        this.myCol    = null;
        this.myRow    = null;
        this.moveCol  = null;
        this.moveRow  = null;
        this.attackCol = null;
        this.attackRow = null;
        this.enemyRegion  = null;
        this.myAttackArea = [];
        this.impactReceived = [];

        this._cells = [];
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

                cell.addEventListener('click', () => {
                    this.onCellClick(col, row, this.phase);
                });

                this.container.appendChild(cell);
                this._cells.push(cell);
            }
        }
    }

    _cellAt(col, row) {
        return this._cells[row * COLS + col];
    }

    setPhase(phase) {
        this.phase = phase;
    }

    /**
     * Actualiza todo el tablero a partir del snapshot + selecciones actuales.
     */
    render(snapshot) {
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

        // Área de impacto recibida
        if (snapshot.impactAreaReceived) {
            for (const pos of snapshot.impactAreaReceived) {
                const c = this._cellAt(pos.col, pos.row);
                if (c) c.classList.add('impact-received');
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
    }

    /**
     * Marca todas las celdas que pertenecen a la región indicada.
     * Formato de región: letra fila (A-E) + número columna (1-5), ej: "B3"
     */
    _markRegion(region, cssClass) {
        if (!region || region.length < 2) return;
        const colSector = region.charCodeAt(0) - 65; // 'A'=0, 'B'=1, 'C'=2
        const rowSector = parseInt(region[1]) - 1;   // '1'=0, '2'=1, '3'=2
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

    /**
     * Establece la selección de movimiento y re-renderiza.
     */
    selectMove(col, row, snapshot) {
        this.moveCol = col;
        this.moveRow = row;
        this.render(snapshot);
    }

    /**
     * Establece la selección de ataque y re-renderiza.
     */
    selectAttack(col, row, snapshot) {
        this.attackCol = col;
        this.attackRow = row;
        this.render(snapshot);
    }

    clearSelections() {
        this.moveCol = null;
        this.moveRow = null;
        this.attackCol = null;
        this.attackRow = null;
    }
}

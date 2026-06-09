/**
 * BlindSector — Efectos visuales
 *
 * Exporta helpers de VFX usados por game.js y board.js:
 *   - screenFlash(color)              — flash de toda la pantalla
 *   - spawnParticles(cell, type)      — partículas desde una celda
 *   - typewriterLog(el, msg, type)    — entrada de log tipo teletype
 *   - boardScanReveal(cells)          — reveal de celdas en cascada
 *   - pulseElement(el, cssClass)      — añade clase de animación y la quita
 *   - shakeElement(el)                — sacude un elemento
 *   - rippleButton(btn, e)            — efecto ripple al click
 *   - hpDrop(fillEl, labelEl, newHp)  — transición dramática de HP
 *   - glitchText(el, finalText)       — efecto de texto glitch al cambiar
 *   - countUp(el, from, to, suffix)   — cuenta animada de número
 */

// ============================================================
// SCREEN FLASH
// ============================================================

let _flashEl = null;

function _ensureFlashEl() {
    if (_flashEl) return _flashEl;
    _flashEl = document.createElement('div');
    Object.assign(_flashEl.style, {
        position:        'fixed',
        inset:           '0',
        pointerEvents:   'none',
        zIndex:          '9997',
        opacity:         '0',
        transition:      'opacity 0s',
    });
    document.body.appendChild(_flashEl);
    return _flashEl;
}

/**
 * Destella toda la pantalla con el color indicado.
 * @param {'danger'|'success'|'accent'|'warning'} type
 * @param {number} [intensity=0.22]  opacidad máxima
 */
export function screenFlash(type = 'danger', intensity = 0.22) {
    const colors = {
        danger:  `rgba(255, 60,  60,  ${intensity})`,
        success: `rgba(0,   255, 136, ${intensity})`,
        accent:  `rgba(0,   212, 255, ${intensity})`,
        warning: `rgba(255, 165, 0,   ${intensity})`,
    };
    const el = _ensureFlashEl();
    el.style.background  = colors[type] ?? colors.danger;
    el.style.transition  = 'opacity 0s';
    el.style.opacity     = '1';

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.transition = 'opacity .45s ease-out';
            el.style.opacity    = '0';
        });
    });
}

// ============================================================
// PARTÍCULAS EN CELDA
// ============================================================

/**
 * Genera pequeñas partículas que salen de la celda dada.
 * @param {HTMLElement} cellEl
 * @param {'hit'|'miss'|'move'|'attack'} type
 */
export function spawnParticles(cellEl, type = 'hit') {
    if (!cellEl) return;

    const configs = {
        hit:    { count: 10, colors: ['#ff3c3c', '#ff6b6b', '#ffaaaa'], size: [3, 6], speed: [40, 80], life: 500 },
        miss:   { count:  5, colors: ['#64748b', '#94a3b8'],            size: [2, 4], speed: [20, 45], life: 380 },
        move:   { count:  6, colors: ['#00d4ff', '#94e2ff'],            size: [2, 4], speed: [25, 50], life: 380 },
        attack: { count:  8, colors: ['#ffa500', '#ffcc55', '#fff'],     size: [2, 5], speed: [35, 70], life: 450 },
    };

    const cfg = configs[type] ?? configs.hit;
    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;

    for (let i = 0; i < cfg.count; i++) {
        const p = document.createElement('div');
        const size  = _rand(cfg.size[0], cfg.size[1]);
        const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist  = _rand(cfg.speed[0], cfg.speed[1]);
        const tx    = Math.cos(angle) * dist;
        const ty    = Math.sin(angle) * dist;

        Object.assign(p.style, {
            position:      'fixed',
            left:          `${cx - size / 2}px`,
            top:           `${cy - size / 2}px`,
            width:         `${size}px`,
            height:        `${size}px`,
            borderRadius:  '50%',
            background:    color,
            pointerEvents: 'none',
            zIndex:        '9996',
            transition:    `transform ${cfg.life}ms cubic-bezier(.2,.8,.4,1), opacity ${cfg.life}ms ease-out`,
            opacity:       '1',
            boxShadow:     `0 0 ${size * 1.5}px ${color}`,
        });

        document.body.appendChild(p);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                p.style.transform = `translate(${tx}px, ${ty}px) scale(.2)`;
                p.style.opacity   = '0';
            });
        });

        setTimeout(() => p.remove(), cfg.life + 50);
    }
}

// ============================================================
// TYPEWRITER LOG
// ============================================================

const _CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

/**
 * Inserta una entrada de log con efecto typewriter + scramble breve.
 * @param {HTMLElement} containerEl  — el contenedor del log
 * @param {string}      msg
 * @param {string}      [type='']   — clase CSS extra (hit, miss, info…)
 * @param {number}      [speed=18]  — ms por carácter
 */
export function typewriterLog(containerEl, msg, type = '', speed = 18) {
    if (!containerEl) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.style.overflow = 'hidden';
    containerEl.prepend(entry);

    let displayed = '';
    let i = 0;

    function tick() {
        if (i >= msg.length) {
            entry.textContent = msg;
            return;
        }
        // Scramble: muestra un char aleatorio brevemente antes del real
        const scramble = _CHARS[Math.floor(Math.random() * _CHARS.length)];
        entry.textContent = displayed + scramble + msg.slice(i + 1, i + 4).replace(/./g, '▒');
        displayed += msg[i];
        i++;
        setTimeout(tick, speed);
    }

    tick();
    return entry;
}

// ============================================================
// BOARD SCAN REVEAL
// ============================================================

/**
 * Anima las celdas del tablero con un reveal en barrido diagonal.
 * @param {HTMLElement[]} cells  — array de elementos de celda
 * @param {number}        [cols=15]
 */
export function boardScanReveal(cells, cols = 15) {
    cells.forEach((cell, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const delay = (col + row) * 8; // barrido diagonal
        cell.style.animationDelay = `${delay}ms`;
    });

    // Limpiar delays tras la animación
    setTimeout(() => {
        cells.forEach(cell => { cell.style.animationDelay = ''; });
    }, cells.length * 8 + 400);
}

// ============================================================
// PULSE ELEMENT
// ============================================================

/**
 * Añade una clase CSS a un elemento y la retira cuando termina la animación.
 */
export function pulseElement(el, cssClass = 'animate-border-hit', duration = 700) {
    if (!el) return;
    el.classList.add(cssClass);
    setTimeout(() => el.classList.remove(cssClass), duration);
}

// ============================================================
// SHAKE ELEMENT
// ============================================================

export function shakeElement(el, duration = 320) {
    if (!el) return;
    el.classList.add('animate-shudder');
    setTimeout(() => el.classList.remove('animate-shudder'), duration);
}

// ============================================================
// RIPPLE BUTTON
// ============================================================

/**
 * Efecto ripple material-style en un botón.
 */
export function rippleButton(btn, event) {
    if (!btn) return;
    const rect   = btn.getBoundingClientRect();
    const size   = Math.max(rect.width, rect.height) * 1.4;
    const x      = (event?.clientX ?? rect.left + rect.width  / 2) - rect.left - size / 2;
    const y      = (event?.clientY ?? rect.top  + rect.height / 2) - rect.top  - size / 2;

    const ripple = document.createElement('span');
    Object.assign(ripple.style, {
        position:      'absolute',
        borderRadius:  '50%',
        width:         `${size}px`,
        height:        `${size}px`,
        left:          `${x}px`,
        top:           `${y}px`,
        background:    'rgba(0, 212, 255, 0.25)',
        transform:     'scale(0)',
        pointerEvents: 'none',
        animation:     'ripple-expand .55s ease-out forwards',
    });

    // Inyectar keyframe si no existe
    if (!document.getElementById('ripple-style')) {
        const s = document.createElement('style');
        s.id = 'ripple-style';
        s.textContent = `
            @keyframes ripple-expand {
                to { transform: scale(1); opacity: 0; }
            }
        `;
        document.head.appendChild(s);
    }

    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

// ============================================================
// HP DROP DRAMÁTICO
// ============================================================

/**
 * Transición dramática de HP: la barra parpadea y el label rebota.
 * @param {HTMLElement} fillEl   — .hp-fill
 * @param {HTMLElement} labelEl  — el <strong> con el valor
 * @param {number}      newHp
 * @param {number}      [oldHp]  — si se omite se lee del ancho actual
 */
export function hpDrop(fillEl, labelEl, newHp, oldHp) {
    if (!fillEl) return;

    // Flash naranja → rojo en la barra antes de reducir
    fillEl.style.filter = 'brightness(2) saturate(2)';
    setTimeout(() => {
        fillEl.style.filter = '';
        fillEl.style.width  = `${Math.max(0, newHp)}%`;
        fillEl.className    = 'hp-fill';
        if (newHp <= 25) fillEl.classList.add('crit');
        else if (newHp <= 50) fillEl.classList.add('low');
    }, 120);

    if (labelEl) {
        labelEl.style.color = 'var(--danger)';
        labelEl.textContent = `${newHp} HP`;
        setTimeout(() => {
            labelEl.style.color = newHp <= 25 ? 'var(--danger)' : newHp <= 50 ? 'var(--warning)' : 'var(--success)';
        }, 600);
    }
}

// ============================================================
// GLITCH TEXT
// ============================================================

/**
 * Cambia el texto de un elemento con un breve efecto glitch.
 * @param {HTMLElement} el
 * @param {string}      finalText
 * @param {number}      [cycles=4]
 */
export function glitchText(el, finalText, cycles = 4) {
    if (!el) return;
    let count = 0;
    const interval = setInterval(() => {
        if (count >= cycles) {
            clearInterval(interval);
            el.textContent = finalText;
            return;
        }
        el.textContent = Array.from(finalText)
            .map(ch => ch === ' ' ? ' ' : (_CHARS[Math.floor(Math.random() * _CHARS.length)]))
            .join('');
        count++;
    }, 60);
}

// ============================================================
// COUNT UP
// ============================================================

/**
 * Anima un número de `from` a `to` en el elemento dado.
 */
export function countUp(el, from, to, suffix = '', duration = 600) {
    if (!el) return;
    const start = performance.now();
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
        el.textContent = Math.round(from + (to - from) * eased) + suffix;
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ============================================================
// HELPER INTERNO
// ============================================================

function _rand(min, max) {
    return Math.random() * (max - min) + min;
}

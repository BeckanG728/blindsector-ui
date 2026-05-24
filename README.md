# BLIND SECTOR

**Juego táctico de fuego ciego · Grilla 15×15 · 2 jugadores**

BlindSector es un juego táctico para 2 jugadores en el navegador, disputado en una grilla de 15×15 celdas. Cada jugador mueve y dispara simultáneamente en cada turno, sin conocer la posición exacta de su rival. Solo sabes su *región* (una de las 25 zonas de 3×3 celdas etiquetadas), así que cada disparo es un riesgo calculado.

---

## Mecánicas del juego

- El tablero está dividido en 25 regiones (A1–E5), cada una cubre un bloque de 3×3 celdas.
- En cada turno, ambos jugadores eligen simultáneamente un **destino de movimiento** y una **celda de ataque**.
- El movimiento está limitado por distancia de Chebyshev ≤ 4.
- Los ataques impactan en un **área de 3×3** centrada en la celda elegida.
- El daño varía según el tipo de impacto:
  - **HIT** — 25 HP
  - **DIRECT HIT** (el rival está exactamente en el centro del ataque) — 35 HP
  - **Bonificación Sniper** (el jugador no se movió ese turno) — +10 HP
- Si un jugador no envía su turno en 30 segundos, recibe **MISS** automático.
- La partida termina cuando un jugador llega a 0 HP (o ambos al mismo tiempo → empate).

---

## Stack tecnológico

| Capa      | Tecnología                            |
|-----------|---------------------------------------|
| Frontend  | HTML + CSS + ES Modules (Vanilla JS)  |
| Fuentes   | Rajdhani, Share Tech Mono (Google Fonts) |
| Backend   | API REST externa (ver más abajo)      |

---

## Cómo clonar el proyecto

```bash
git clone https://github.com/tu-org/blindsector.git
cd blindsector
```

No se requiere ningún paso de compilación. El frontend es HTML/CSS/JS puro y puede ser servido por cualquier servidor de archivos estáticos.

Para desarrollo local podés usar cualquier servidor liviano, por ejemplo:

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# java web - tomcat
# crear proyecto desde netbeans u otro IDE

# VS Code
# Usá la extensión "Live Server"
```

Luego abrir `http://localhost:PORT`, el valor de port depende del servicio que se este usando:
- LiveServer: 5500
- Tomcat: 8080

---

## Enlazar al backend

El frontend se comunica con una API REST. Todas las peticiones se hacen relativas a `/api`, definido en `js/api.js`:

```js
const API_BASE = '/api';
```

### Opción 1 — Proxy inverso

Configurá tu servidor web (nginx, Caddy, etc.) para redirigir las peticiones de `/api` a tu servicio backend:

```nginx
# Ejemplo con nginx
location /api/ {
    proxy_pass http://localhost:3000/api/;
}
```

### Opción 2 — Cambiar `API_BASE` directamente

Si querés apuntar a un backend remoto durante el desarrollo, editá `js/api.js`:

```js
# produccion
const API_BASE = 'https://tu-backend.com/api';

#local
const API_BASE = 'https://localhost:8081/api';
```

> Asegurate de que el backend tenga CORS habilitado para el origen del frontend si corren en hosts distintos.

### Endpoints requeridos

| Método | Ruta                               | Descripción                                  |
|--------|------------------------------------|----------------------------------------------|
| POST   | `/api/lobby/create`                | Crear una nueva sala                         |
| POST   | `/api/lobby/join`                  | Unirse a una sala existente por Game ID      |
| POST   | `/api/lobby/start`                 | El host inicia la partida                    |
| GET    | `/api/lobby/{gameId}/status`       | Consultar estado del lobby (jugadores, estado) |
| GET    | `/api/game/{gameId}/state`         | Consultar snapshot actual del juego          |
| GET    | `/api/game/{gameId}/snapshot/last` | Reconexión: obtener el último estado conocido |
| POST   | `/api/turn/submit`                 | Enviar movimiento + ataque del turno         |

Las peticiones de estado del juego requieren el header `X-Player-Id: <playerId>`.

---

## Estructura del proyecto

```
blindsector/
├── index.html          # Pantalla del lobby
├── game.html           # Pantalla de la partida
├── css/
│   ├── main.css        # Variables globales, estilos base, componentes reutilizables
│   ├── lobby.css       # Estilos específicos del lobby
│   └── game.css        # Estilos de la pantalla de juego
└── js/
    ├── api.js          # Cliente de la API (todas las llamadas fetch al backend)
    ├── board.js        # Renderizado del tablero e interacción con las celdas
    ├── lobby.js        # Estado del lobby y manejadores de formularios
    └── game.js         # Ciclo de vida del juego, polling, envío de turnos y UI
```

### Descripción de archivos principales

**`index.html`** — Punto de entrada del lobby. Contiene los formularios "Crear Partida" y "Unirse a Partida", el panel de estado de sala (Game ID, Player IDs, estado de conexión) y el log de mensajes.

**`game.html`** — Pantalla durante la partida. Renderiza la grilla 15×15, los controles de acción (pestañas mover/atacar), la barra de HP, el log de turnos y los overlays de espera y fin de partida.

**`css/main.css`** — Define todas las custom properties CSS (colores, tipografías, espaciado), los componentes reutilizables (`btn`, `input-field`, `tag`, `panel`), animaciones globales y el overlay de atmósfera con scanlines.

**`css/lobby.css`** — Estilos del layout del lobby, cards de sala, indicador de espera animado y el panel de log.

**`css/game.css`** — Estilos para la topbar del juego, paneles laterales, estados de la barra de HP, grilla del tablero, estados de celda (`player-me`, `enemy-region`, `selected-move`, `selected-attack`, etc.) y ambos overlays.

**`js/api.js`** — Wrapper liviano sobre `fetch`. Expone funciones async nombradas para cada endpoint del backend. Lanza un error en respuestas no 2xx, incluyendo el mensaje de error del servidor cuando está disponible.

**`js/board.js`** — Clase `Board` responsable de construir la grilla de 15×15 celdas, mapear los clics a coordenadas `(col, row)`, calcular las etiquetas de región (`A1`–`E5`) y aplicar clases CSS para reflejar el estado del juego (posición actual, región enemiga, áreas de ataque, selecciones activas).

**`js/lobby.js`** — Maneja los formularios del lobby (crear/unirse/iniciar), administra el estado local del lobby, ejecuta el ciclo de polling cada 2 segundos esperando que el jugador B se conecte o que el host inicie la partida, y redirige a `game.html` con `gameId` y `playerId` como parámetros de URL.

**`js/game.js`** — Orquesta el ciclo de vida completo de la partida: reconexión vía `getLastSnapshot`, el flujo mover → atacar → enviar turno, polling para obtener el snapshot resuelto mientras se espera al rival, actualización de la UI (HP, región, log de turnos) y renderizado del overlay de fin de partida.

---

## Player ID

Los Player IDs se generan automáticamente en el navegador usando `crypto.randomUUID()`. Se pasan como parámetros de URL (`?gameId=...&playerId=...`) al navegar del lobby a la pantalla de juego, y se envían en el header `X-Player-Id` en las peticiones de estado del juego.

---
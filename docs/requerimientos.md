# Requerimientos — F1 Paddock Graph

Todo lo necesario para correr el proyecto en **Windows**. Está escrito para que Claude Code (en VS Code) lo verifique e instale paso a paso.

> **Prompt sugerido para Claude Code:**
> "Lee `docs/requerimientos.md`. Verifica cada requerimiento de la sección 1 con los comandos indicados, instala lo que falte (pídeme permiso antes de cada instalación global), y luego ejecuta la Fase R completa. Al final dame una tabla con el estado de cada requerimiento."

---

## 1. Software base

| Requerimiento | Versión | Verificar | Instalar (PowerShell) |
|---|---|---|---|
| Node.js (incluye npm) | **22.x o 24.x LTS** | `node -v` · `npm -v` | `winget install OpenJS.NodeJS.LTS` |
| Git | 2.40 o superior | `git --version` | `winget install Git.Git` |
| VS Code + extensión Claude Code | última | — | ya instalado |
| Postman (app de escritorio) | última | abrir la app | `winget install Postman.Postman` |
| Navegador | Chrome, Edge o Firefox | — | — |

Después de instalar Node o Git con `winget`, **cierra y vuelve a abrir VS Code** para que la terminal reconozca los comandos nuevos.

---

## 2. Servicios en la nube

| Servicio | Estado | Detalle |
|---|---|---|
| Neo4j AuraDB Free | ✅ creada | Instancia `dd53b483`. Credenciales en `Neo4j-dd53b483-Created-2026-11-18.txt`, en la raíz del proyecto |
| GitHub | ✅ repo creado | Privado, `proyecto_basededatos`. La carpeta se conecta en la Fase 0 del plan |

**Límites de AuraDB Free que hay que tener presentes**
- Hasta 200 000 nodos y 400 000 relaciones. El proyecto usa ~330 nodos y ~2 000 relaciones (solo 2000–2025), más las partidas que se jueguen.
- Se **pausa sola tras 3 días sin actividad**. Se reanuda desde console.neo4j.io sin perder datos. Revísala antes de exponer.
- No hay backups automáticos; si hace falta, se repite el `npm run seed`, que es idempotente.

---

## 3. Variables de entorno (`.env`)

Se crea `.env` en la raíz copiando los valores del archivo de credenciales de Aura. **No imprimir la contraseña en la terminal.**

| Variable | De dónde sale | Ejemplo |
|---|---|---|
| `NEO4J_URI` | `NEO4J_URI` del `.txt` | `neo4j+s://dd53b483.databases.neo4j.io` |
| `NEO4J_USERNAME` | `NEO4J_USERNAME` del `.txt` | (lo que diga el archivo) |
| `NEO4J_PASSWORD` | `NEO4J_PASSWORD` del `.txt` | (secreto) |
| `NEO4J_DATABASE` | `NEO4J_DATABASE` del `.txt`; si no viene, usar `neo4j` | `neo4j` |
| `PORT` | fijo | `3000` |

Reglas:
- `.env` y `Neo4j-*-Created-*.txt` están en `.gitignore`. Se versiona solo `.env.example`.
- La URI **debe** empezar con `neo4j+s://` (conexión cifrada con TLS); Aura no acepta conexiones sin cifrar.

---

## 4. Dependencias npm

Ya están en `package.json`; se instalan con `npm install`. El juego no agrega dependencias (UUID con `crypto.randomUUID()`, pruebas con `node:test`).

| Paquete | Versión | Uso |
|---|---|---|
| `neo4j-driver` | `^6` | Driver oficial de Neo4j (SDK) |
| `express` | `^5` | Servidor HTTP / API REST |
| `dotenv` | última | Carga `.env` en `process.env` (si imprime un log al cargar, usar `{ quiet: true }`) |
| `csv-parse` | última | Lectura de los CSV de F1DB en el seed |
| `morgan` | última | Log de peticiones en la terminal (útil en la demo) |

```powershell
npm install neo4j-driver@^6 express@^5 dotenv csv-parse morgan
```

**Sin dependencias de desarrollo:** el modo watch usa `node --watch`, que ya viene en Node.

**Front-end:** vis-network se carga desde CDN en `public/index.html`, sin instalar nada:
```html
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
```

---

## 5. Datos

- Los CSV de F1DB (licencia CC BY 4.0) ya están en `data/f1db/`. Ver `data/f1db/README.md`.
- No se descarga nada en tiempo de ejecución, así que la demo no depende de APIs externas.

---

## 6. Red

- El driver se conecta a `*.databases.neo4j.io` por el **puerto 7687** (protocolo Bolt sobre TLS).
- **Riesgo para el jueves:** algunas redes de universidad bloquean puertos que no son web. Corre `npm run check` desde el Wi-Fi del campus antes de la exposición. Si falla con `ServiceUnavailable`, usa el hotspot del celular.

---

## Fase R — Verificación del entorno (checklist para Claude Code)

- [ ] `node -v` muestra v22.x o v24.x
- [ ] `npm -v` responde
- [ ] `git --version` responde
- [ ] Postman instalado
- [ ] Política de ejecución de PowerShell permite scripts de npm: `Get-ExecutionPolicy -Scope CurrentUser` devuelve `RemoteSigned` o `Unrestricted`. Si no: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (con permiso del usuario)
- [ ] Existe el archivo `Neo4j-dd53b483-Created-2026-11-18.txt` en la raíz
- [ ] `git config --global user.name` y `user.email` configurados (si no, pedírselos al usuario)
- [ ] La instancia de Aura aparece como *Running* en console.neo4j.io (lo confirma el usuario)

La conexión real a Aura se prueba con `npm run check`, cuando ya existan el `package.json` y el `.env`.

> **OneDrive y `npm run dev`:** al sincronizar, OneDrive modifica archivos y `node --watch` reinicia el servidor solo (a veces a mitad de una petición). Para la demo usa `npm start`.

---

## 7. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `npm.ps1 cannot be loaded because running scripts is disabled` | Política de PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `EPERM` / `EBUSY` en `npm install` | OneDrive sincronizando `node_modules` | Pausar OneDrive mientras instala y reintentar |
| `ServiceUnavailable` / `Could not perform discovery` | Aura pausada, URI mal escrita o puerto 7687 bloqueado | Reanudar en la consola, revisar `neo4j+s://`, probar con hotspot |
| `Neo.ClientError.Security.Unauthorized` | Usuario o contraseña incorrectos en `.env` | Volver a copiar desde el `.txt` |
| `EADDRINUSE :::3000` | Ya hay otro proceso en el puerto 3000 | Cerrar el otro proceso o cambiar `PORT` |
| Los años salen como `2026.0` | Se mandó un `number` sin `neo4j.int()` | Ver la regla de enteros en `CLAUDE.md` |

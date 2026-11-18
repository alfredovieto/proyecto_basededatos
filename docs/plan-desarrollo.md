# Plan de desarrollo — F1 Paddock Graph

Fases en orden, cada una con sus tareas (casillas), su criterio de **"Hecho cuando"** y la verificación correspondiente. El modelo, los endpoints y el Cypher base están en `docs/definicion-proyecto.md`; este plan dice **cómo y en qué orden** construirlos.

## Cómo usar este plan con Claude Code

Antes de empezar, completa la Fase R de `docs/requerimientos.md`. Después usa este prompt para cada fase:

> "Lee `CLAUDE.md` y la **Fase N** de `docs/plan-desarrollo.md`. Impleméntala completa, corre su verificación, marca las casillas y proponme el commit."

## Prioridades (entrega: jueves 19 de noviembre)

| Prioridad | Fases | Por qué |
|---|---|---|
| **P0 (obligatorio)** | 0, 1, 2, 3, 4, 5, 6, 9 | Cubren CRUD, consultas de grafo, conexión a la nube, seed, Postman y README (lo que pide la rúbrica) |
| **P1** | 7, 10 | La web para la demo, y el smoke test con el ensayo |
| **P2** | 8 | CLI de consultas (`seed`/`reset` ya cuentan como scripts) |

---

## Fase 0 — Repo y credenciales · P0

- [x] Confirmar que `.gitignore` incluye `.env`, `Neo4j-*-Created-*.txt` y `node_modules/`.
- [x] Crear `.env` a partir de `Neo4j-dd53b483-Created-2026-11-18.txt`, siguiendo la tabla de `docs/requerimientos.md` §3. **No imprimir la contraseña.** (El `.txt` ya se borró; `.env` es la única copia local.)
- [x] Inicializar git y conectarlo al repo remoto (pedirle al usuario su usuario de GitHub):
  ```powershell
  git init
  git branch -M main
  git remote add origin https://github.com/<USUARIO>/proyecto_basededatos.git
  git fetch origin
  # solo si el remoto ya tiene commits (README, licencia, etc.):
  git pull origin main --allow-unrelated-histories
  ```
- [x] `git check-ignore -v .env` confirma que está ignorado (el `.txt` de credenciales ya se borró).
- [x] `git add .` → `git status`: no deben aparecer `.env` ni el `.txt`.
- [ ] Commit `chore: documentación, datos F1DB y configuración inicial` → `git push -u origin main`.

**Hecho cuando:** el repo en GitHub tiene `CLAUDE.md`, `docs/`, `data/` y `.env.example`, sin credenciales, y `git status` está limpio.

---

## Fase 1 — Scaffold y conexión a Aura · P0

- [ ] `package.json`:
  - `"name": "f1-paddock-graph"`, `"type": "module"`, `"engines": { "node": ">=22" }`
  - scripts:
    ```json
    {
      "start": "node src/server.js",
      "dev": "node --watch src/server.js",
      "check": "node scripts/check.js",
      "schema": "node scripts/schema.js",
      "seed": "node scripts/seed.js",
      "reset": "node scripts/reset.js",
      "limpiar-demo": "node scripts/limpiar-demo.js",
      "cli": "node src/cli.js",
      "smoke": "node scripts/smoke.js"
    }
    ```
- [ ] Instalar dependencias (`docs/requerimientos.md` §4).
- [ ] Crear las carpetas de la estructura (definición §8).
- [ ] `src/config/env.js`: carga dotenv, valida que existan `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` y `NEO4J_DATABASE`, y que la URI empiece con `neo4j+s://`. Si falta algo, lanza un error que liste las variables faltantes. Exporta `config` (`neo4j.{uri,usuario,password,database}`, `puerto`).
- [ ] `src/config/neo4j.js`:
  - `driver` único con `neo4j.driver(uri, neo4j.auth.basic(...), { disableLosslessIntegers: true })`.
  - `leer(cypher, params)` → `driver.executeQuery(cypher, params, { database, routing: neo4j.routing.READ })` y devuelve `records.map(r => r.toObject())`.
  - `escribir(cypher, params)` → lo mismo con `routing: WRITE`.
  - `enTransaccion(async tx => …)` → `session.executeWrite`, para operaciones de varias sentencias. Cierra la sesión en `finally`.
  - `verificarConexion()` → `driver.getServerInfo()` (incluye la verificación de conectividad) y devuelve `{ host, agente, protocolo }`.
  - `cerrarDriver()`.
- [ ] `scripts/check.js`: mide la latencia, imprime `Conectado a Aura ✔`, el host (solo el hostname), el agente del servidor y el conteo de nodos y relaciones (query Health de la definición). Si hay error, da un mensaje amigable según el tipo (Unauthorized, ServiceUnavailable) y sale con `exit(1)`.

**Hecho cuando:** `npm run check` imprime la conexión a `dd53b483.databases.neo4j.io` con 0 nodos.
**Verificación:** `npm run check`.

---

## Fase 2 — Schema · P0

- [ ] `scripts/schema.cypher`: copiar las sentencias de la definición §4.5.
- [ ] `scripts/schema.js`: lee el archivo, ignora comentarios y líneas vacías, separa por `;` y ejecuta cada sentencia con `escribir()`. Al final imprime `SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties` y `SHOW INDEXES YIELD name, type, state` como tabla.
- [ ] Es idempotente (todo usa `IF NOT EXISTS`).

**Hecho cuando:** hay 7 constraints y los índices `piloto_busqueda` (TEXT), `carrera_anio` y `corrio_para_temp` en estado `ONLINE`.
**Verificación:** `npm run schema` dos veces seguidas, sin errores.

---

## Fase 3 — Seed · P0

### 3.1 Reglas generales
- [ ] Leer cada CSV con `csv-parse/sync` (`columns: true`, `skip_empty_lines: true`) y convertir `''` en `null`.
- [ ] Mandar las filas **como strings** y convertir tipos **dentro de Cypher** (`toInteger`, `toFloat`, `toBoolean`, `date()`, `point()`). Así se evita el problema de Float del driver.
- [ ] Lotes de **1 000 filas** con `UNWIND $filas AS f` + `MERGE` por la clave única, para que sea idempotente.
- [ ] Mostrar el progreso por entidad (`Pilotos 921/921 ✔`) y el tiempo total.
- [ ] Antes de cargar, ejecutar el schema (reutilizar la lógica de `schema.js`).
- [ ] `nombreBusqueda` = nombre en minúsculas y sin acentos, calculado en JS con `src/utils/texto.js` → `normalizar(s)` (NFD + quitar diacríticos). Se reutiliza en la API.

### 3.2 Mapeo CSV → grafo (en este orden)

| # | Destino | Archivo | Propiedades (← columna CSV) | Relaciones |
|---|---|---|---|---|
| 1 | `Pais` | `f1db-countries.csv` | id←id, nombre←name, alpha3←alpha3Code, continente←continentId | — |
| 2 | `Temporada` | `f1db-races.csv` (años distintos) | anio←toInteger(year) | — |
| 3 | `Circuito` | `f1db-circuits.csv` | id, nombre←name, nombreCompleto←fullName, tipo←type, ciudad←placeName, ubicacion←point({latitude, longitude}), longitudKm←toFloat(length), curvas←toInteger(turns), totalCarreras←toInteger(totalRacesHeld), origen='f1db' | `ES_DE`→Pais(countryId) |
| 4 | `Escuderia` | `f1db-constructors.csv` | id, nombre←name, nombreCompleto←fullName, campeonatos←totalChampionshipWins, victorias←totalRaceWins, carreras←totalRaceStarts, podios←totalPodiums, puntos←toFloat(totalPoints), origen='f1db' | `ES_DE`→Pais(countryId) |
| 5 | `Piloto` | `f1db-drivers.csv` | id, nombre←name, nombreBusqueda←normalizar(name), nombreCompleto←fullName, abreviatura←abbreviation, numero←toInteger(permanentNumber), fechaNacimiento←date(dateOfBirth), fechaMuerte←date(dateOfDeath), lugarNacimiento←placeOfBirth, campeonatos←totalChampionshipWins, victorias←totalRaceWins, podios←totalPodiums, poles←totalPolePositions, carreras←totalRaceStarts, puntos←toFloat(totalPoints), origen='f1db' | `ES_DE`→Pais(nationalityCountryId) |
| 6 | `Carrera` | `f1db-races.csv` + `f1db-grands-prix.csv` | id←toInteger(id), anio←toInteger(year), ronda←toInteger(round), nombre←officialName, granPremio←fullName del GP (join en JS por grandPrixId), fecha←date(date), vueltas←toInteger(laps) | `EN_CIRCUITO`→Circuito(circuitId), `DE_TEMPORADA`→Temporada(year) |
| 7 | `Resultado` | `f1db-races-race-results.csv` | id←`${raceId}-${positionDisplayOrder}`, posicion←toInteger(positionNumber), posicionTexto←positionText, puntos←coalesce(toFloat(points), 0.0), parrilla←toInteger(gridPositionNumber), vueltas←toInteger(laps), tiempo←time, motivoAbandono←reasonRetired, pole←toBoolean(polePosition), vueltaRapida←toBoolean(fastestLap) | `(Piloto)-[:OBTUVO]->`, `-[:EN_CARRERA]->Carrera`, `-[:CON_ESCUDERIA]->Escuderia` |
| 8 | `CORRIO_PARA` | calculado en JS con los resultados | agrupar por (driverId, constructorId, year) → `{temporada, carreras: nº de raceId distintos}` | `(Piloto)-[:CORRIO_PARA]->(Escuderia)` |
| 9 | `COMPANERO_DE` | calculado en JS con los resultados | agrupar por (raceId, constructorId) → pares (a, b) con `a.id < b.id` → `{temporadas: [años distintos], escuderias: [ids distintos], carrerasJuntos: nº de raceId distintos}`; las listas de enteros se convierten con `[t IN f.temporadas \| toInteger(t)]` | `(a)-[:COMPANERO_DE]->(b)`, **una sola vez por par** |
| 10 | `FAMILIAR_DE` | `f1db-drivers-family-relationships.csv` | tipo←type | `(Piloto {id: parentDriverId})-[:FAMILIAR_DE]->(Piloto {id: driverId})` |

Los datos ya se validaron: no hay referencias rotas. Tres carreras de 2026 todavía no tienen resultados (son las rondas que faltan por correrse).

### 3.3 Scripts auxiliares
- [ ] `scripts/reset.js`: exige el flag `--si`. Ejecuta `MATCH (n) CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 5000 ROWS` con `session.run()`, porque `IN TRANSACTIONS` requiere una transacción implícita (no sirve `executeWrite`). No borra el schema.
- [ ] `scripts/limpiar-demo.js`: borra solo los nodos con `origen = 'app'` (`DETACH DELETE`) y quita los `CORRIO_PARA` con `carreras = 0`. Así la base queda como después del seed.

**Hecho cuando** los conteos coinciden con esta tabla:

| Label | Total | | Relación | Total |
|---|---|---|---|---|
| Pais | 249 | | OBTUVO | 27 731 |
| Temporada | 77 | | EN_CARRERA | 27 731 |
| Circuito | 78 | | CON_ESCUDERIA | 27 731 |
| Escuderia | 187 | | EN_CIRCUITO | 1 172 |
| Piloto | 921 | | DE_TEMPORADA | 1 172 |
| Carrera | 1 172 | | CORRIO_PARA | 3 566 |
| Resultado | 27 731 | | COMPANERO_DE | 5 428 |
| **Total** | **30 415** | | FAMILIAR_DE | 86 |
| | | | ES_DE | 1 186 |
| | | | **Total** | **95 803** |

**Verificación:**
- `npm run seed`. Correrlo una segunda vez no debe cambiar los conteos.
- `MATCH (n) RETURN labels(n)[0] AS label, count(*) ORDER BY label` y `MATCH ()-[r]->() RETURN type(r), count(*) ORDER BY type(r)`.
- Prueba de sentido: el `shortestPath` entre `sergio-perez` y `ayrton-senna` por `COMPANERO_DE` da **4** saltos.

---

## Fase 4 — API: CRUD · P0

### 4.1 Base
- [ ] `src/app.js`: Express con `express.json()`, `morgan('dev')`, `express.static('public')`, routers bajo `/api`, un 404 en JSON para `/api/*` y el manejador de errores.
- [ ] `src/server.js`: llama a `verificarConexion()` **antes** de `listen`. Si falla, muestra un mensaje claro y `exit(1)`. Al arrancar muestra `API lista en http://localhost:3000 · BD: <host>`. Cierre limpio en SIGINT/SIGTERM.
- [ ] `src/middleware/errores.js`:
  - clase `ErrorApi(status, codigo, mensaje)`
  - el manejador mapea `Neo.ClientError.Schema.ConstraintValidationFailed` → 409 `DUPLICADO`; `ServiceUnavailable`/`SessionExpired` → 503 `BD_NO_DISPONIBLE`; `ErrorApi` → su status; cualquier otro → 500 `ERROR_INTERNO` (sin stack en la respuesta)
  - formato `{ error: { codigo, mensaje } }`
- [ ] `src/utils/validacion.js`: `esSlug` (`^[a-z0-9]+(-[a-z0-9]+)*$`), `enteroEnRango`, `fechaISO`, `textoRequerido`. Lanzan `ErrorApi(400, 'VALIDACION', …)`.
- [ ] `src/utils/neo4j-tipos.js`: convierte `Date`, `DateTime` y `Point` del driver a JSON plano (`'2026-11-08'`, `{lat, lng}`).

### 4.2 Endpoints y contratos

**Health**
- [ ] `GET /api/health` → `200 { estado: "ok", baseDeDatos: { host, servidor, nodos, relaciones, latenciaMs } }`

**Catálogos (solo lectura, para llenar los selects de la web)**
- [ ] `GET /api/paises` → `[{ id, nombre }]` ordenado por nombre
- [ ] `GET /api/circuitos` → `[{ id, nombre, ciudad, pais }]`

**Pilotos**
- [ ] `GET /api/pilotos?buscar=&limite=20` → `[{ id, nombre, abreviatura, victorias, pais }]`. `buscar` se normaliza con `normalizar()` y usa `nombreBusqueda CONTAINS`; `limite` de 1 a 100, enviado con `neo4j.int()`.
- [ ] `GET /api/pilotos/:id` → `{ ...piloto, pais }` o 404.
- [ ] `POST /api/pilotos` → 201. Body:
  ```json
  { "id": "alfredo-vieto", "nombre": "Alfredo Vieto", "abreviatura": "VIE", "numero": 9, "paisId": "costa-rica", "fechaNacimiento": null }
  ```
  Requeridos: `id` (slug), `nombre`, `paisId` (si no existe → 400). Opcionales: `abreviatura` (3 letras mayúsculas), `numero` (1–99), `fechaNacimiento` (ISO). Guarda `nombreBusqueda`, `origen: 'app'` y `creadoEn`. Si el id ya existe → 409.
- [ ] `PATCH /api/pilotos/:id` → 200. Campos permitidos: `nombre`, `abreviatura`, `numero`, `fechaNacimiento`, `lugarNacimiento`. Si cambia `nombre`, se recalcula `nombreBusqueda`. Cualquier otro campo → 400.
- [ ] `DELETE /api/pilotos/:id` → 200 `{ eliminado: id }` o 404. Borra en cascada sus `Resultado` (query DELETE de la definición).

**Escuderías**
- [ ] `GET /api/escuderias?buscar=` · `GET /api/escuderias/:id`
- [ ] `POST /api/escuderias` → body `{ id, nombre, nombreCompleto?, paisId }`
- [ ] `PATCH /api/escuderias/:id` → `nombre`, `nombreCompleto`
- [ ] `DELETE /api/escuderias/:id` → 409 `TIENE_HISTORIAL` si tiene resultados (`EXISTS { (e)<-[:CON_ESCUDERIA]-() }`); si no, `DETACH DELETE`.

**Fichajes**
- [ ] `POST /api/fichajes` → body `{ pilotoId, escuderiaId, temporada }` → 201 `{ pilotoId, escuderiaId, temporada, nuevosCompaneros: [nombres] }`. Las dos sentencias de Q8 van en **una transacción** (`enTransaccion`). Si no existe el piloto o la escudería → 404. Temporada de 1950 a 2030, enviada con `neo4j.int()`.
- [ ] `DELETE /api/fichajes/:pilotoId/:escuderiaId/:temporada` → solo si el `CORRIO_PARA` tiene `carreras = 0` (los creados por la app); los históricos → 409 `HISTORICO`. En la misma transacción quita esa temporada de los `COMPANERO_DE` con los pilotos de esa escudería y temporada, y borra los que se queden sin temporadas.

**Hecho cuando:** el CRUD completo funciona contra Aura y los errores devuelven el código correcto.
**Verificación:** `npm run dev` y probar con la colección de Postman (Fase 6) o con `Invoke-RestMethod`.

---

## Fase 5 — API: consultas de grafo · P0

Usar el Cypher de la definición §6 sin cambiar la lógica.

- [ ] `GET /api/grafo/camino?desde=&hasta=` (Q1) → `{ grados, pilotos: [{id, nombre}], conexiones: [{temporadas, escuderias}] }`. Si `desde == hasta` → 400; si alguno no existe → 404; si no hay camino → 404 `SIN_CAMINO`.
- [ ] `GET /api/grafo/pilotos/:id/vecindad?nivel=2` (Q2): `nivel` solo puede ser 1 o 2, se valida con lista blanca y se interpola. Responde `{ centro, nodos: [{id, nombre, distancia}], aristas: [{desde, hasta}] }`. Las aristas salen de:
  ```cypher
  MATCH path = (p:Piloto {id: $id})-[:COMPANERO_DE*1..2]-(v:Piloto)
  WHERE v <> p
  UNWIND relationships(path) AS r
  WITH DISTINCT r
  RETURN startNode(r).id AS desde, endNode(r).id AS hasta
  ```
- [ ] `GET /api/grafo/pilotos/:id/duelos` (Q3) → `[{ companero, escuderia, carrerasJuntos, ganadas, perdidas }]`
- [ ] `GET /api/grafo/pilotos/:id/similares` (Q4) → `[{ id, nombre, companerosEnComun, ejemplos }]`
- [ ] `GET /api/grafo/pilotos/:id/trayectoria` (Q7) → `[{ temporada, escuderiaId, escuderia, carreras }]`
- [ ] `GET /api/grafo/pilotos/:id/familia` (Q6) → `[{ id, nombre, parentesco, saltos }]`
- [ ] `GET /api/grafo/circuitos/:id/ganadores` (Q5) → `[{ piloto, victorias, anios }]`, con `anios` ordenado en JS.

**Hecho cuando:**
- `camino?desde=sergio-perez&hasta=ayrton-senna` → `grados: 4`
- `familia` de `max-verstappen` incluye a `jos-verstappen` con parentesco `["PARENT"]`
- `ganadores` de `mexico-city` devuelve resultados

---

## Fase 6 — Colección de Postman · P0

- [ ] `postman/F1-Paddock-Graph.postman_collection.json` (formato v2.1) con la variable `{{baseUrl}}`.
- [ ] `postman/F1-Paddock-Graph.postman_environment.json` con `baseUrl = http://localhost:3000`.
- [ ] Carpetas:
  1. **Health**
  2. **Pilotos (CRUD)**
  3. **Escuderías (CRUD)**
  4. **Fichajes**
  5. **Grafo**
  6. **Flujo demo** (en orden): crear piloto `alfredo-vieto` → ficharlo con `ferrari` 2026 → camino `alfredo-vieto` → `juan-manuel-fangio` → actualizar número → eliminar piloto → camino de nuevo (404 esperado)
- [ ] Cada request trae un test `pm.test` del status esperado y, cuando aplica, de la forma del body (por ejemplo `grados === 4`).

**Hecho cuando:** el Collection Runner pasa el 100% de los tests contra la API corriendo.

---

## Fase 7 — Web para la demo · P1

Una sola página (`public/index.html`, `public/app.js`, `public/styles.css`), JS vanilla con `fetch`, tema oscuro con acento rojo F1 (`#e10600`) y legible en un proyector (letra grande).

- [ ] **Encabezado:** "F1 Paddock Graph" y una insignia de estado que llama a `/api/health` y muestra el host de Aura, los nodos, las relaciones y la latencia (prueba visible de la conexión a la nube).
- [ ] **Pestañas:**
  1. **Pilotos:** buscador con resultados en vivo → ficha (datos, país, trayectoria, familia) con botones Editar y Eliminar (con confirmación); formulario "Crear piloto" (país desde `/api/paises`).
  2. **Escuderías:** listar/buscar, crear, editar y eliminar.
  3. **Fichajes:** piloto (buscador), escudería (select) y temporada → muestra los nuevos compañeros.
  4. **Grafo:**
     - *Camino más corto:* dos campos con autocompletado (`<datalist>` desde `/api/pilotos?buscar=`). Dibuja el camino con vis-network en línea horizontal y muestra, en cada arista, las temporadas y escuderías que conectan a los dos pilotos. Indica "N grados de separación".
     - *Vecindad:* grafo de vis-network con el centro destacado y los colores según la distancia (1 o 2).
     - *Duelos internos* y *Pilotos similares:* tablas.
  5. **Circuitos:** select → tabla de máximos ganadores.
- [ ] Los errores se muestran como toast con el `mensaje` de la API.
- [ ] Nada de credenciales ni de lógica de BD en el front; todo pasa por la API.

**Hecho cuando:** el guion de la demo (definición §10) se puede hacer completo desde la web en menos de 4 minutos.

---

## Fase 8 — CLI · P2

- [ ] `src/cli.js` reutiliza `services/` (no hace llamadas HTTP) e imprime con `console.table`:
  ```
  npm run cli -- health
  npm run cli -- buscar perez
  npm run cli -- piloto sergio-perez
  npm run cli -- camino sergio-perez ayrton-senna
  npm run cli -- vecindad charles-leclerc 1
  npm run cli -- duelos lewis-hamilton
  npm run cli -- similares franco-colapinto
  npm run cli -- ganadores monza
  ```
- [ ] Sin argumentos muestra la ayuda. Siempre cierra el driver al terminar.

---

## Fase 9 — README · P0

`README.md` en la raíz con:
- [ ] Descripción y captura de la web (agregarla después de la Fase 7).
- [ ] Stack y por qué se eligió un modelo de grafo (un párrafo; el detalle va en el PDF).
- [ ] Requisitos (enlace a `docs/requerimientos.md`).
- [ ] Instalación paso a paso: clonar → `npm install` → `.env` desde `.env.example` → `npm run check` → `npm run schema` → `npm run seed` → `npm run dev`.
- [ ] Tabla de scripts npm.
- [ ] Tabla de endpoints con un ejemplo de request y response por grupo.
- [ ] Modelo de grafo (mermaid de la definición §4.3).
- [ ] Estructura del repo.
- [ ] **Atribución:** "Datos: F1DB (https://github.com/f1db/f1db), licencia CC BY 4.0".

---

## Fase 10 — Pruebas finales, ensayo y material para el PDF · P1

- [ ] `scripts/smoke.js`: con la API corriendo, llama a cada endpoint GET con IDs conocidos, más un ciclo crear → fichar → camino → eliminar, e imprime OK/FAIL por endpoint. Al final deja la base limpia.
- [ ] Correr `PROFILE` de Q1, Q3 y Q4 en la consola de Aura (Query) y guardar capturas en `docs/capturas/` para la defensa (db hits y uso del índice de la constraint).
- [ ] Capturas para el PDF: web (cada pestaña), Postman Runner al 100%, consola de Aura con el grafo (Explore) y salida de `npm run seed`.
- [ ] Ensayo cronometrado del guion de la demo (definición §10).
- [ ] `npm run limpiar-demo` después de cada ensayo.

---

## Checklist del día del examen

- [ ] Aura en *Running* en console.neo4j.io (si está *Paused*, reanudar unos 5 minutos antes).
- [ ] Conectado a la red del salón → `npm run check` OK (si falla, hotspot del celular).
- [ ] `npm run limpiar-demo` → base como recién sembrada.
- [ ] `npm run dev` + navegador en `http://localhost:3000` + Postman abierto como respaldo.
- [ ] Pestañas listas: web, consola de Aura y VS Code en `src/config/neo4j.js` y `src/queries/grafo.js` para la defensa.

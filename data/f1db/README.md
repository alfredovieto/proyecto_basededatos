# Datos F1DB

- **Fuente:** [F1DB — Open Source Formula 1 Database](https://github.com/f1db/f1db), release más reciente al 17 de noviembre de 2026.
- **Licencia:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Se usan con atribución y sin modificar.
- **Cobertura del archivo:** temporadas 1950 a 2026. **El seed solo usa 2000–2025** (filtra por año).

| Archivo | Filas | Se usa para |
|---|---|---|
| `f1db-countries.csv` | 249 | `Pais` (solo los que usa alguien) |
| `f1db-constructors.csv` | 187 | `Escuderia` (39 de 2000–2025) |
| `f1db-drivers.csv` | 921 | `Piloto` (190: titulares, reservas y pilotos-director) |
| `f1db-races-race-results.csv` | 27 731 | derivar `CORRIO_PARA` y `COMPANERO_DE` (10 562 filas de 2000–2025; no se crean nodos de carrera) |
| `f1db-drivers-family-relationships.csv` | 86 | `FAMILIAR_DE` |
| `f1db-seasons-driver-standings.csv` | 1 683 | juego: rating de pilotos por temporada (`CORRIO_PARA.rating`) |
| `f1db-seasons-constructor-standings.csv` | 721 | juego: rating de directores por temporada (`DIRIGIO.rating`) |
| `f1db-seasons-entrants-drivers.csv` | 3 886 | juego: pilotos de reserva (`RESERVA_DE`, filas con `testDriver = true`) |

El seed (`scripts/seed.js`) lee estos archivos; no se descarga nada en tiempo de ejecución.

Los directores de equipo **no** vienen en F1DB: están en `data/curado/directores.csv` (fuente: Wikipedia, CC BY-SA).

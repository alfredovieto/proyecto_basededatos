# Datos F1DB

- **Fuente:** [F1DB — Open Source Formula 1 Database](https://github.com/f1db/f1db), release más reciente al 17 de noviembre de 2026.
- **Licencia:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Se usan con atribución y sin modificar.
- **Cobertura:** temporadas 1950 a 2026 (resultados hasta el GP de São Paulo 2026, ronda 20).

| Archivo | Filas | Se usa para |
|---|---|---|
| `f1db-countries.csv` | 249 | `Pais` |
| `f1db-circuits.csv` | 78 | `Circuito` |
| `f1db-constructors.csv` | 187 | `Escuderia` |
| `f1db-drivers.csv` | 921 | `Piloto` |
| `f1db-grands-prix.csv` | 54 | nombre del GP en `Carrera` |
| `f1db-races.csv` | 1 172 | `Carrera`, `Temporada` |
| `f1db-races-race-results.csv` | 27 731 | `Resultado`, `CORRIO_PARA`, `COMPANERO_DE` |
| `f1db-drivers-family-relationships.csv` | 86 | `FAMILIAR_DE` |

El seed (`scripts/seed.js`) lee estos archivos; no se descarga nada en tiempo de ejecución.

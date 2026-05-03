# stats19-pedestrian-danger

Pedestrian danger patterns dashboard built from DfT STATS19 road safety data.

## Scope

- Analyse pedestrian casualty records from the latest five validated STATS19 years.
- Use precomputed outputs so the dashboard remains responsive.
- Keep native STATS19 danger-pattern analysis separate from inferred vehicle-shape signals.
- Treat vehicle shape as an inferred model-family classification with reviewed taxonomy rows only.

## Project Layout

- `app/` - static dashboard application.
- `data/raw/` - local downloaded DfT CSVs, ignored by git.
- `data/taxonomies/` - reviewed model-family taxonomy inputs.
- `docs/` - project decisions and data notes.
- `outputs/dashboard/` - generated compact dashboard data.
- `outputs/taxonomy_review/` - generated taxonomy review candidates.
- `scripts/` - download and build pipeline scripts.

# Decisions

## Product Framing

The dashboard focuses on vulnerable-road-user danger patterns first. Vehicle
shape is a separate signal, not part of the native danger-pattern ranking.

## V1 Scope

- Pedestrian casualty records only.
- Latest five validated STATS19 years.
- Pooled analysis, not year-by-year rankings.
- Precomputed dashboard outputs.
- Two-condition danger patterns using native STATS19 fields.

## Evidence Labels

- `stable`: at least 100 pedestrian casualties and 20 KSI casualties.
- `insufficient_sample`: below either threshold.

## Vehicle Shape

Vehicle shape uses a manual reviewed taxonomy from `generic_make_model` to:

- `suv_crossover`
- `other_passenger_car`
- `unknown_or_unclassified`

Only `review_status = reviewed` rows can produce a classified shape. All other
rows are treated as `unknown_or_unclassified`.


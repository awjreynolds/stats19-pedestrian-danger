# STATS19 Pedestrian Danger Dashboard

This context defines the language for a public dashboard that summarises pedestrian casualty danger patterns from DfT STATS19 road safety data.

## Language

**Complete V1**:
The dashboard is deployed with real latest-five-year pedestrian casualty, KSI, Danger Pattern, joined Vehicle Shape Signal data, visible Taxonomy Coverage, and no knowingly-placeholder section.
_Avoid_: Done, finished, complete when Vehicle Shape Signals are structurally unable to classify vehicles.

**Vehicle Shape Signal**:
An inferred count of pedestrian casualties by reviewed passenger-vehicle model-family shape class.
_Avoid_: Vehicle type, detailed body-style taxonomy, model signal.

**Not Passenger Car**:
A pedestrian casualty whose **Associated Vehicle** is not passenger-car eligible.
_Avoid_: Unknown car, other passenger car.

**SUV/Crossover**:
A reviewed passenger vehicle model family used as the V1 higher-front bonnet-height proxy.
_Avoid_: Tall vehicle, high-front vehicle, MPV unless explicitly reviewed as SUV/crossover.

**Reviewed Shape Taxonomy**:
A source-backed manual mapping from STATS19 `generic_make_model` values to dashboard shape classes.
_Avoid_: Automatic classifier, keyword rules, complete model database.

**Classifiable Taxonomy Row**:
A **Reviewed Shape Taxonomy** row with `review_status = reviewed`, `confidence = high`, and a source URL.
_Avoid_: Low-confidence reviewed row, unreviewed candidate.

**Passenger Car Eligible Vehicle**:
An **Associated Vehicle** whose STATS19 `vehicle_type` is car (`9`) or taxi/private hire car (`8`).
_Avoid_: All vehicles with model names, non-car associated vehicles.

**Taxonomy Coverage**:
The share of associated pedestrian casualties with present `generic_make_model` values whose model family appears in the **Reviewed Shape Taxonomy**.
_Avoid_: Accuracy, completeness.

**Complete Taxonomy Coverage**:
Visible **Taxonomy Coverage** with a red, amber, or green signal-strength band.
_Avoid_: Hidden coverage, best-effort coverage.

**Signal Strength Band**:
A red, amber, or green disclosure of how much eligible passenger-car model-family data is covered by source-backed taxonomy review.
_Avoid_: Correlation, causation, proof.

**Taxonomy Review Queue**:
A ranked list of unclassified passenger-car model families ordered by associated pedestrian casualty count.
_Avoid_: Alphabetical review, unprioritised taxonomy backlog.

**Associated Vehicle**:
The vehicle row in the same collision whose `vehicle_reference` matches the pedestrian casualty row.
_Avoid_: Primary vehicle, every collision vehicle.

**Danger Pattern**:
A ranked two-condition combination of native STATS19 casualty fields associated with KSI harm.
_Avoid_: Shape pattern, inferred pattern.

**KSI Casualty**:
A pedestrian casualty recorded as fatal or serious.
_Avoid_: Severe accident, high-risk incident.

## Relationships

- A **Complete V1** includes both **Danger Pattern** data and **Vehicle Shape Signal** data.
- A **Danger Pattern** uses native STATS19 casualty fields only.
- A **Vehicle Shape Signal** classifies the **Associated Vehicle** for each pedestrian casualty.
- A **Vehicle Shape Signal** for **Complete V1** displays **SUV/Crossover**, other passenger car, unknown/unclassified, and **Not Passenger Car** counts.
- An **Associated Vehicle** belongs to exactly one pedestrian casualty row for shape-signal counting purposes.
- A **Reviewed Shape Taxonomy** can be coverage-based rather than exhaustive.
- **Taxonomy Coverage** is calculated over **Passenger Car Eligible Vehicle** rows with present, non-redacted `generic_make_model` values.
- **Taxonomy Coverage** excludes missing, redacted, unreported, and **Not Passenger Car** values from its denominator.
- **Complete V1** requires **Complete Taxonomy Coverage** as a visible disclosure, not a deployment gate.
- A **Signal Strength Band** is red below 50% **Taxonomy Coverage**, amber from 50% to 79%, and green at 80% or above.
- **Complete V1** aims for green **Signal Strength Band** through ranked review, but can finish below green if actual coverage is disclosed honestly.
- Every reviewed row in the **Reviewed Shape Taxonomy** has a source URL.
- A **Vehicle Shape Signal** only uses **Classifiable Taxonomy Row** entries.
- A **Vehicle Shape Signal** only classifies **Passenger Car Eligible Vehicle** rows as SUV/crossover or other passenger car.
- A **Taxonomy Review Queue** drives review work until **Complete Taxonomy Coverage** is reached.

## Example dialogue

> **Dev:** "Can we call V1 complete if the shape tab only shows unknown vehicles?"
> **Domain expert:** "No — **Complete V1** requires meaningful **Vehicle Shape Signal** data, not a structurally unclassifiable placeholder."

> **Dev:** "In a multi-vehicle collision, do we classify every vehicle?"
> **Domain expert:** "No — classify the **Associated Vehicle** named by the pedestrian casualty row's `vehicle_reference`."

> **Dev:** "Does the taxonomy need every model ever seen in STATS19?"
> **Domain expert:** "No — the **Reviewed Shape Taxonomy** needs enough **Taxonomy Coverage** for a meaningful V1 signal, with the long tail left unknown."

> **Dev:** "Can we classify a model from memory or a keyword rule?"
> **Domain expert:** "No — **Reviewed Shape Taxonomy** rows need a source URL so the public signal is auditable."

> **Dev:** "Can a low-confidence reviewed row count toward the public shape signal?"
> **Domain expert:** "No — only a **Classifiable Taxonomy Row** can classify an associated vehicle."

> **Dev:** "If a bus has a model name, should it count as other passenger car?"
> **Domain expert:** "No — only a **Passenger Car Eligible Vehicle** enters the SUV/crossover versus other passenger car split."

> **Dev:** "Do non-car associated vehicles go into unknown?"
> **Domain expert:** "No — show them as **Not Passenger Car** so unknown means passenger-car shape could not be classified."

> **Dev:** "Does a bus casualty lower taxonomy coverage?"
> **Domain expert:** "No — **Taxonomy Coverage** is only about passenger-car eligible model families that could reasonably be reviewed."

> **Dev:** "Can we deploy at 72% coverage with a warning?"
> **Domain expert:** "Yes — disclose amber **Signal Strength Band** and the exact **Taxonomy Coverage**."

> **Dev:** "Do we keep reviewing until green no matter how long it takes?"
> **Domain expert:** "No — aim for green with the **Taxonomy Review Queue**, but **Complete V1** can finish below green if coverage and signal strength are explicit."

> **Dev:** "Should we review model families alphabetically?"
> **Domain expert:** "No — use the **Taxonomy Review Queue** so the highest-casualty unclassified model families are reviewed first."

> **Dev:** "Can we publish the shape tab without saying how much model-family data was covered?"
> **Domain expert:** "No — **Complete Taxonomy Coverage** must be visible so users can judge the **Vehicle Shape Signal**."

> **Dev:** "Should we split passenger cars into hatchback, saloon, estate, MPV, and more?"
> **Domain expert:** "No — that is too noisy. The V1 signal uses **SUV/Crossover** as the bonnet-height proxy."

## Flagged ambiguities

- "Finished" was resolved to mean **Complete V1**, including meaningful **Vehicle Shape Signal** data.
- "Vehicle for a casualty" was resolved to mean the **Associated Vehicle**, not every vehicle in the collision.
- "Complete taxonomy" was resolved as coverage-based **Reviewed Shape Taxonomy**, not strict classification of every model family.
- "Enough coverage" was resolved as visible **Complete Taxonomy Coverage** with a **Signal Strength Band**, not a hard 80% deployment gate.
- "Shape classes" was resolved as the simple **Higher-Front Passenger Vehicle** split for **Complete V1**, because detailed body styles are too noisy for the bonnet-height question.
- "Higher-front proxy" was resolved as **SUV/Crossover** only for **Complete V1**.
- "Reviewed" was resolved to mean source-backed manual review with a URL for every reviewed taxonomy row.
- "Classified" was resolved to require a **Classifiable Taxonomy Row**: reviewed, high confidence, and source-backed.
- "Passenger car" was resolved as STATS19 `vehicle_type` values `8` and `9`; non-car associated vehicles are not folded into other passenger car.
- "Non-car associated vehicles" was resolved as a separate **Not Passenger Car** displayed count.
- "Coverage denominator" was resolved as passenger-car eligible associated vehicles with present, non-redacted model-family values.
- "Coverage below 80%" was resolved as red or amber **Signal Strength Band**, not a failed deployment.
- "Taxonomy review workflow" was resolved as a casualty-ranked **Taxonomy Review Queue** feeding source-backed CSV review.
- "Nothing left" was resolved as **Complete V1** with joined Vehicle Shape Signals, visible coverage, and honest **Signal Strength Band**, aiming for green but not blocked by it.

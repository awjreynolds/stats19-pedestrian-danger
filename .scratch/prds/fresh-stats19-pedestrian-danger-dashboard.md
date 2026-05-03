# PRD: Fresh STATS19 Pedestrian Danger Dashboard

Labels: `needs-triage`

## Problem Statement

People trying to understand pedestrian danger from STATS19 data need a dashboard that highlights where serious harm is concentrated without mixing native police-recorded factors with inferred vehicle-shape analysis. Existing raw STATS19 tables are too large and detailed for quick exploration, while vehicle-shape claims can become misleading if they are blended directly into native danger-pattern rankings.

The dashboard must make pedestrian casualty records understandable for the latest five validated STATS19 years, using pooled data and KSI casualties as the primary harm metric. It must clearly separate Danger Patterns based only on native STATS19 fields from Vehicle Shape Signals based on a reviewed model-family taxonomy.

## Solution

Build a fresh static dashboard backed by precomputed STATS19 outputs. V1 will analyse pedestrian casualty records from the latest five validated STATS19 years, pooled across years. It will rank 2-condition Danger Patterns using native STATS19 fields only, with KSI casualties as the primary harm metric and evidence labels based on agreed sample thresholds.

Vehicle Shape Signals will be a separate dashboard tab. It will use only reviewed `generic_make_model` taxonomy rows and classify records into `suv_crossover`, `other_passenger_car`, or `unknown_or_unclassified`. The vehicle-shape signal is explicitly separate from the native Danger Patterns ranking.

## User Stories

1. As a road safety analyst, I want to see the latest five validated STATS19 years pooled together, so that the dashboard reflects current patterns without over-weighting a single year.
2. As a road safety analyst, I want the dashboard to focus on pedestrian casualty records, so that the analysis stays scoped to vulnerable road users.
3. As a campaign researcher, I want KSI casualties to be the primary harm metric, so that the dashboard prioritises serious and fatal injury patterns.
4. As a campaign researcher, I want total pedestrian casualty counts shown alongside KSI counts, so that I can understand both scale and severity.
5. As a policy user, I want Danger Patterns to use native STATS19 fields only, so that each ranking is traceable to the source dataset rather than inferred categories.
6. As a policy user, I want each Danger Pattern to combine exactly two conditions, so that patterns remain interpretable and comparable.
7. As a dashboard user, I want Danger Patterns ranked by harm, so that the most important patterns are visible first.
8. As a dashboard user, I want each Danger Pattern to show its label, casualty count, KSI count, KSI rate, and evidence label, so that I can judge both impact and reliability.
9. As a dashboard user, I want patterns with at least 100 pedestrian casualties and at least 20 KSI casualties marked `stable`, so that I know which findings have enough sample behind them.
10. As a dashboard user, I want patterns below either threshold marked `insufficient_sample`, so that low-sample findings are not over-interpreted.
11. As a maintainer, I want dashboard data to be precomputed, so that the static dashboard remains responsive.
12. As a maintainer, I want compact output files for metadata, Danger Patterns, and Vehicle Shape Signals, so that the frontend has a simple and stable data contract.
13. As a maintainer, I want metadata to include data period, pedestrian casualty count, KSI count, and source notes, so that the dashboard can explain what data it represents.
14. As a data reviewer, I want vehicle shape derived only from reviewed taxonomy rows, so that unreviewed model-family guesses do not become dashboard facts.
15. As a data reviewer, I want unreviewed, missing, or unmatched model-family rows classified as `unknown_or_unclassified`, so that uncertainty is preserved.
16. As a data reviewer, I want vehicle shape limited to `suv_crossover`, `other_passenger_car`, and `unknown_or_unclassified`, so that V1 has a small, reviewable taxonomy.
17. As a dashboard user, I want Vehicle Shape Signals in a separate tab, so that inferred vehicle-shape analysis is not confused with native STATS19 Danger Patterns.
18. As a dashboard user, I want clear tab navigation between overview, Danger Patterns, and Vehicle Shape Signals, so that I can move between summary and detail.
19. As a dashboard user, I want empty or not-yet-built data states to render gracefully, so that the dashboard remains usable before the full data pipeline is run.
20. As a maintainer, I want output checks to fail when required dashboard files are missing, so that incomplete builds are caught early.
21. As a maintainer, I want output checks to validate schema expectations, so that frontend rendering does not silently break.
22. As a maintainer, I want output checks to enforce evidence-label threshold rules, so that sample confidence is applied consistently.
23. As a maintainer, I want output checks to enforce vehicle taxonomy constraints, so that only reviewed taxonomy rows produce classified shape signals.
24. As a maintainer, I want the build pipeline to keep native STATS19 Danger Patterns separate from inferred Vehicle Shape Signals, so that future work cannot accidentally blend the concepts.
25. As a maintainer, I want domain terms such as pedestrian casualty record, KSI, Danger Pattern, evidence label, and Vehicle Shape Signal used consistently, so that future issues and implementation work stay aligned.

## Implementation Decisions

- Use pedestrian casualty records as the primary analysis row.
- Use the latest five validated STATS19 years.
- Pool the five-year window for V1 rather than producing year-by-year rankings.
- Treat KSI casualties as the primary harm metric.
- Generate Danger Patterns from native STATS19 fields only.
- Limit V1 Danger Patterns to exactly two conditions.
- Rank Danger Patterns by KSI harm while retaining casualty count, KSI count, and KSI rate.
- Apply `stable` when a pattern has at least 100 pedestrian casualties and at least 20 KSI casualties.
- Apply `insufficient_sample` when a pattern falls below either sample threshold.
- Keep Vehicle Shape Signals separate from Danger Patterns in both data generation and presentation.
- Classify vehicle shape from reviewed `generic_make_model` taxonomy rows only.
- Use exactly three vehicle shape output classes in V1: `suv_crossover`, `other_passenger_car`, and `unknown_or_unclassified`.
- Treat unreviewed, missing, and unmatched taxonomy inputs as `unknown_or_unclassified`.
- Precompute dashboard outputs so the browser loads compact JSON instead of processing raw STATS19 tables.
- Keep the dashboard static for V1.
- Organise the implementation around deep modules with stable interfaces:
  - STATS19 input normalization.
  - Danger Pattern generation and ranking.
  - Vehicle Shape Signal classification.
  - Dashboard output contract generation.
  - Static dashboard rendering.
  - Output validation.

## Testing Decisions

- Tests should verify external behavior and data contracts rather than implementation details.
- Test STATS19 input normalization by checking pedestrian casualty filtering, latest-five-year selection, and KSI derivation.
- Test Danger Pattern generation by checking 2-condition combinations, native-field-only constraints, ranking behavior, and output metrics.
- Test evidence labels by checking both threshold boundaries: at least 100 casualties and at least 20 KSI for `stable`, and either value below threshold for `insufficient_sample`.
- Test Vehicle Shape Signal classification by checking reviewed taxonomy matches, unreviewed taxonomy rows, missing model-family values, unmatched model-family values, and the three allowed output classes.
- Test the dashboard output contract by validating metadata, Danger Patterns, and Vehicle Shape Signals against expected schemas.
- Test output validation by confirming it fails for missing files, invalid schemas, incorrect evidence labels, and invalid taxonomy classifications.
- Add a lightweight dashboard rendering smoke test so empty and populated output states render without breaking the UI.
- Use existing output-checking conventions as prior art for build verification, while expanding them from presence checks into behavioral contract checks.

## Out of Scope

- Year-by-year rankings.
- Collision-level analysis not based on pedestrian casualty records.
- Damage-only collisions or unreported incidents.
- Native Danger Patterns using inferred vehicle-shape categories.
- More than two conditions per Danger Pattern.
- Unreviewed model-family taxonomy classifications.
- Additional vehicle shape classes beyond `suv_crossover`, `other_passenger_car`, and `unknown_or_unclassified`.
- Interactive raw-data querying in the browser.
- Backend service infrastructure.
- Causal claims about why a danger pattern occurs.

## Further Notes

STATS19 records reported personal-injury collisions, not all road danger. Geography is a reporting and filtering layer, not a behavioural explanation. Vehicle shape is an inferred model-family classification and should remain clearly described as such wherever it appears.

This PRD should enter triage with the `needs-triage` label. It can later be split into independently grabbable implementation issues for the data pipeline, output validation, and dashboard UI.

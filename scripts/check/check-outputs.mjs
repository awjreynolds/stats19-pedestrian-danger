import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const outputDir =
  process.env.DASHBOARD_OUTPUT_DIR ??
  fileURLToPath(new URL("../../outputs/dashboard/", import.meta.url));
const taxonomyReviewOutputDir =
  process.env.TAXONOMY_REVIEW_OUTPUT_DIR ??
  fileURLToPath(new URL("../../outputs/taxonomy_review/", import.meta.url));
const indexPath =
  process.env.DASHBOARD_INDEX_PATH ??
  fileURLToPath(new URL("../../index.html", import.meta.url));
const taxonomyPath =
  process.env.MODEL_SHAPE_TAXONOMY_PATH ??
  fileURLToPath(new URL("../../data/taxonomies/model_shape_v1.csv", import.meta.url));
const outputDirUrl = pathToFileURL(`${outputDir}/`);
const taxonomyUrl = pathToFileURL(taxonomyPath);
const taxonomyReviewOutputDirUrl = pathToFileURL(`${taxonomyReviewOutputDir}/`);
const requiredFiles = [
  taxonomyPath,
];

for (const file of requiredFiles) {
  await readFile(file, "utf8");
}

const dashboardHtml = await readFile(indexPath, "utf8");
const taxonomyRows = parseCsv(await readFile(taxonomyUrl, "utf8"));

const dashboardFiles = ["metadata.json", "patterns.json", "shape-signals.json"];
const inferredPatternFields = new Set(["generic_make_model", "shape_class"]);
const shapeSignalCountFields = [
  "suvCrossover",
  "otherPassengerCar",
  "unknownOrUnclassified",
  "notPassengerCar",
];
const shapeSignalFields = [
  ...shapeSignalCountFields,
  "taxonomyCoverage",
];
const maxDashboardPatterns = 50;
const signalStrengthBands = new Set(["red", "amber", "green"]);

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].replace(/^\uFEFF/, "").split(",");
  return rows.slice(1).map((row) => {
    const values = row.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

for (const file of dashboardFiles) {
  await readFile(new URL(file, outputDirUrl), "utf8");
}

const metadata = JSON.parse(
  await readFile(new URL("metadata.json", outputDirUrl), "utf8"),
);
const patterns = JSON.parse(
  await readFile(new URL("patterns.json", outputDirUrl), "utf8"),
);
const shapeSignals = JSON.parse(
  await readFile(new URL("shape-signals.json", outputDirUrl), "utf8"),
);
const taxonomyReviewQueue = JSON.parse(
  await readFile(new URL("queue.json", taxonomyReviewOutputDirUrl), "utf8"),
);

function assertStringField(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`metadata.${field} must be a non-empty string`);
  }
}

function assertCountField(value, field) {
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`metadata.${field} must be a non-negative integer or null`);
  }
}

assertStringField(metadata.dataPeriod, "dataPeriod");
assertCountField(metadata.casualtyCount, "casualtyCount");
assertCountField(metadata.ksiCount, "ksiCount");
assertStringField(metadata.source, "source");
if (
  metadata.casualtyCount !== null &&
  metadata.ksiCount !== null &&
  metadata.ksiCount > metadata.casualtyCount
) {
  throw new Error("metadata.ksiCount must not exceed metadata.casualtyCount");
}

function assertNumberField(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`pattern.${field} must be a non-negative number`);
  }
}

function expectedEvidenceLabel(pattern) {
  return pattern.casualtyCount >= 100 && pattern.ksiCount >= 20
    ? "stable"
    : "insufficient_sample";
}

function assertNativePatternCondition(condition) {
  assertStringField(condition.field, "condition.field");
  assertStringField(condition.value, "condition.value");
  if (
    inferredPatternFields.has(condition.field) ||
    condition.field.toLowerCase().includes("shape")
  ) {
    throw new Error("pattern.conditions must use native STATS19 fields only");
  }
}

if (!Array.isArray(patterns)) {
  throw new Error("patterns must be an array");
}
if (patterns.length > maxDashboardPatterns) {
  throw new Error(`patterns must contain at most ${maxDashboardPatterns} dashboard rows`);
}

for (const [index, pattern] of patterns.entries()) {
  assertStringField(pattern.label, `patterns[${index}].label`);
  if (!Array.isArray(pattern.conditions) || pattern.conditions.length !== 2) {
    throw new Error(`pattern.conditions must contain exactly two conditions`);
  }
  pattern.conditions.forEach(assertNativePatternCondition);
  assertCountField(pattern.casualtyCount, "casualtyCount");
  assertCountField(pattern.ksiCount, "ksiCount");
  assertNumberField(pattern.ksiRate, "ksiRate");
  if (pattern.ksiCount > pattern.casualtyCount) {
    throw new Error("pattern.ksiCount must not exceed pattern.casualtyCount");
  }
  const expectedKsiRate = pattern.casualtyCount === 0 ? 0 : pattern.ksiCount / pattern.casualtyCount;
  if (Math.abs(pattern.ksiRate - expectedKsiRate) > Number.EPSILON) {
    throw new Error("pattern.ksiRate must equal pattern.ksiCount / pattern.casualtyCount");
  }
  if (pattern.evidenceLabel !== expectedEvidenceLabel(pattern)) {
    throw new Error(`pattern.evidenceLabel contradicts sample thresholds`);
  }
}

for (const field of shapeSignalCountFields) {
  assertCountField(shapeSignals[field], field);
}

for (const field of Object.keys(shapeSignals)) {
  if (!shapeSignalFields.includes(field)) {
    throw new Error(`unsupported shape signal field: ${field}`);
  }
}

function expectedSignalStrengthBand(percentage) {
  if (percentage >= 0.8) {
    return "green";
  }
  if (percentage >= 0.5) {
    return "amber";
  }
  return "red";
}

if (shapeSignals.taxonomyCoverage !== undefined) {
  const coverage = shapeSignals.taxonomyCoverage;
  if (typeof coverage !== "object" || coverage === null || Array.isArray(coverage)) {
    throw new Error("shapeSignals.taxonomyCoverage must be an object");
  }
  assertCountField(coverage.coveredCount, "taxonomyCoverage.coveredCount");
  assertCountField(coverage.denominatorCount, "taxonomyCoverage.denominatorCount");
  if (
    coverage.percentage !== null &&
    (!Number.isFinite(coverage.percentage) ||
      coverage.percentage < 0 ||
      coverage.percentage > 1)
  ) {
    throw new Error("taxonomyCoverage.percentage must be between 0 and 1 or null");
  }
  if (
    coverage.signalStrengthBand !== null &&
    !signalStrengthBands.has(coverage.signalStrengthBand)
  ) {
    throw new Error("taxonomyCoverage.signalStrengthBand must be red, amber, green, or null");
  }
  if (
    coverage.coveredCount !== null &&
    coverage.denominatorCount !== null &&
    coverage.percentage !== null
  ) {
    if (coverage.coveredCount > coverage.denominatorCount) {
      throw new Error("taxonomyCoverage.coveredCount must not exceed denominatorCount");
    }
    const expectedPercentage =
      coverage.denominatorCount === 0 ? 0 : coverage.coveredCount / coverage.denominatorCount;
    if (Math.abs(coverage.percentage - expectedPercentage) > Number.EPSILON) {
      throw new Error("taxonomyCoverage.percentage must equal coveredCount / denominatorCount");
    }
    if (coverage.signalStrengthBand !== expectedSignalStrengthBand(coverage.percentage)) {
      throw new Error("taxonomyCoverage.signalStrengthBand contradicts coverage percentage");
    }
  }
}

for (const row of taxonomyRows) {
  if (row.review_status !== "reviewed") {
    continue;
  }
  if (row.confidence !== "high" || !row.source_url?.trim()) {
    throw new Error(
      `reviewed taxonomy row ${row.generic_make_model || "(unknown model)"} must have high confidence and a source URL`,
    );
  }
}

if (!Array.isArray(taxonomyReviewQueue)) {
  throw new Error("taxonomy review queue must be an array");
}

let previousQueueRow = null;
for (const [index, queueRow] of taxonomyReviewQueue.entries()) {
  assertStringField(queueRow.modelFamily, `taxonomyReviewQueue[${index}].modelFamily`);
  assertCountField(
    queueRow.associatedPedestrianCasualtyCount,
    `taxonomyReviewQueue[${index}].associatedPedestrianCasualtyCount`,
  );
  assertCountField(queueRow.ksiCount, `taxonomyReviewQueue[${index}].ksiCount`);
  assertStringField(
    queueRow.currentClassificationStatus,
    `taxonomyReviewQueue[${index}].currentClassificationStatus`,
  );
  if (queueRow.ksiCount > queueRow.associatedPedestrianCasualtyCount) {
    throw new Error("taxonomy review queue KSI count must not exceed casualty count");
  }
  if (
    previousQueueRow &&
    (previousQueueRow.associatedPedestrianCasualtyCount <
      queueRow.associatedPedestrianCasualtyCount ||
      (previousQueueRow.associatedPedestrianCasualtyCount ===
        queueRow.associatedPedestrianCasualtyCount &&
        previousQueueRow.modelFamily.localeCompare(queueRow.modelFamily) > 0))
  ) {
    throw new Error("taxonomy review queue must be sorted deterministically");
  }
  previousQueueRow = queueRow;
}

function assertDashboardHook(pattern, message) {
  if (!pattern.test(dashboardHtml)) {
    throw new Error(`dashboard render smoke failed: ${message}`);
  }
}

assertDashboardHook(/data-field=["']dataPeriod["']/, "missing data period field");
assertDashboardHook(/data-field=["']casualtyCount["']/, "missing casualty count field");
assertDashboardHook(/data-field=["']ksiCount["']/, "missing KSI count field");
assertDashboardHook(/data-field=["']patternStatus["']/, "missing pattern status field");
assertDashboardHook(/id=["']patterns-body["']/, "missing patterns table body");
assertDashboardHook(/id=["']shape-grid["']/, "missing shape grid");
assertDashboardHook(/SUV\/crossover/, "missing SUV/crossover shape label");
assertDashboardHook(/Other passenger car/, "missing other passenger car shape label");
assertDashboardHook(/Unknown or unclassified/, "missing unknown shape label");
assertDashboardHook(/Not passenger car/, "missing not passenger car shape label");

const shapeGridMatch = dashboardHtml.match(/<[^>]+id=["']shape-grid["'][\s\S]*?<\/div>/);
const shapeValueSlotCount = shapeGridMatch?.[0].match(/<strong\b/g)?.length ?? 0;
if (shapeValueSlotCount < shapeSignalCountFields.length) {
  throw new Error("dashboard render smoke failed: missing shape signal value slots");
}

console.log(`Checked ${requiredFiles.length + dashboardFiles.length + 1} required files.`);

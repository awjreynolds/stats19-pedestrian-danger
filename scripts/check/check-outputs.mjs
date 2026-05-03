import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const outputDir =
  process.env.DASHBOARD_OUTPUT_DIR ??
  fileURLToPath(new URL("../../outputs/dashboard/", import.meta.url));
const indexPath =
  process.env.DASHBOARD_INDEX_PATH ??
  fileURLToPath(new URL("../../index.html", import.meta.url));
const outputDirUrl = pathToFileURL(`${outputDir}/`);
const requiredFiles = [
  "data/taxonomies/model_shape_v1.csv",
];

for (const file of requiredFiles) {
  await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
}

const dashboardHtml = await readFile(indexPath, "utf8");

const dashboardFiles = ["metadata.json", "patterns.json", "shape-signals.json"];
const inferredPatternFields = new Set(["generic_make_model", "shape_class"]);
const shapeSignalFields = ["suvCrossover", "otherPassengerCar", "unknownOrUnclassified"];
const maxDashboardPatterns = 50;

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

for (const field of shapeSignalFields) {
  assertCountField(shapeSignals[field], field);
}

for (const field of Object.keys(shapeSignals)) {
  if (!shapeSignalFields.includes(field)) {
    throw new Error(`unsupported shape signal field: ${field}`);
  }
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

const shapeGridMatch = dashboardHtml.match(/<[^>]+id=["']shape-grid["'][\s\S]*?<\/div>/);
const shapeValueSlotCount = shapeGridMatch?.[0].match(/<strong\b/g)?.length ?? 0;
if (shapeValueSlotCount < shapeSignalFields.length) {
  throw new Error("dashboard render smoke failed: missing shape signal value slots");
}

console.log(`Checked ${requiredFiles.length + dashboardFiles.length} required files.`);

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const outputDir =
  process.env.DASHBOARD_OUTPUT_DIR ??
  fileURLToPath(new URL("../../outputs/dashboard/", import.meta.url));
const outputDirUrl = pathToFileURL(`${outputDir}/`);
const requiredFiles = [
  "data/taxonomies/model_shape_v1.csv",
  "index.html",
];

for (const file of requiredFiles) {
  await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
}

const dashboardFiles = ["metadata.json", "patterns.json", "shape-signals.json"];
const inferredPatternFields = new Set(["generic_make_model", "shape_class"]);

for (const file of dashboardFiles) {
  await readFile(new URL(file, outputDirUrl), "utf8");
}

const metadata = JSON.parse(
  await readFile(new URL("metadata.json", outputDirUrl), "utf8"),
);
const patterns = JSON.parse(
  await readFile(new URL("patterns.json", outputDirUrl), "utf8"),
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

for (const [index, pattern] of patterns.entries()) {
  assertStringField(pattern.label, `patterns[${index}].label`);
  if (!Array.isArray(pattern.conditions) || pattern.conditions.length !== 2) {
    throw new Error(`pattern.conditions must contain exactly two conditions`);
  }
  pattern.conditions.forEach(assertNativePatternCondition);
  assertCountField(pattern.casualtyCount, "casualtyCount");
  assertCountField(pattern.ksiCount, "ksiCount");
  assertNumberField(pattern.ksiRate, "ksiRate");
  if (pattern.evidenceLabel !== expectedEvidenceLabel(pattern)) {
    throw new Error(`pattern.evidenceLabel contradicts sample thresholds`);
  }
}

console.log(`Checked ${requiredFiles.length + dashboardFiles.length} required files.`);

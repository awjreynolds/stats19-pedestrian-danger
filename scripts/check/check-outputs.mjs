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

for (const file of dashboardFiles) {
  await readFile(new URL(file, outputDirUrl), "utf8");
}

const metadata = JSON.parse(
  await readFile(new URL("metadata.json", outputDirUrl), "utf8"),
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

console.log(`Checked ${requiredFiles.length + dashboardFiles.length} required files.`);

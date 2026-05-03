import { readFile } from "node:fs/promises";

const requiredFiles = [
  "outputs/dashboard/metadata.json",
  "outputs/dashboard/patterns.json",
  "outputs/dashboard/shape-signals.json",
  "data/taxonomies/model_shape_v1.csv",
  "index.html",
];

for (const file of requiredFiles) {
  await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
}

console.log(`Checked ${requiredFiles.length} required files.`);


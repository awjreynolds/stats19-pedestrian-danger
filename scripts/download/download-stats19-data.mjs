import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";

const rawDir =
  process.env.STATS19_RAW_DIR ??
  fileURLToPath(new URL("../../data/raw/", import.meta.url));
const latestValidatedYears = [2020, 2021, 2022, 2023, 2024];
const baseUrl = "https://data.dft.gov.uk/road-accidents-safety-data/";
const datasets = ["casualty", "vehicle"];

await mkdir(rawDir, { recursive: true });

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to download ${url}: ${response.status}`);
  }
  await response.body.pipeTo(Writable.toWeb(createWriteStream(destination)));
}

for (const year of latestValidatedYears) {
  for (const dataset of datasets) {
    const filename = `dft-road-casualty-statistics-${dataset}-${year}.csv`;
    const url = `${baseUrl}${filename}`;
    const destination = join(rawDir, basename(filename));

    console.log(`Downloading ${filename}`);
    await download(url, destination);
  }
}

console.log(`Downloaded ${latestValidatedYears.length * datasets.length} STATS19 files.`);

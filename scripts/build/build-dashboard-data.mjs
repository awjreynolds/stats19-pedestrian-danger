import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const source = "DfT STATS19 road safety open data";
const outputDir =
  process.env.DASHBOARD_OUTPUT_DIR ??
  fileURLToPath(new URL("../../outputs/dashboard/", import.meta.url));
const rawDir =
  process.env.STATS19_RAW_DIR ??
  fileURLToPath(new URL("../../data/raw/", import.meta.url));
const outputDirUrl = pathToFileURL(`${outputDir}/`);
const rawDirUrl = pathToFileURL(`${rawDir}/`);

await mkdir(outputDir, { recursive: true });

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

function hasCasualtyColumns(rows) {
  return rows.some(
    (row) =>
      Object.hasOwn(row, "accident_year") &&
      Object.hasOwn(row, "casualty_class") &&
      Object.hasOwn(row, "casualty_severity"),
  );
}

async function readCasualtyRows() {
  let files;
  try {
    files = await readdir(rawDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const csvFiles = files.filter((file) => file.toLowerCase().endsWith(".csv"));
  const rowSets = await Promise.all(
    csvFiles.map(async (file) => {
      const rows = parseCsv(await readFile(new URL(file, rawDirUrl), "utf8"));
      return hasCasualtyColumns(rows) ? rows : [];
    }),
  );
  return rowSets.flat();
}

function buildMetadata(rows) {
  const rowsByYear = rows
    .map((row) => ({
      year: Number(row.accident_year),
      casualtyClass: Number(row.casualty_class),
      casualtySeverity: Number(row.casualty_severity),
    }))
    .filter((row) => Number.isInteger(row.year));

  const latestYears = [...new Set(rowsByYear.map((row) => row.year))]
    .sort((a, b) => b - a)
    .slice(0, 5)
    .sort((a, b) => a - b);

  if (!latestYears.length) {
    return {
      dataPeriod: "Awaiting STATS19 data build",
      casualtyCount: null,
      ksiCount: null,
      source,
    };
  }

  const latestYearSet = new Set(latestYears);
  const pedestrianRows = rowsByYear.filter(
    (row) => latestYearSet.has(row.year) && row.casualtyClass === 3,
  );

  return {
    dataPeriod: `${latestYears[0]}-${latestYears.at(-1)}`,
    casualtyCount: pedestrianRows.length,
    ksiCount: pedestrianRows.filter((row) => row.casualtySeverity === 1 || row.casualtySeverity === 2)
      .length,
    source,
  };
}

const metadata = buildMetadata(await readCasualtyRows());

await writeFile(
  new URL("metadata.json", outputDirUrl),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

await writeFile(new URL("patterns.json", outputDirUrl), "[]\n");

await writeFile(
  new URL("shape-signals.json", outputDirUrl),
  `${JSON.stringify(
    {
      suvCrossover: null,
      otherPassengerCar: null,
      unknownOrUnclassified: null,
    },
    null,
    2,
  )}\n`,
);

console.log("Wrote dashboard outputs.");

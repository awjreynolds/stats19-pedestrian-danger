import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const source = "DfT STATS19 road safety open data";
const excludedPatternFields = new Set([
  "accident_index",
  "accident_reference",
  "accident_year",
  "casualty_class",
  "casualty_reference",
  "casualty_ref",
  "casualty_severity",
  "generic_make_model",
  "shape_class",
  "vehicle_reference",
  "vehicle_ref",
]);
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

function getLatestYears(rows) {
  return [...new Set(rows.map((row) => Number(row.accident_year)).filter(Number.isInteger))]
    .sort((a, b) => b - a)
    .slice(0, 5)
    .sort((a, b) => a - b);
}

function getPedestrianRowsForLatestYears(rows, latestYears) {
  const latestYearSet = new Set(latestYears);
  return rows.filter(
    (row) => latestYearSet.has(Number(row.accident_year)) && Number(row.casualty_class) === 3,
  );
}

function buildMetadata(rows) {
  const latestYears = getLatestYears(rows);
  if (!latestYears.length) {
    return {
      dataPeriod: "Awaiting STATS19 data build",
      casualtyCount: null,
      ksiCount: null,
      source,
    };
  }

  const pedestrianRows = getPedestrianRowsForLatestYears(rows, latestYears);

  return {
    dataPeriod: `${latestYears[0]}-${latestYears.at(-1)}`,
    casualtyCount: pedestrianRows.length,
    ksiCount: pedestrianRows.filter(isKsi).length,
    source,
  };
}

function isKsi(row) {
  const severity = Number(row.casualty_severity);
  return severity === 1 || severity === 2;
}

function isPatternField(field) {
  return !excludedPatternFields.has(field) && !field.toLowerCase().includes("shape");
}

function buildPatterns(rows) {
  const pedestrianRows = getPedestrianRowsForLatestYears(rows, getLatestYears(rows));
  if (!pedestrianRows.length) {
    return [];
  }

  const fields = Object.keys(pedestrianRows[0]).filter(isPatternField).sort();
  const patternMap = new Map();

  for (let leftIndex = 0; leftIndex < fields.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < fields.length; rightIndex += 1) {
      const leftField = fields[leftIndex];
      const rightField = fields[rightIndex];

      for (const row of pedestrianRows) {
        const leftValue = row[leftField];
        const rightValue = row[rightField];
        if (!leftValue || !rightValue) {
          continue;
        }

        const key = `${leftField}\0${leftValue}\0${rightField}\0${rightValue}`;
        const pattern = patternMap.get(key) ?? {
          label: `${leftField} = ${leftValue} + ${rightField} = ${rightValue}`,
          conditions: [
            { field: leftField, value: leftValue },
            { field: rightField, value: rightValue },
          ],
          casualtyCount: 0,
          ksiCount: 0,
          ksiRate: 0,
          evidenceLabel: "insufficient_sample",
        };

        pattern.casualtyCount += 1;
        if (isKsi(row)) {
          pattern.ksiCount += 1;
        }
        patternMap.set(key, pattern);
      }
    }
  }

  return [...patternMap.values()]
    .map((pattern) => ({
      ...pattern,
      ksiRate: pattern.casualtyCount === 0 ? 0 : pattern.ksiCount / pattern.casualtyCount,
      evidenceLabel:
        pattern.casualtyCount >= 100 && pattern.ksiCount >= 20 ? "stable" : "insufficient_sample",
    }))
    .sort((a, b) => b.ksiCount - a.ksiCount || b.casualtyCount - a.casualtyCount || a.label.localeCompare(b.label));
}

const casualtyRows = await readCasualtyRows();
const metadata = buildMetadata(casualtyRows);
const patterns = buildPatterns(casualtyRows);

await writeFile(
  new URL("metadata.json", outputDirUrl),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

await writeFile(new URL("patterns.json", outputDirUrl), `${JSON.stringify(patterns, null, 2)}\n`);

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

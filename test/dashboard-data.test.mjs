import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function makeTempDir(name) {
  const dir = join(tmpdir(), `stats19-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

test("build:data writes latest-five-year pedestrian casualty metadata from STATS19 casualty rows", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");

  await writeFile(
    join(rawDir, "casualties.csv"),
    [
      "accident_year,casualty_class,casualty_severity",
      "2018,3,1",
      "2019,3,3",
      "2020,3,2",
      "2021,3,3",
      "2022,3,1",
      "2023,3,3",
      "2023,1,1",
      "2022,2,2",
      "2021,3,3",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
    },
  });

  const metadata = JSON.parse(await readFile(join(outputDir, "metadata.json"), "utf8"));

  assert.deepEqual(metadata, {
    dataPeriod: "2019-2023",
    casualtyCount: 6,
    ksiCount: 2,
    source: "DfT STATS19 road safety open data",
  });
});

test("check fails when dashboard metadata fields have invalid types", async () => {
  const outputDir = await makeTempDir("invalid-output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: "six",
        ksiCount: 2,
        source: "DfT STATS19 road safety open data",
      },
      null,
      2,
    ),
  );
  await writeFile(join(outputDir, "patterns.json"), "[]\n");
  await writeFile(
    join(outputDir, "shape-signals.json"),
    JSON.stringify(
      {
        suvCrossover: null,
        otherPassengerCar: null,
        unknownOrUnclassified: null,
      },
      null,
      2,
    ),
  );

  await assert.rejects(
    execFileAsync("node", ["scripts/check/check-outputs.mjs"], {
      env: {
        ...process.env,
        DASHBOARD_OUTPUT_DIR: outputDir,
      },
    }),
    /casualtyCount/,
  );
});

test("build:data keeps later-slice dashboard outputs placeholder-compatible", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");

  await writeFile(
    join(rawDir, "casualties.csv"),
    ["accident_year,casualty_class,casualty_severity", "2023,3,2"].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
    },
  });

  assert.deepEqual(JSON.parse(await readFile(join(outputDir, "patterns.json"), "utf8")), []);
  assert.deepEqual(JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8")), {
    suvCrossover: null,
    otherPassengerCar: null,
    unknownOrUnclassified: null,
  });
});

test("build:data ignores non-casualty raw CSVs when choosing the latest five casualty years", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_year,casualty_class,casualty_severity",
      "2019,3,3",
      "2020,3,3",
      "2021,3,3",
      "2022,3,3",
      "2023,3,3",
    ].join("\n"),
  );
  await writeFile(
    join(rawDir, "vehicle.csv"),
    ["accident_year,vehicle_type", "2024,9"].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
    },
  });

  const metadata = JSON.parse(await readFile(join(outputDir, "metadata.json"), "utf8"));

  assert.equal(metadata.dataPeriod, "2019-2023");
  assert.equal(metadata.casualtyCount, 5);
});

test("build:data writes a stable native two-condition Danger Pattern", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const rows = [];

  for (let index = 0; index < 100; index += 1) {
    rows.push(
      [
        2023,
        3,
        index < 20 ? 2 : 3,
        "1",
        "3",
      ].join(","),
    );
  }

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_year,casualty_class,casualty_severity,pedestrian_location,pedestrian_movement",
      ...rows,
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
    },
  });

  const patterns = JSON.parse(await readFile(join(outputDir, "patterns.json"), "utf8"));

  assert.deepEqual(patterns, [
    {
      label: "pedestrian_location = 1 + pedestrian_movement = 3",
      conditions: [
        { field: "pedestrian_location", value: "1" },
        { field: "pedestrian_movement", value: "3" },
      ],
      casualtyCount: 100,
      ksiCount: 20,
      ksiRate: 0.2,
      evidenceLabel: "stable",
    },
  ]);
});

test("build:data ranks Danger Patterns by KSI harm with deterministic ties", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const rows = [
    ["2023", "3", "1", "z", "9"],
    ["2023", "3", "2", "z", "9"],
    ["2023", "3", "1", "b", "1"],
    ["2023", "3", "2", "b", "1"],
    ["2023", "3", "3", "b", "1"],
    ["2023", "3", "1", "a", "1"],
    ["2023", "3", "2", "a", "1"],
    ["2023", "3", "3", "a", "1"],
  ];

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_year,casualty_class,casualty_severity,pedestrian_location,pedestrian_movement",
      ...rows.map((row) => row.join(",")),
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
    },
  });

  const patterns = JSON.parse(await readFile(join(outputDir, "patterns.json"), "utf8"));

  assert.deepEqual(
    patterns.map((pattern) => pattern.label),
    [
      "pedestrian_location = a + pedestrian_movement = 1",
      "pedestrian_location = b + pedestrian_movement = 1",
      "pedestrian_location = z + pedestrian_movement = 9",
    ],
  );
});

test("check fails when a Danger Pattern evidence label contradicts thresholds", async () => {
  const outputDir = await makeTempDir("invalid-output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 100,
        ksiCount: 19,
        source: "DfT STATS19 road safety open data",
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "patterns.json"),
    JSON.stringify(
      [
        {
          label: "pedestrian_location = 1 + pedestrian_movement = 3",
          conditions: [
            { field: "pedestrian_location", value: "1" },
            { field: "pedestrian_movement", value: "3" },
          ],
          casualtyCount: 100,
          ksiCount: 19,
          ksiRate: 0.19,
          evidenceLabel: "stable",
        },
      ],
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "shape-signals.json"),
    JSON.stringify(
      {
        suvCrossover: null,
        otherPassengerCar: null,
        unknownOrUnclassified: null,
      },
      null,
      2,
    ),
  );

  await assert.rejects(
    execFileAsync("node", ["scripts/check/check-outputs.mjs"], {
      env: {
        ...process.env,
        DASHBOARD_OUTPUT_DIR: outputDir,
      },
    }),
    /evidenceLabel/,
  );
});

test("check fails when a Danger Pattern uses an inferred shape condition", async () => {
  const outputDir = await makeTempDir("invalid-output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 100,
        ksiCount: 20,
        source: "DfT STATS19 road safety open data",
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "patterns.json"),
    JSON.stringify(
      [
        {
          label: "shape_class = suv_crossover + pedestrian_movement = 3",
          conditions: [
            { field: "shape_class", value: "suv_crossover" },
            { field: "pedestrian_movement", value: "3" },
          ],
          casualtyCount: 100,
          ksiCount: 20,
          ksiRate: 0.2,
          evidenceLabel: "stable",
        },
      ],
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "shape-signals.json"),
    JSON.stringify(
      {
        suvCrossover: null,
        otherPassengerCar: null,
        unknownOrUnclassified: null,
      },
      null,
      2,
    ),
  );

  await assert.rejects(
    execFileAsync("node", ["scripts/check/check-outputs.mjs"], {
      env: {
        ...process.env,
        DASHBOARD_OUTPUT_DIR: outputDir,
      },
    }),
    /native STATS19/,
  );
});

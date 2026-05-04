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

function makeDashboardDocument() {
  const fields = Object.fromEntries(
    ["dataPeriod", "casualtyCount", "ksiCount", "patternStatus"].map((field) => [
      field,
      { dataset: { field }, textContent: "" },
    ]),
  );
  const shapeCells = [
    { textContent: "" },
    { textContent: "" },
    { textContent: "" },
    { textContent: "" },
  ];
  const patternsBody = {
    children: [{ innerHTML: "placeholder" }],
    replaceChildren(...children) {
      this.children = children;
    },
  };
  const createdRows = [];

  return {
    createdRows,
    fields,
    patternsBody,
    shapeCells,
    createElement(tagName) {
      const row = { tagName, innerHTML: "" };
      createdRows.push(row);
      return row;
    },
    querySelector(selector) {
      if (selector === "#patterns-body") {
        return patternsBody;
      }
      throw new Error(`Unexpected selector: ${selector}`);
    },
    querySelectorAll(selector) {
      if (selector === "[data-field]") {
        return Object.values(fields);
      }
      if (selector === "#shape-grid article strong") {
        return shapeCells;
      }
      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
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

test("build:data accepts current DfT casualty files that use collision_year", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");

  await writeFile(
    join(rawDir, "casualties.csv"),
    [
      "collision_year,casualty_class,casualty_severity,pedestrian_location,pedestrian_movement",
      "2020,3,2,1,3",
      "2021,3,3,1,3",
      "2022,3,1,1,3",
      "2023,3,3,1,3",
      "2024,3,2,1,3",
      "2024,1,1,1,3",
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
  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.equal(metadata.dataPeriod, "2020-2024");
  assert.equal(metadata.casualtyCount, 5);
  assert.equal(metadata.ksiCount, 3);
  assert.equal(shapeSignals.unknownOrUnclassified, 5);
});

test("GitHub Pages workflow verifies and publishes the static dashboard artifact", async () => {
  const workflow = await readFile(".github/workflows/pages.yml", "utf8");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n\s+branches:\n\s+- main/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run download:data/);
  assert.match(workflow, /run: npm run build:data/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /cp index\.html dist\//);
  assert.match(workflow, /cp -R app outputs dist\//);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
});

test("download:data includes latest-five-year casualty and vehicle CSV downloads", async () => {
  const downloadScript = await readFile("scripts/download/download-stats19-data.mjs", "utf8");

  assert.match(downloadScript, /"casualty"/);
  assert.match(downloadScript, /"vehicle"/);
  assert.match(downloadScript, /dft-road-casualty-statistics-\$\{dataset\}-\$\{year\}\.csv/);
});

test("dashboard renderer smoke-renders populated metadata, patterns, and shape signals", async () => {
  const { renderDashboard } = await import("../app/src/main.js");
  const document = makeDashboardDocument();

  renderDashboard(document, {
    metadata: {
      dataPeriod: "2019-2023",
      casualtyCount: 1234,
      ksiCount: 56,
    },
    patterns: [
      {
        label: "pedestrian_location = 1 + pedestrian_movement = 3",
        casualtyCount: 100,
        ksiCount: 20,
        ksiRate: 0.2,
        evidenceLabel: "stable",
      },
    ],
    shapeSignals: {
      suvCrossover: 10,
      otherPassengerCar: 70,
      unknownOrUnclassified: 20,
      notPassengerCar: 5,
    },
  });

  assert.equal(document.fields.dataPeriod.textContent, "2019-2023");
  assert.equal(document.fields.casualtyCount.textContent, "1,234");
  assert.equal(document.fields.ksiCount.textContent, "56");
  assert.equal(document.fields.patternStatus.textContent, "1 ranked patterns");
  assert.equal(document.patternsBody.children.length, 1);
  assert.match(document.patternsBody.children[0].innerHTML, /pedestrian_location = 1/);
  assert.match(document.patternsBody.children[0].innerHTML, /20%/);
  assert.deepEqual(
    document.shapeCells.map((cell) => cell.textContent),
    ["10", "70", "20", "5"],
  );
});

test("dashboard renderer smoke-renders empty dashboard outputs", async () => {
  const { renderDashboard } = await import("../app/src/main.js");
  const document = makeDashboardDocument();

  renderDashboard(document, {
    metadata: {
      dataPeriod: "Not built yet",
      casualtyCount: null,
      ksiCount: null,
    },
    patterns: [],
    shapeSignals: {
      suvCrossover: null,
      otherPassengerCar: null,
      unknownOrUnclassified: null,
      notPassengerCar: null,
    },
  });

  assert.equal(document.fields.dataPeriod.textContent, "Not built yet");
  assert.equal(document.fields.casualtyCount.textContent, "-");
  assert.equal(document.fields.ksiCount.textContent, "-");
  assert.equal(document.fields.patternStatus.textContent, "No ranked patterns yet");
  assert.deepEqual(
    document.shapeCells.map((cell) => cell.textContent),
    ["-", "-", "-", "-"],
  );
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
        notPassengerCar: null,
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

test("build:data keeps pattern output placeholder-compatible and writes shape counts", async () => {
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
    suvCrossover: 0,
    otherPassengerCar: 0,
    unknownOrUnclassified: 1,
    notPassengerCar: 0,
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

test("build:data keeps Danger Pattern output compact for the static dashboard", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const rows = [];

  for (let patternIndex = 0; patternIndex < 60; patternIndex += 1) {
    for (let rowIndex = 0; rowIndex < 100; rowIndex += 1) {
      rows.push(
        [
          2023,
          3,
          rowIndex < 20 ? 2 : 3,
          `location_${patternIndex}`,
          "3",
        ].join(","),
      );
    }
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

  assert.equal(patterns.length, 50);
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
        notPassengerCar: null,
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
        notPassengerCar: null,
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

test("build:data writes Vehicle Shape Signals from reviewed taxonomy rows", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_year,casualty_class,casualty_severity,generic_make_model",
      "2023,3,3,MODEL SUV",
      "2023,3,2,MODEL SUV",
      "2023,3,3,MODEL HATCH",
      "2023,3,3,UNREVIEWED SUV",
      "2023,3,3,UNKNOWN MODEL",
      "2023,3,3,",
      "2023,1,1,MODEL SUV",
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "MODEL SUV,suv_crossover,high,reviewed,,",
      "MODEL HATCH,other_passenger_car,high,reviewed,,",
      "UNREVIEWED SUV,suv_crossover,low,unreviewed,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 2,
    otherPassengerCar: 1,
    unknownOrUnclassified: 3,
    notPassengerCar: 0,
  });
});

test("build:data joins current DfT casualty rows to their Associated Vehicle before classifying shape", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "collision_index,collision_year,vehicle_reference,casualty_class,casualty_severity,generic_make_model",
      "C1,2024,1,3,3,CASUALTY MODEL SHOULD NOT CLASSIFY",
      "C1,2024,2,3,2,CASUALTY MODEL SHOULD NOT CLASSIFY",
    ].join("\n"),
  );
  await writeFile(
    join(rawDir, "vehicle.csv"),
    [
      "collision_index,collision_year,vehicle_reference,vehicle_type,generic_make_model",
      "C1,2024,1,9,MODEL SUV",
      "C1,2024,2,8,MODEL HATCH",
      "C1,2024,3,9,MODEL UNASSOCIATED SUV",
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "CASUALTY MODEL SHOULD NOT CLASSIFY,suv_crossover,high,reviewed,,",
      "MODEL SUV,suv_crossover,high,reviewed,,",
      "MODEL HATCH,other_passenger_car,high,reviewed,,",
      "MODEL UNASSOCIATED SUV,suv_crossover,high,reviewed,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 1,
    otherPassengerCar: 1,
    unknownOrUnclassified: 0,
    notPassengerCar: 0,
  });
});

test("build:data keeps unmatched Associated Vehicle joins in unknown or unclassified", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "collision_index,collision_year,vehicle_reference,casualty_class,casualty_severity,generic_make_model",
      "C1,2024,1,3,3,CASUALTY MODEL SHOULD NOT CLASSIFY",
    ].join("\n"),
  );
  await writeFile(
    join(rawDir, "vehicle.csv"),
    [
      "collision_index,collision_year,vehicle_reference,vehicle_type,generic_make_model",
      "C1,2024,2,9,MODEL SUV",
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "CASUALTY MODEL SHOULD NOT CLASSIFY,suv_crossover,high,reviewed,,",
      "MODEL SUV,suv_crossover,high,reviewed,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 0,
    otherPassengerCar: 0,
    unknownOrUnclassified: 1,
    notPassengerCar: 0,
  });
});

test("build:data emits non-passenger-car Associated Vehicles separately", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "collision_index,collision_year,vehicle_reference,casualty_class,casualty_severity",
      "C1,2024,1,3,3",
      "C1,2024,2,3,3",
    ].join("\n"),
  );
  await writeFile(
    join(rawDir, "vehicle.csv"),
    [
      "collision_index,collision_year,vehicle_reference,vehicle_type,generic_make_model",
      "C1,2024,1,11,MODEL BUS",
      "C1,2024,2,9,MODEL SUV",
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "MODEL BUS,suv_crossover,high,reviewed,,",
      "MODEL SUV,suv_crossover,high,reviewed,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 1,
    otherPassengerCar: 0,
    unknownOrUnclassified: 0,
    notPassengerCar: 1,
  });
});

test("build:data joins legacy accident fixture rows with vehicle_ref", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_index,accident_year,vehicle_ref,casualty_class,casualty_severity,generic_make_model",
      "A1,2023,1,3,3,CASUALTY MODEL SHOULD NOT CLASSIFY",
    ].join("\n"),
  );
  await writeFile(
    join(rawDir, "vehicle.csv"),
    [
      "accident_index,accident_year,vehicle_ref,vehicle_type,generic_make_model",
      "A1,2023,1,9,MODEL HATCH",
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "CASUALTY MODEL SHOULD NOT CLASSIFY,suv_crossover,high,reviewed,,",
      "MODEL HATCH,other_passenger_car,high,reviewed,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 0,
    otherPassengerCar: 1,
    unknownOrUnclassified: 0,
    notPassengerCar: 0,
  });
});

test("build:data does not classify excluded taxonomy rows", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_year,casualty_class,casualty_severity,generic_make_model",
      "2023,3,3,MODEL EXCLUDED",
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "MODEL EXCLUDED,suv_crossover,high,excluded,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 0,
    otherPassengerCar: 0,
    unknownOrUnclassified: 1,
    notPassengerCar: 0,
  });
});

test("check fails when Vehicle Shape Signals are missing a required count", async () => {
  const outputDir = await makeTempDir("invalid-output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 1,
        ksiCount: 0,
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
        suvCrossover: 1,
        otherPassengerCar: 0,
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
    /unknownOrUnclassified/,
  );
});

test("build:data keeps Vehicle Shape Signals out of Danger Pattern conditions", async () => {
  const rawDir = await makeTempDir("raw");
  const outputDir = await makeTempDir("output");
  const taxonomyPath = join(await makeTempDir("taxonomy"), "model_shape_v1.csv");
  const rows = [];

  for (let index = 0; index < 100; index += 1) {
    rows.push(
      [
        2023,
        3,
        index < 20 ? 2 : 3,
        "MODEL SUV",
        "1",
        "3",
      ].join(","),
    );
  }

  await writeFile(
    join(rawDir, "casualty.csv"),
    [
      "accident_year,casualty_class,casualty_severity,generic_make_model,pedestrian_location,pedestrian_movement",
      ...rows,
    ].join("\n"),
  );
  await writeFile(
    taxonomyPath,
    [
      "generic_make_model,shape_class,confidence,review_status,notes,source_url",
      "MODEL SUV,suv_crossover,high,reviewed,,",
    ].join("\n"),
  );

  await execFileAsync("node", ["scripts/build/build-dashboard-data.mjs"], {
    env: {
      ...process.env,
      STATS19_RAW_DIR: rawDir,
      DASHBOARD_OUTPUT_DIR: outputDir,
      MODEL_SHAPE_TAXONOMY_PATH: taxonomyPath,
    },
  });

  const patterns = JSON.parse(await readFile(join(outputDir, "patterns.json"), "utf8"));
  const shapeSignals = JSON.parse(await readFile(join(outputDir, "shape-signals.json"), "utf8"));

  assert.deepEqual(shapeSignals, {
    suvCrossover: 100,
    otherPassengerCar: 0,
    unknownOrUnclassified: 0,
    notPassengerCar: 0,
  });
  assert(patterns.length > 0);
  assert(
    patterns.every((pattern) =>
      pattern.conditions.every((condition) => condition.field !== "generic_make_model"),
    ),
  );
});

test("check fails when Vehicle Shape Signals include an unsupported class", async () => {
  const outputDir = await makeTempDir("invalid-output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 1,
        ksiCount: 0,
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
        suvCrossover: 1,
        otherPassengerCar: 0,
        unknownOrUnclassified: 0,
        notPassengerCar: 0,
        heavyGoodsVehicle: 1,
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
    /unsupported shape signal/,
  );
});

test("check accepts Not Passenger Car as a Vehicle Shape Signal count", async () => {
  const outputDir = await makeTempDir("output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 1,
        ksiCount: 0,
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
        suvCrossover: 0,
        otherPassengerCar: 0,
        unknownOrUnclassified: 0,
        notPassengerCar: 1,
      },
      null,
      2,
    ),
  );

  await execFileAsync("node", ["scripts/check/check-outputs.mjs"], {
    env: {
      ...process.env,
      DASHBOARD_OUTPUT_DIR: outputDir,
    },
  });
});

test("check fails when populated dashboard outputs cannot render into the dashboard document", async () => {
  const outputDir = await makeTempDir("invalid-output");
  const indexPath = join(await makeTempDir("dashboard"), "index.html");

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
      ],
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "shape-signals.json"),
    JSON.stringify(
      {
        suvCrossover: 10,
        otherPassengerCar: 70,
        unknownOrUnclassified: 20,
        notPassengerCar: 5,
      },
      null,
      2,
    ),
  );
  await writeFile(
    indexPath,
    [
      "<!DOCTYPE html>",
      "<main>",
      "  <strong data-field=\"dataPeriod\">Not built yet</strong>",
      "  <strong data-field=\"casualtyCount\">-</strong>",
      "  <strong data-field=\"ksiCount\">-</strong>",
      "</main>",
    ].join("\n"),
  );

  await assert.rejects(
    execFileAsync("node", ["scripts/check/check-outputs.mjs"], {
      env: {
        ...process.env,
        DASHBOARD_OUTPUT_DIR: outputDir,
        DASHBOARD_INDEX_PATH: indexPath,
      },
    }),
    /dashboard render/i,
  );
});

test("check fails when populated Vehicle Shape Signals do not have enough dashboard value slots", async () => {
  const outputDir = await makeTempDir("invalid-output");
  const indexPath = join(await makeTempDir("dashboard"), "index.html");

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
      ],
      null,
      2,
    ),
  );
  await writeFile(
    join(outputDir, "shape-signals.json"),
    JSON.stringify(
      {
        suvCrossover: 10,
        otherPassengerCar: 70,
        unknownOrUnclassified: 20,
        notPassengerCar: 5,
      },
      null,
      2,
    ),
  );
  await writeFile(
    indexPath,
    [
      "<!DOCTYPE html>",
      "<main>",
      "  <strong data-field=\"dataPeriod\">Not built yet</strong>",
      "  <strong data-field=\"casualtyCount\">-</strong>",
      "  <strong data-field=\"ksiCount\">-</strong>",
      "  <span data-field=\"patternStatus\">Awaiting data build</span>",
      "  <tbody id=\"patterns-body\"></tbody>",
      "  <div id=\"shape-grid\">",
      "    <article><span>SUV/crossover</span><strong>-</strong></article>",
      "    <article><span>Other passenger car</span><strong>-</strong></article>",
      "    <article><span>Unknown or unclassified</span></article>",
      "    <article><span>Not passenger car</span></article>",
      "  </div>",
      "</main>",
    ].join("\n"),
  );

  await assert.rejects(
    execFileAsync("node", ["scripts/check/check-outputs.mjs"], {
      env: {
        ...process.env,
        DASHBOARD_OUTPUT_DIR: outputDir,
        DASHBOARD_INDEX_PATH: indexPath,
      },
    }),
    /shape signal value slots/i,
  );
});

test("check fails when a Danger Pattern KSI rate does not match its counts", async () => {
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
          label: "pedestrian_location = 1 + pedestrian_movement = 3",
          conditions: [
            { field: "pedestrian_location", value: "1" },
            { field: "pedestrian_movement", value: "3" },
          ],
          casualtyCount: 100,
          ksiCount: 20,
          ksiRate: 0.1,
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
        suvCrossover: 10,
        otherPassengerCar: 70,
        unknownOrUnclassified: 20,
        notPassengerCar: 5,
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
    /ksiRate/,
  );
});

test("check fails when Danger Pattern output is too large for the static dashboard", async () => {
  const outputDir = await makeTempDir("invalid-output");
  const patterns = Array.from({ length: 51 }, (_, index) => ({
    label: `pedestrian_location = ${index} + pedestrian_movement = 3`,
    conditions: [
      { field: "pedestrian_location", value: String(index) },
      { field: "pedestrian_movement", value: "3" },
    ],
    casualtyCount: 100,
    ksiCount: 20,
    ksiRate: 0.2,
    evidenceLabel: "stable",
  }));

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 5100,
        ksiCount: 1020,
        source: "DfT STATS19 road safety open data",
      },
      null,
      2,
    ),
  );
  await writeFile(join(outputDir, "patterns.json"), `${JSON.stringify(patterns, null, 2)}\n`);
  await writeFile(
    join(outputDir, "shape-signals.json"),
    JSON.stringify(
      {
        suvCrossover: 10,
        otherPassengerCar: 70,
        unknownOrUnclassified: 20,
        notPassengerCar: 5,
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
    /at most 50/,
  );
});

test("check fails when metadata KSI count exceeds casualty count", async () => {
  const outputDir = await makeTempDir("invalid-output");

  await writeFile(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        dataPeriod: "2019-2023",
        casualtyCount: 10,
        ksiCount: 11,
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
        suvCrossover: 1,
        otherPassengerCar: 7,
        unknownOrUnclassified: 2,
        notPassengerCar: 0,
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
    /metadata.ksiCount/,
  );
});

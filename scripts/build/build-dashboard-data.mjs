import { mkdir, writeFile } from "node:fs/promises";

const outputDir = new URL("../../outputs/dashboard/", import.meta.url);

await mkdir(outputDir, { recursive: true });

await writeFile(
  new URL("metadata.json", outputDir),
  `${JSON.stringify(
    {
      dataPeriod: "Awaiting STATS19 data build",
      casualtyCount: null,
      ksiCount: null,
      source: "DfT STATS19 road safety open data",
    },
    null,
    2,
  )}\n`,
);

await writeFile(new URL("patterns.json", outputDir), "[]\n");

await writeFile(
  new URL("shape-signals.json", outputDir),
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

console.log("Wrote placeholder dashboard outputs.");


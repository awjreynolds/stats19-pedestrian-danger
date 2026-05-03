const numberFormatter = new Intl.NumberFormat("en-GB");
const percentFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
  style: "percent",
});

const fields = [...document.querySelectorAll("[data-field]")].reduce((acc, node) => {
  acc[node.dataset.field] = node;
  return acc;
}, {});

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status}`);
  }
  return response.json();
}

function formatCount(value) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "-";
}

function renderMetadata(metadata) {
  fields.dataPeriod.textContent = metadata.dataPeriod ?? "Not built yet";
  fields.casualtyCount.textContent = formatCount(metadata.casualtyCount);
  fields.ksiCount.textContent = formatCount(metadata.ksiCount);
}

function renderPatterns(patterns) {
  const body = document.querySelector("#patterns-body");
  if (!patterns.length) {
    fields.patternStatus.textContent = "No ranked patterns yet";
    return;
  }

  fields.patternStatus.textContent = `${patterns.length} ranked patterns`;
  body.replaceChildren(
    ...patterns.map((pattern) => {
      const row = document.createElement("tr");
      const rate = Number.isFinite(pattern.ksiRate)
        ? percentFormatter.format(pattern.ksiRate)
        : "-";
      row.innerHTML = `
        <td>${pattern.label}</td>
        <td>${formatCount(pattern.casualtyCount)}</td>
        <td>${formatCount(pattern.ksiCount)}</td>
        <td>${rate}</td>
        <td>${pattern.evidenceLabel}</td>
      `;
      return row;
    }),
  );
}

function renderShapeSignals(shapeSignals) {
  const cells = document.querySelectorAll("#shape-grid article strong");
  const values = [
    shapeSignals.suvCrossover,
    shapeSignals.otherPassengerCar,
    shapeSignals.unknownOrUnclassified,
  ];
  cells.forEach((cell, index) => {
    cell.textContent = formatCount(values[index]);
  });
}

async function main() {
  try {
    const [metadata, patterns, shapeSignals] = await Promise.all([
      loadJson("outputs/dashboard/metadata.json"),
      loadJson("outputs/dashboard/patterns.json"),
      loadJson("outputs/dashboard/shape-signals.json"),
    ]);
    renderMetadata(metadata);
    renderPatterns(patterns);
    renderShapeSignals(shapeSignals);
  } catch (error) {
    fields.patternStatus.textContent = "Data unavailable";
    console.error(error);
  }
}

main();


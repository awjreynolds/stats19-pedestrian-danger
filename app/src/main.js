const numberFormatter = new Intl.NumberFormat("en-GB");
const percentFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
  style: "percent",
});

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

function getFields(documentRef) {
  return [...documentRef.querySelectorAll("[data-field]")].reduce((acc, node) => {
    acc[node.dataset.field] = node;
    return acc;
  }, {});
}

function renderMetadata(fields, metadata) {
  fields.dataPeriod.textContent = metadata.dataPeriod ?? "Not built yet";
  fields.casualtyCount.textContent = formatCount(metadata.casualtyCount);
  fields.ksiCount.textContent = formatCount(metadata.ksiCount);
}

function renderPatterns(documentRef, fields, patterns) {
  const body = documentRef.querySelector("#patterns-body");
  if (!patterns.length) {
    fields.patternStatus.textContent = "No ranked patterns yet";
    return;
  }

  fields.patternStatus.textContent = `${patterns.length} ranked patterns`;
  body.replaceChildren(
    ...patterns.map((pattern) => {
      const row = documentRef.createElement("tr");
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

function renderShapeSignals(documentRef, shapeSignals) {
  const cells = documentRef.querySelectorAll("#shape-grid article strong");
  const values = [
    shapeSignals.suvCrossover,
    shapeSignals.otherPassengerCar,
    shapeSignals.unknownOrUnclassified,
    shapeSignals.notPassengerCar,
  ];
  cells.forEach((cell, index) => {
    cell.textContent = formatCount(values[index]);
  });
}

function renderTaxonomyCoverage(fields, shapeSignals) {
  const coverage = shapeSignals.taxonomyCoverage;
  if (!coverage || !Number.isFinite(coverage.percentage) || !coverage.signalStrengthBand) {
    fields.taxonomyCoverage.textContent = "-";
    fields.signalStrengthBand.textContent = "Signal strength unavailable";
    fields.signalStrengthBand.className = "signal-band";
    return;
  }

  const bandLabel = coverage.signalStrengthBand[0].toUpperCase() + coverage.signalStrengthBand.slice(1);
  fields.taxonomyCoverage.textContent = percentFormatter.format(coverage.percentage);
  fields.signalStrengthBand.textContent = `${bandLabel} signal strength`;
  fields.signalStrengthBand.className = `signal-band signal-band--${coverage.signalStrengthBand}`;
}

export function renderDashboard(documentRef, { metadata, patterns, shapeSignals }) {
  const fields = getFields(documentRef);

  renderMetadata(fields, metadata);
  renderPatterns(documentRef, fields, patterns);
  renderShapeSignals(documentRef, shapeSignals);
  renderTaxonomyCoverage(fields, shapeSignals);
}

async function main() {
  try {
    const [metadata, patterns, shapeSignals] = await Promise.all([
      loadJson("outputs/dashboard/metadata.json"),
      loadJson("outputs/dashboard/patterns.json"),
      loadJson("outputs/dashboard/shape-signals.json"),
    ]);
    renderDashboard(document, { metadata, patterns, shapeSignals });
  } catch (error) {
    const fields = getFields(document);
    fields.patternStatus.textContent = "Data unavailable";
    console.error(error);
  }
}

if (typeof document !== "undefined") {
  main();
}

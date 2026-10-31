import type { Model3DFacts, Model3DUnit } from "./types";

import { formatModelSize } from "./constants";
import { numberLocale, type Viewer3DCopy } from "./copy";

const MM_PER_UNIT: Record<Model3DUnit, number> = {
  meters: 1000,
  centimeters: 10,
  millimeters: 1,
  inches: 25.4,
};

/** "32 × 18 × 12 cm": the dimensions in the unit the merchant made the model in. */
export function formatDimensions(
  dimensionsMm: readonly number[],
  unit: Model3DUnit,
  copy: Viewer3DCopy,
  locale?: string,
): string | undefined {
  if (dimensionsMm.length !== 3) return undefined;
  const format = new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: unit === "millimeters" ? 0 : 2,
  });
  const scale = MM_PER_UNIT[unit] ?? 1000;
  return `${dimensionsMm.map((mm) => format.format(mm / scale)).join(" × ")} ${copy.units[unit]}`;
}

/** The rows of "Szczegóły modelu" (D12), in display order. */
export function modelFactRows(
  facts: Model3DFacts,
  copy: Viewer3DCopy,
  locale?: string,
): { label: string; value: string }[] {
  const rows = [{ label: copy.factsFormat, value: "GLB" }];
  if (facts.fileSize > 0) {
    rows.push({
      label: copy.factsFileSize,
      value: formatModelSize(facts.fileSize, numberLocale(locale)),
    });
  }
  if (facts.triangleCount > 0) {
    rows.push({
      label: copy.factsTriangles,
      value: copy.triangles(
        new Intl.NumberFormat(numberLocale(locale)).format(facts.triangleCount),
      ),
    });
  }
  const dimensions = formatDimensions(
    facts.dimensionsMm,
    facts.unit,
    copy,
    locale,
  );
  if (dimensions) rows.push({ label: copy.factsDimensions, value: dimensions });
  return rows;
}

/** A licence "text" that is just a link opens in a new tab instead of a dialog. */
export function licenceLink(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

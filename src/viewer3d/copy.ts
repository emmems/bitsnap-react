import type { Model3DUnit } from "./types";

/**
 * Every string of the 3D viewer. Polish is the default, English for `en*`
 * locales; pass `texts` to `Product3DViewer` to override any of them.
 */
export type Viewer3DCopy = {
  sectionLabel: string;
  show: (size: string) => string;
  heroPill: string;
  heroPillWithSize: (size: string) => string;
  loading: string;
  loadingProgress: (percent: number) => string;
  error: string;
  retry: string;
  unsupported: string;
  hintDrag: string;
  hintTap: string;
  touchDone: string;
  reset: string;
  fullscreen: string;
  closeFullscreen: string;
  disclaimer: string;
  report: string;
  factsTitle: string;
  factsFormat: string;
  factsFileSize: string;
  factsTriangles: string;
  factsDimensions: string;
  triangles: (count: string) => string;
  licence: string;
  licenceShow: string;
  licenceOpen: string;
  licenceClose: string;
  licenceDefaultName: string;
  units: Record<Model3DUnit, string>;
  /** Fullscreen bar: add to the cart. */
  addToCart: string;
  addingToCart: string;
  addedToCart: string;
  addToCartError: string;
};

export const VIEWER3D_COPY_PL: Viewer3DCopy = {
  sectionLabel: "Model 3D",
  show: (size) => `Pokaż model 3D (${size})`,
  heroPill: "Zobacz w 3D",
  heroPillWithSize: (size) => `Zobacz w 3D (${size})`,
  loading: "Wczytywanie modelu 3D…",
  loadingProgress: (percent) => `Wczytywanie modelu 3D: ${percent}%`,
  error: "Nie udało się wczytać modelu 3D",
  retry: "Spróbuj ponownie",
  unsupported: "Ta przeglądarka nie wyświetli modelu 3D.",
  hintDrag: "Przeciągnij, aby obrócić",
  hintTap: "Dotknij, aby obracać",
  touchDone: "Gotowe",
  reset: "Reset widoku",
  fullscreen: "Pełny ekran",
  closeFullscreen: "Zamknij pełny ekran",
  disclaimer:
    "Model 3D jest poglądowy; kolory i detale mogą się różnić od produktu.",
  report: "Zgłoś ten model",
  factsTitle: "Szczegóły modelu",
  factsFormat: "Format",
  factsFileSize: "Rozmiar pliku",
  factsTriangles: "Trójkąty",
  factsDimensions: "Wymiary",
  triangles: (count) => count,
  licence: "Licencja",
  licenceShow: "Warunki licencji",
  licenceOpen: "Otwórz licencję",
  licenceClose: "Zamknij",
  licenceDefaultName: "Licencja sprzedawcy",
  units: { meters: "m", centimeters: "cm", millimeters: "mm", inches: "in" },
  addToCart: "Dodaj do koszyka",
  addingToCart: "Dodawanie…",
  addedToCart: "Dodano do koszyka",
  addToCartError: "Nie udało się dodać do koszyka. Spróbuj ponownie.",
};

export const VIEWER3D_COPY_EN: Viewer3DCopy = {
  sectionLabel: "3D model",
  show: (size) => `Show 3D model (${size})`,
  heroPill: "View in 3D",
  heroPillWithSize: (size) => `View in 3D (${size})`,
  loading: "Loading the 3D model…",
  loadingProgress: (percent) => `Loading the 3D model: ${percent}%`,
  error: "The 3D model could not be loaded",
  retry: "Try again",
  unsupported: "This browser cannot show the 3D model.",
  hintDrag: "Drag to rotate",
  hintTap: "Tap to rotate",
  touchDone: "Done",
  reset: "Reset view",
  fullscreen: "Full screen",
  closeFullscreen: "Close full screen",
  disclaimer:
    "The 3D model is illustrative; colours and details may differ from the product.",
  report: "Report this model",
  factsTitle: "Model details",
  factsFormat: "Format",
  factsFileSize: "File size",
  factsTriangles: "Triangles",
  factsDimensions: "Dimensions",
  triangles: (count) => count,
  licence: "Licence",
  licenceShow: "Licence terms",
  licenceOpen: "Open the licence",
  licenceClose: "Close",
  licenceDefaultName: "Seller's licence",
  units: { meters: "m", centimeters: "cm", millimeters: "mm", inches: "in" },
  addToCart: "Add to cart",
  addingToCart: "Adding…",
  addedToCart: "Added to cart",
  addToCartError: "Could not add to the cart. Try again.",
};

export function viewer3DCopy(
  locale?: string,
  overrides?: Partial<Viewer3DCopy>,
): Viewer3DCopy {
  const base = locale?.toLowerCase().startsWith("en")
    ? VIEWER3D_COPY_EN
    : VIEWER3D_COPY_PL;
  return overrides ? { ...base, ...overrides } : base;
}

export function numberLocale(locale?: string): string {
  return locale?.toLowerCase().startsWith("en") ? "en-GB" : "pl-PL";
}

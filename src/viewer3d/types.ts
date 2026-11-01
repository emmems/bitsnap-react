/**
 * What the 3D viewer needs about one ready model. The Bitsnap backend sends it
 * as `model3d` on a product and on each variant of
 * `GET /api/integrations/{projectID}/public-commerce/products?include=model3d`.
 * Public data only: no keys, no asset id, never the original file.
 */
export type Model3DUnit = "meters" | "centimeters" | "millimeters" | "inches";

export type Model3DFacts = {
  /** Bytes of the original file. */
  fileSize: number;
  triangleCount: number;
  /** x, y, z in millimetres; empty when unknown. */
  dimensionsMm: number[];
  /** The unit the merchant made the model in; dimensions are shown in it. */
  unit: Model3DUnit;
};

export type Model3DView = {
  /** Display copy (GLB) on the Bitsnap file host. */
  previewUrl: string;
  /** Bytes of the display copy; over 10 MB it loads only on a click. */
  previewSize: number;
  thumbnailUrl?: string;
  /** The product does not sell the file: the viewer shows the "illustrative" note. */
  illustrative: boolean;
  /** Only when the merchant turned the model facts on. */
  facts?: Model3DFacts;
};

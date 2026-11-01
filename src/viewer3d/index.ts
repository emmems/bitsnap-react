/**
 * `bitsnap-react/viewer3d` subpath (ESM only): the 3D viewer of a product.
 *
 * `three`, `@react-three/fiber` and `@react-three/drei` are optional peer
 * dependencies: install them to use this subpath. They are loaded with
 * `import()` only once a model may be shown, never during the server render,
 * and the main `bitsnap-react` and `bitsnap-react/catalog` entries never
 * reach them.
 */
export { Product3DViewer, isCartable, cartItemIdFor } from "./Product3DViewer";
export type { Product3DBuyBarArgs, Product3DViewerProps } from "./Product3DViewer";
export { Model3DViewer } from "./Model3DShell";
export type { Model3DViewerProps, Viewer3DAppearance } from "./Model3DShell";
export { useProduct3DModel } from "./useProduct3DModel";
export type {
  Product3DStatus,
  UseProduct3DModelOptions,
  UseProduct3DModelResult,
} from "./useProduct3DModel";
export {
  buildProduct3DURL,
  fetchProduct3D,
  resolveModel,
  Product3DError,
} from "./model";
export type { Product3DProduct, Product3DVariant } from "./model";
export {
  AUTO_LOAD_MAX_BYTES,
  defaultDecoderPath,
  formatModelSize,
  needsClickToLoad,
} from "./constants";
export { VIEWER3D_COPY_EN, VIEWER3D_COPY_PL } from "./copy";
export type { Viewer3DCopy } from "./copy";
export type { Model3DFacts, Model3DUnit, Model3DView } from "./types";

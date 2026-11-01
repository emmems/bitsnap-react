import {
  Model3DViewer,
  Product3DViewer,
  useProduct3DModel,
  type Model3DView,
  type Product3DViewerProps,
  type UseProduct3DModelResult,
} from "bitsnap-react/viewer3d";

/** Consumer fixture for the 3D viewer subpath. */

const model: Model3DView = {
  previewUrl: "https://files.bitsnap.pl/m.glb",
  previewSize: 1024,
  illustrative: true,
};

export function Viewer(props: Partial<Product3DViewerProps>) {
  const result: UseProduct3DModelResult = useProduct3DModel("prodv2_x", undefined, {
    projectID: "project",
  });
  return (
    <>
      <Product3DViewer
        projectID="project"
        productId="prodv2_x"
        variantId="prodv2_x_default"
        locale="en-US"
        decoderPath="/draco/"
        appearance={{ background: "#111", foreground: "#fff" }}
        texts={{ retry: "Again" }}
        renderBuyBar={({ product, variant, close }) => (
          <button onClick={close}>
            {product.name} {variant?.name}
          </button>
        )}
        fallback={<p>No model</p>}
        {...props}
      />
      {result.status === "ready" && result.model ? (
        <Model3DViewer model={result.model} productName="X" startSignal={1} hideNotes />
      ) : null}
      <Model3DViewer model={model} productName="Y" />
    </>
  );
}

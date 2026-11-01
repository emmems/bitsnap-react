import { useState, type ReactNode } from "react";

import { addProductToCart } from "../components/products/add-to-cart";
import { formatProductPrice } from "../components/products/format";
import { HOST } from "../components/checkout/constants";
import { getPanelConfig } from "../panel/config";
import { viewer3DCopy, type Viewer3DCopy } from "./copy";
import type { Product3DProduct, Product3DVariant } from "./model";
import { Model3DViewer, type Model3DViewerProps } from "./Model3DShell";
import {
  useProduct3DModel,
  type UseProduct3DModelOptions,
  type UseProduct3DModelResult,
} from "./useProduct3DModel";

export type Product3DBuyBarArgs = {
  product: Product3DProduct;
  variant?: Product3DVariant;
  /** Leaves full screen (e.g. before the page shows its own error or dialog). */
  close: () => void;
};

export type Product3DViewerProps = UseProduct3DModelOptions &
  Omit<
    Model3DViewerProps,
    "model" | "productName" | "renderFullscreenBar" | "loadViewer"
  > & {
    /** Bitsnap product ID (`prodv2_…`), or a variant ID. */
    productId: string;
    /** The variant the page shows; switching it swaps the model in place. */
    variantId?: string;
    /**
     * The bar of the full screen view. Default: name, price and an
     * "Add to cart" button that uses the Bitsnap cart (loaded on the first
     * click). Return `null` for no bar.
     */
    renderBuyBar?: (args: Product3DBuyBarArgs) => ReactNode;
    /** Rendered while loading, when there is no model, and on error. Default: nothing. */
    fallback?: ReactNode;
    /** Product page URL stored with the cart item (default buy bar). */
    productUrl?: string;
    /** Called after the default buy bar added the product. */
    onAddedToCart?: (args: { product: Product3DProduct; variant?: Product3DVariant }) => void;
    /** @internal Tests replace the three viewer. */
    loadViewer?: Model3DViewerProps["loadViewer"];
  };

/**
 * The 3D viewer of a Bitsnap product: loads the product's public model and
 * shows it (auto-rotate, click-to-load over 10 MB, reduced motion, full screen
 * with a buy bar, gesture hint). Renders `fallback` (nothing by default) when
 * the product has no ready model or the server has no 3D support.
 *
 * Needs the optional peer dependencies `three`, `@react-three/fiber` and
 * `@react-three/drei`; they load only once the model may be shown.
 */
export function Product3DViewer({
  productId,
  variantId,
  projectID,
  host,
  locale,
  renderBuyBar,
  fallback = null,
  productUrl,
  onAddedToCart,
  ...viewer
}: Product3DViewerProps) {
  const result = useProduct3DModel(productId, variantId, {
    projectID,
    host,
    locale,
  });
  if (result.status !== "ready" || result.model == null || result.product == null) {
    return <>{fallback}</>;
  }
  const product = result.product;
  const copy = viewer3DCopy(locale, viewer.texts);
  return (
    <Model3DViewer
      {...viewer}
      locale={locale}
      model={result.model}
      productName={result.variant?.name ? `${product.name} – ${result.variant.name}` : product.name}
      renderFullscreenBar={({ close }) =>
        renderBuyBar != null
          ? renderBuyBar({ product, variant: result.variant, close })
          : (
              <DefaultBuyBar
                product={product}
                variant={result.variant}
                copy={copy}
                locale={locale}
                projectID={projectID ?? getPanelConfig().projectID}
                host={host}
                productUrl={productUrl}
                onAdded={onAddedToCart}
              />
            )
      }
    />
  );
}

/** Whether the default bar may add the item straight to the cart. */
export function isCartable(
  product: Product3DProduct,
  variant: Product3DVariant | undefined,
): boolean {
  if (product.recurring != null) return false;
  const priceType = variant?.priceType ?? product.priceType;
  if (priceType != null && priceType !== "one_time") return false;
  const quantity = variant?.availableQuantity ?? product.availableQuantity;
  return quantity == null || quantity > 0;
}

/** The cart id: the chosen variant, else the first (default) variant, else the product. */
export function cartItemIdFor(
  product: Product3DProduct,
  variant: Product3DVariant | undefined,
): string {
  return variant?.id ?? product.variants?.[0]?.id ?? product.id;
}

function DefaultBuyBar({
  product,
  variant,
  copy,
  locale,
  projectID,
  host,
  productUrl,
  onAdded,
}: {
  product: Product3DProduct;
  variant?: Product3DVariant;
  copy: Viewer3DCopy;
  locale?: string;
  projectID?: string;
  host?: string;
  productUrl?: string;
  onAdded?: Product3DViewerProps["onAddedToCart"];
}) {
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">("idle");
  const price = variant?.price ?? product.price;
  const currency = variant?.currency ?? product.currency;
  const canAdd = projectID != null && isCartable(product, variant);

  return (
    <div>
      <div className="bsv3d-buybar-row">
        <div>
          <p className="bsv3d-buybar-name">
            {product.name}
            {variant?.name ? ` – ${variant.name}` : ""}
          </p>
          <p className="bsv3d-buybar-price">
            {formatProductPrice(price, currency, locale)}
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            className="bsv3d-button"
            data-viewer3d-add=""
            disabled={state === "adding"}
            aria-live="polite"
            onClick={async () => {
              setState("adding");
              try {
                await addProductToCart(
                  {
                    id: product.id,
                    cartItemId: cartItemIdFor(product, variant),
                    name: variant?.name ? `${product.name} – ${variant.name}` : product.name,
                    price,
                    currency,
                  },
                  {
                    projectID: projectID!,
                    host: host ?? HOST,
                    showCart: false,
                    url:
                      productUrl ??
                      (typeof window !== "undefined" ? window.location.href : undefined),
                  },
                );
                setState("added");
                onAdded?.({ product, variant });
              } catch {
                setState("error");
              }
            }}
          >
            {state === "adding"
              ? copy.addingToCart
              : state === "added"
                ? copy.addedToCart
                : copy.addToCart}
          </button>
        )}
      </div>
      {state === "error" && (
        <p className="bsv3d-buybar-error" role="alert">
          {copy.addToCartError}
        </p>
      )}
    </div>
  );
}

export type { UseProduct3DModelResult };

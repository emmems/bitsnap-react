import { withClientParam } from "@/src/lib/client-header";
import type { Model3DView } from "./types";

/**
 * The public product data the 3D viewer reads:
 * `GET {host}/api/integrations/{projectID}/public-commerce/products?ids=…&include=model3d`,
 * the endpoint the cart already uses. Servers without 3D support ignore
 * `include` and send no `model3d`: the viewer then shows nothing.
 */
export type Product3DVariant = {
  id: string;
  name: string;
  /** Minor units (grosze, cents). */
  price: number;
  currency: string;
  availableQuantity?: number;
  priceType?: string;
  model3d?: Model3DView;
};

export type Product3DProduct = {
  id: string;
  name: string;
  price: number;
  currency: string;
  availableQuantity?: number;
  priceType?: string;
  recurring?: unknown;
  model3d?: Model3DView;
  variants?: Product3DVariant[];
};

export type Product3DQuery = {
  projectID: string;
  /** Origin of the Bitsnap backend (or of a custom domain), without a path. */
  host: string;
  productId: string;
  locale?: string;
};

export class Product3DError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "Product3DError";
    this.status = status;
  }
}

export function buildProduct3DURL(query: Product3DQuery): string {
  const params = new URLSearchParams();
  params.set("ids", query.productId);
  if (query.locale) params.set("locale", query.locale);
  params.set("include", "model3d");
  const host = query.host.replace(/\/+$/, "");
  return `${host}/api/integrations/${encodeURIComponent(
    query.projectID,
  )}/public-commerce/products?${params.toString()}`;
}

function isModel(value: unknown): value is Model3DView {
  return (
    typeof value === "object" &&
    value != null &&
    typeof (value as Model3DView).previewUrl === "string" &&
    (value as Model3DView).previewUrl.length > 0 &&
    typeof (value as Model3DView).previewSize === "number"
  );
}

/** The product a request answered with: the exact id, else the one holding it as a variant. */
export function pickProduct(
  products: readonly Product3DProduct[],
  productId: string,
): Product3DProduct | undefined {
  return (
    products.find((product) => product.id === productId) ??
    products.find((product) =>
      product.variants?.some((variant) => variant.id === productId),
    ) ??
    (products.length === 1 ? products[0] : undefined)
  );
}

/** `prodv2_<hash>` of a product or variant id (`prodv2_<hash>_<variant>`). */
function baseProductID(id: string): string {
  return /^(prodv2_[^_]+)/.exec(id)?.[1] ?? id;
}

/**
 * The variant of `variantId`: its full id (`prodv2_X_red`), or the part after
 * `prodv2_X_` (`red`). The server may answer `prodv2_X` with an item whose id
 * is `prodv2_X_default`, so the base comes from the id itself.
 */
export function pickVariant(
  product: Product3DProduct,
  variantId: string | undefined,
): Product3DVariant | undefined {
  if (!variantId) return undefined;
  const variants = product.variants ?? [];
  const full = `${baseProductID(product.id)}_${variantId}`;
  return (
    variants.find((variant) => variant.id === variantId) ??
    variants.find((variant) => variant.id === full)
  );
}

/**
 * The model to show: the chosen variant's (the server already gives a variant
 * the product's model when it has none of its own), else the product's, else
 * the first variant with one. A chosen variant without a model shows none.
 */
export function resolveModel(
  product: Product3DProduct,
  variantId?: string,
): Model3DView | undefined {
  const variant = pickVariant(product, variantId);
  if (variant != null) return isModel(variant.model3d) ? variant.model3d : undefined;
  if (isModel(product.model3d)) return product.model3d;
  return product.variants?.map((item) => item.model3d).find(isModel);
}

/** Whether any variant or the product has a model (for a variant picker). */
export function hasAnyModel(product: Product3DProduct): boolean {
  return resolveModel(product) != null;
}

const cache = new Map<string, Promise<Product3DProduct[]>>();

/**
 * Loads the product with a credential-less `fetch`, once per URL per page
 * (several viewers of one product share the request). A failed request is
 * forgotten so a retry asks again.
 */
export function fetchProduct3D(query: Product3DQuery): Promise<Product3DProduct[]> {
  const url = withClientParam(buildProduct3DURL(query));
  let pending = cache.get(url);
  if (pending == null) {
    pending = (async () => {
      const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Product3DError(
          `Could not load the product (${response.status})`,
          response.status,
        );
      }
      const payload = (await response.json()) as { result?: unknown };
      return Array.isArray(payload?.result)
        ? (payload.result as Product3DProduct[])
        : [];
    })();
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

/** @internal Tests start from an empty cache. */
export function clearProduct3DCache(): void {
  cache.clear();
}

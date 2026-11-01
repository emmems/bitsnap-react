import { useCallback, useEffect, useState } from "react";
import { HOST } from "../components/checkout/constants";
import { getLocale } from "../components/checkout/locale";
import { getPanelConfig } from "../panel/config";
import {
  fetchProduct3D,
  pickProduct,
  pickVariant,
  resolveModel,
  type Product3DProduct,
  type Product3DVariant,
} from "./model";
import type { Model3DView } from "./types";

export type UseProduct3DModelOptions = {
  /**
   * Project (shop) ID. Defaults to the one set with `setProjectID` from
   * `bitsnap-react`.
   */
  projectID?: string;
  /**
   * Origin of the Bitsnap backend. Defaults to the library host
   * (`https://bitsnap.pl`, or what `setCustomHost` had set). On a custom
   * domain pass the domain itself, or `""` for same-origin requests.
   */
  host?: string;
  /** Locale of the product name. Defaults to the library locale. */
  locale?: string;
};

export type Product3DStatus =
  /** Waiting for the product (also on the server and the first render). */
  | "loading"
  /** `model` is set. */
  | "ready"
  /** The product (or the chosen variant) has no 3D model, or the server has no 3D support. */
  | "none"
  /** The product could not be loaded; `retry()` asks again. */
  | "error";

export type UseProduct3DModelResult = {
  status: Product3DStatus;
  model?: Model3DView;
  /** The product as the public endpoint sent it (name, price, variants). */
  product?: Product3DProduct;
  /** The chosen variant, when `variantId` matches one. */
  variant?: Product3DVariant;
  error?: Error;
  retry: () => void;
};

type Loaded =
  | { key: string; products: Product3DProduct[]; error?: undefined }
  | { key: string; products?: undefined; error: Error };

/**
 * The public 3D model of a product (and variant). Fetches in the browser
 * only; switching `variantId` does not fetch again.
 */
export function useProduct3DModel(
  productId: string,
  variantId?: string,
  options: UseProduct3DModelOptions = {},
): UseProduct3DModelResult {
  const projectID = options.projectID ?? getPanelConfig().projectID;
  const [host] = useState(() => options.host ?? HOST);
  const effectiveHost = options.host ?? host;
  const [locale] = useState(() => options.locale ?? getLocale());
  const effectiveLocale = options.locale ?? locale;
  const key = `${effectiveHost}|${projectID}|${productId}|${effectiveLocale}`;
  const [loaded, setLoaded] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) return;
    if (!projectID) {
      setLoaded({
        key,
        error: new Error(
          "bitsnap-react/viewer3d: no project ID (pass projectID or call setProjectID)",
        ),
      });
      return;
    }
    let cancelled = false;
    fetchProduct3D({
      projectID,
      host: effectiveHost,
      productId,
      locale: effectiveLocale,
    }).then(
      (products) => {
        if (!cancelled) setLoaded({ key, products });
      },
      (error: unknown) => {
        if (!cancelled)
          setLoaded({
            key,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (!productId) return { status: "none", retry };
  if (loaded == null || loaded.key !== key) return { status: "loading", retry };
  if (loaded.error != null) return { status: "error", error: loaded.error, retry };
  const product = pickProduct(loaded.products, productId);
  if (product == null) return { status: "none", retry };
  // A variant id passed as `productId` chooses that variant.
  const chosen =
    variantId ?? (pickVariant(product, productId) != null ? productId : undefined);
  const variant = pickVariant(product, chosen);
  const model = resolveModel(product, chosen);
  return {
    status: model != null ? "ready" : "none",
    model,
    product,
    variant,
    retry,
  };
}

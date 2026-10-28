import { withClientParam } from "@/src/lib/client-header";
import type { BitsnapModels } from "@/src/models";

export type PublicListProduct = BitsnapModels.PublicListProduct;
export type ProductListData = BitsnapModels.ProductListResponse;

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;

export type ProductListQuery = {
  projectID: string;
  /** Origin of the Bitsnap backend (or of a custom domain), without a path. */
  host: string;
  locale?: string;
  search?: string;
  limit: number;
  offset: number;
};

export class ProductListError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProductListError";
    this.status = status;
  }
}

/** Page size within what the backend accepts (1 to 48, default 24). */
export function clampPageSize(pageSize?: number): number {
  if (pageSize == null || !Number.isFinite(pageSize)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
}

export function pageCountFor(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** Origin without trailing slashes, so equal hosts compare equal as strings. */
export function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

export function buildProductListURL(query: ProductListQuery): string {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  if (query.locale) {
    params.set("locale", query.locale);
  }
  const search = query.search?.trim();
  if (search) {
    params.set("search", search);
  }

  const host = normalizeHost(query.host);
  return `${host}/api/integrations/${encodeURIComponent(
    query.projectID,
  )}/public-commerce/product-list?${params.toString()}`;
}

function isProductListData(value: unknown): value is ProductListData {
  return (
    typeof value === "object" &&
    value != null &&
    Array.isArray((value as ProductListData).items) &&
    typeof (value as ProductListData).totalCount === "number"
  );
}

/**
 * Loads one page of the catalog with a plain, credential-less `fetch`. It does
 * not touch the global project ID or host.
 */
export async function fetchProductList(
  query: ProductListQuery,
  signal?: AbortSignal,
): Promise<ProductListData> {
  const response = await fetch(withClientParam(buildProductListURL(query)), {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new ProductListError(
      `Could not load products (${response.status})`,
      response.status,
    );
  }

  const payload: unknown = await response.json();
  if (!isProductListData(payload)) {
    throw new ProductListError("Unexpected product list response");
  }

  return payload;
}

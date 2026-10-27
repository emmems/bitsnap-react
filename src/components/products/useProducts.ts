import { useCallback, useEffect, useMemo, useState } from "react";
import { HOST } from "../checkout/constants";
import {
  clampPageSize,
  fetchProductList,
  pageCountFor,
  type ProductListData,
  type PublicListProduct,
} from "./fetch";

export type UseProductsOptions = {
  /** Project (shop) ID. */
  projectID: string;
  /**
   * Origin of the Bitsnap backend. Defaults to the library host
   * (`https://bitsnap.pl`, or what `setCustomHost` had set when the component
   * first rendered; later `setCustomHost` calls do not move an existing list).
   * On a custom domain pass the domain itself, or an empty string for
   * same-origin requests.
   */
  host?: string;
  locale?: string;
  /** Products per page, 1 to 48. Defaults to 24. */
  pageSize?: number;
  search?: string;
  /**
   * First page, loaded on the server. It is always used for the first request
   * of the mounted list (the first fetch is skipped and the products are
   * available on the first render), so it has to be the page the props ask
   * for: page 1 with the same `pageSize`, `locale` and `search`. Later changes
   * of the props fetch again.
   */
  initialData?: ProductListData;
};

export type UseProductsResult = {
  /** Products of the current page. Keeps the previous page while loading. */
  products: PublicListProduct[];
  totalCount: number;
  /** Current page, starting at 1. */
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  /** `true` until the current page is available, also during server rendering. */
  isLoading: boolean;
  error: Error | undefined;
  /** Loads the current page again. */
  refetch: () => void;
};

type Snapshot = {
  /** Request the data belongs to; empty when it is not tied to one. */
  requestKey: string;
  data: ProductListData | undefined;
  error: Error | undefined;
};

/**
 * Loads the product catalog page by page. It uses a plain `fetch` without
 * credentials, never reads global state (`setProjectID`, `setCustomHost`) other
 * than the default host, and does nothing during server rendering - pass
 * `initialData` to render products in the server HTML.
 */
export function useProducts(options: UseProductsOptions): UseProductsResult {
  const { projectID, locale, search, initialData } = options;
  // The library host is a mutable global; read it once so a later
  // `setCustomHost` does not change the query of a mounted list.
  const [defaultHost] = useState(() => HOST);
  const host = options.host ?? defaultHost;
  const pageSize = clampPageSize(options.pageSize);

  // Everything that identifies a list; a change resets the page.
  const queryKey = JSON.stringify([
    projectID,
    host,
    locale ?? null,
    search?.trim() ?? null,
    pageSize,
  ]);

  const [pageState, setPageState] = useState({ queryKey, page: 1 });
  if (pageState.queryKey !== queryKey) {
    // Another list: start from page 1 (adjusting state while rendering).
    setPageState({ queryKey, page: 1 });
  }
  const [reloads, setReloads] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    requestKey: initialData != null ? `${queryKey}|1|0` : "",
    data: initialData,
    error: undefined,
  }));

  // A page past the end (the catalog shrank) falls back to the last page once
  // the total is known.
  const totalCount = snapshot.data?.totalCount ?? 0;
  const pageCount = pageCountFor(totalCount, pageSize);
  const requestedPage = pageState.queryKey === queryKey ? pageState.page : 1;
  const page = totalCount > 0 ? Math.min(requestedPage, pageCount) : requestedPage;

  const requestKey = `${queryKey}|${page}|${reloads}`;

  const isCurrent = snapshot.requestKey === requestKey;

  useEffect(() => {
    if (isCurrent) {
      return;
    }

    const controller = new AbortController();
    fetchProductList(
      {
        projectID,
        host,
        locale,
        search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
      controller.signal,
    ).then(
      (data) => {
        if (controller.signal.aborted) {
          return;
        }
        setSnapshot({ requestKey, data, error: undefined });
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setSnapshot((previous) => ({
          requestKey,
          data: previous.data,
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      },
    );

    return () => controller.abort();
    // `requestKey` carries projectID, host, locale, search, pageSize, page and
    // the reload counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, isCurrent]);

  const setPage = useCallback(
    (next: number) => {
      const target = Math.max(1, Math.floor(next));
      setPageState({
        queryKey,
        page: totalCount > 0 ? Math.min(target, pageCount) : target,
      });
    },
    [queryKey, totalCount, pageCount],
  );

  const refetch = useCallback(() => setReloads((value) => value + 1), []);

  return useMemo(
    () => ({
      products: snapshot.data?.items ?? [],
      totalCount,
      page,
      pageCount,
      setPage,
      isLoading: !isCurrent,
      error: isCurrent ? snapshot.error : undefined,
      refetch,
    }),
    [snapshot, totalCount, page, pageCount, setPage, isCurrent, refetch],
  );
}

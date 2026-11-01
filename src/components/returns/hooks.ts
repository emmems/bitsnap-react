import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateReturnRequestResponse,
  GetReturnableOrderResponse,
  ListMyReturnsResponse,
  ListReturnOrdersResponse,
  StartReturnSessionResponse,
  VerifyReturnSessionResponse,
  ReturnOrderDetail,
  ReturnOrderSummary,
  ReturnHistoryEntry,
  ReturnRequestView,
} from "@/src/gen/proto/public/v1/returns_pb";
import { useInstrumentContext } from "@/src/analytics/instrument";
import { rpcProvider } from "@/src/rpc-provider";
import { isSessionExpiredError, mapReturnsError } from "./errors";
import { createIdempotencyKey } from "./idempotency";
import { resolvePagedArguments } from "./legacy";
import {
  returnsQueryKey,
  useReturnsContext,
  type ReturnsChallenge,
  type ReturnsSessionStatus,
} from "./ReturnsProvider";
import { expiryToMillis } from "./session-storage";
import { useReturnsLocale } from "./texts.context";
import type { ReturnsTextKey } from "./texts";

/** React Query style status shared by the query and mutation results. */
type QueryStatus = "pending" | "error" | "success";
type MutationStatus = "idle" | QueryStatus;

/** Anything thrown becomes an `Error`, as React Query results expose them. */
function asError(error: unknown): Error | null {
  if (error == null) {
    return null;
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Text key of a failure, `undefined` while there is none. */
function errorKeyOf(error: unknown): ReturnsTextKey | undefined {
  return error == null ? undefined : mapReturnsError(error);
}

/**
 * Drops the session when a request failed with `SESSION_EXPIRED`. The flow
 * returns to its start because every step that needs a session is gone.
 */
function useDropSessionOnExpiry(error: unknown, clearSession: () => void) {
  useEffect(() => {
    if (isSessionExpiredError(error)) {
      clearSession();
    }
  }, [error, clearSession]);
}

/** Page tokens of the pages visited so far; the first page has no token. */
function usePageTokens(resetKey: unknown) {
  const [tokens, setTokens] = useState<string[]>([""]);

  useEffect(() => {
    setTokens([""]);
  }, [resetKey]);

  return {
    pageToken: tokens[tokens.length - 1] ?? "",
    page: tokens.length,
    push: (token: string) => setTokens((current) => [...current, token]),
    pop: () =>
      setTokens((current) =>
        current.length > 1 ? current.slice(0, -1) : current,
      ),
  };
}

export type UseReturnSessionResult = {
  status: ReturnsSessionStatus;
  isAuthenticated: boolean;
  /** Pending email verification, set after `start` succeeded. */
  challenge: ReturnsChallenge | undefined;
  isStarting: boolean;
  isVerifying: boolean;
  /** Last failure of `start` or `verify`, or of the panel token exchange. */
  error: Error | null;
  errorKey: ReturnsTextKey | undefined;
  /** Same as `isStarting` (`bitsnap-react` 1.6.0 name). */
  starting: boolean;
  /** Same as `isVerifying` (`bitsnap-react` 1.6.0 name). */
  verifying: boolean;
  /**
   * `bitsnap-react` 1.6.0 API: sends a code and resolves with the response
   * (including `challengeId`). Rejects on failure. Also stores the challenge
   * like `start`.
   */
  startSession: (email: string) => Promise<StartReturnSessionResponse>;
  /**
   * `bitsnap-react` 1.6.0 API: verifies a code, stores the session like
   * `verify` and resolves with the response. Rejects on failure.
   */
  verifySession: (input: {
    challengeId: string;
    code: string;
  }) => Promise<VerifyReturnSessionResponse>;
  /** Sends a code to `email`. Resolves to `true` when the code was sent. */
  start: (email: string) => Promise<boolean>;
  /** Verifies the code of the pending challenge. Resolves to `true` on success. */
  verify: (code: string) => Promise<boolean>;
  /** Sends a new code to the email of the pending challenge. */
  resend: () => Promise<boolean>;
  /** Drops the session and the pending challenge. */
  logout: () => void;
};

/** Email verification and the returns session of the nearest provider. */
export function useReturnSession(): UseReturnSessionResult {
  const ctx = useReturnsContext("useReturnSession");
  const startMutation = useMutation(rpcProvider.returns.startReturnSession);
  const verifyMutation = useMutation(rpcProvider.returns.verifyReturnSession);
  const { setChallenge, authenticate, clearSession } = ctx;
  // The widget's language, so the code e-mail is written in it.
  const locale = useReturnsLocale().toLowerCase().startsWith("en") ? "en" : "pl";

  const startSession = useCallback(
    async (email: string) => {
      verifyMutation.reset();
      const trimmed = email.trim();
      const response = await startMutation.mutateAsync({
        projectId: ctx.projectID,
        email: trimmed,
        environment: ctx.environment,
        locale,
      });
      setChallenge({
        challengeId: response.challengeId,
        email: trimmed,
        resendAvailableAt:
          Date.now() + Math.max(0, response.resendAfterSeconds) * 1000,
      });
      return response;
    },
    [ctx.projectID, ctx.environment, locale, setChallenge, startMutation, verifyMutation],
  );

  const verifySession = useCallback(
    async (input: { challengeId: string; code: string }) => {
      const response = await verifyMutation.mutateAsync({
        projectId: ctx.projectID,
        challengeId: input.challengeId,
        code: input.code,
        environment: ctx.environment,
      });
      const expiresAt = expiryToMillis(response.expiresAt);
      if (response.sessionToken === "" || expiresAt == null) {
        throw new Error("EMPTY_SESSION");
      }
      authenticate({ token: response.sessionToken, expiresAt });
      return response;
    },
    [ctx.projectID, ctx.environment, authenticate, verifyMutation],
  );

  const start = useCallback(
    async (email: string) => {
      try {
        await startSession(email);
        return true;
      } catch {
        return false;
      }
    },
    [startSession],
  );

  const verify = useCallback(
    async (code: string) => {
      if (ctx.challenge == null) {
        return false;
      }
      try {
        await verifySession({
          challengeId: ctx.challenge.challengeId,
          code: code.trim(),
        });
        return true;
      } catch {
        return false;
      }
    },
    [ctx.challenge, verifySession],
  );

  const resend = useCallback(
    () => (ctx.challenge != null ? start(ctx.challenge.email) : Promise.resolve(false)),
    [ctx.challenge, start],
  );

  const error = asError(
    startMutation.error ?? verifyMutation.error ?? ctx.exchangeError,
  );

  return {
    status: ctx.status,
    isAuthenticated: ctx.status === "authenticated",
    challenge: ctx.challenge,
    isStarting: startMutation.isPending,
    isVerifying: verifyMutation.isPending,
    starting: startMutation.isPending,
    verifying: verifyMutation.isPending,
    error,
    errorKey: errorKeyOf(error),
    start,
    startSession,
    verifySession,
    verify,
    resend,
    logout: clearSession,
  };
}

type PagedOptions = {
  /** Items per page. Defaults to 10. */
  pageSize?: number;
};

export type UseReturnOrdersResult = {
  orders: ReturnOrderSummary[];
  /** Total number of returnable orders. */
  total: number;
  /** Response for the requested page (React Query style). */
  data: ListReturnOrdersResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  errorKey: ReturnsTextKey | undefined;
  status: QueryStatus;
  isError: boolean;
  isSuccess: boolean;
  /** 1-based number of the current page. */
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
  refetch: () => Promise<unknown>;
};

/**
 * `true` while the session is still being restored or a panel token is being
 * exchanged. A logged out customer is not "loading", as in 1.6.0.
 */
function isSessionPending(ctx: { status: string }): boolean {
  return ctx.status === "hydrating" || ctx.status === "exchanging";
}

/**
 * Orders of the signed-in customer that have lines to return, page by page.
 * Call it with `{ pageSize }` (pages are walked with `next`/`previous`) or, as
 * in `bitsnap-react` 1.6.0, with `(pageSize, pageToken)`; then the explicit
 * token is requested and `data.nextPageToken` drives paging.
 */
export function useReturnOrders(options?: PagedOptions): UseReturnOrdersResult;
export function useReturnOrders(
  pageSize?: number,
  pageToken?: string,
): UseReturnOrdersResult;
export function useReturnOrders(
  first?: number | PagedOptions,
  token?: string,
): UseReturnOrdersResult {
  const ctx = useReturnsContext("useReturnOrders");
  const { pageSize, explicitPageToken } = resolvePagedArguments(first, token);
  const pages = usePageTokens(ctx.token);

  const query = useQuery(
    rpcProvider.returns.listReturnOrders,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      pageSize,
      pageToken: explicitPageToken ?? pages.pageToken,
    },
    { enabled: ctx.token != null },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  const nextPageToken = query.data?.nextPageToken ?? "";

  return {
    orders: query.data?.orders ?? [],
    total: query.data?.total ?? 0,
    data: query.data,
    isLoading: isSessionPending(ctx) || query.isLoading,
    isFetching: query.isFetching,
    error: asError(query.error),
    errorKey: errorKeyOf(query.error),
    status: query.status,
    isError: query.isError,
    isSuccess: query.isSuccess,
    page: pages.page,
    hasNext: nextPageToken !== "",
    hasPrevious: pages.page > 1,
    next: () => {
      if (nextPageToken !== "") {
        pages.push(nextPageToken);
      }
    },
    previous: pages.pop,
    refetch: () => query.refetch(),
  };
}

export type UseReturnableOrderResult = {
  order: ReturnOrderDetail | undefined;
  /** Earlier return requests for this order. */
  returnHistory: ReturnHistoryEntry[];
  /** Response (React Query style): `data.order` is the order. */
  data: GetReturnableOrderResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  errorKey: ReturnsTextKey | undefined;
  status: QueryStatus;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => Promise<unknown>;
};

/**
 * One order with the eligibility of each line. Without an `orderId` the query
 * is disabled.
 */
export function useReturnableOrder(orderId?: string): UseReturnableOrderResult {
  const ctx = useReturnsContext("useReturnableOrder");

  const query = useQuery(
    rpcProvider.returns.getReturnableOrder,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      canonicalOrderId: orderId ?? "",
    },
    { enabled: ctx.token != null && orderId != null && orderId !== "" },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  return {
    order: query.data?.order,
    returnHistory: query.data?.returnHistory ?? [],
    data: query.data,
    isLoading:
      orderId != null && orderId !== "" && (isSessionPending(ctx) || query.isLoading),
    error: asError(query.error),
    errorKey: errorKeyOf(query.error),
    status: query.status,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: () => query.refetch(),
  };
}

export type CreateReturnInput = {
  orderId: string;
  items: { lineId: string; quantity: number }[];
  note?: string;
};

/** Input of the `bitsnap-react` 1.6.0 `mutateAsync`/`mutate`. */
export type LegacyCreateReturnInput = {
  canonicalOrderID: string;
  items: { lineId: string; quantity: number }[];
  note?: string;
  /** Used as given. A fresh key is generated per call when omitted. */
  idempotencyKey?: string;
};

export type UseCreateReturnResult = {
  /**
   * Submits the return request. Resolves to the created request, or
   * `undefined` when it failed (see `error`). Retrying reuses the same
   * idempotency key, so a retry can never create a second request.
   */
  submit: (input: CreateReturnInput) => Promise<ReturnRequestView | undefined>;
  isPending: boolean;
  error: Error | null;
  errorKey: ReturnsTextKey | undefined;
  /**
   * `bitsnap-react` 1.6.0 API (React Query mutation semantics): resolves with
   * the response (`result.request`) and rejects on failure.
   */
  mutateAsync: (
    input: LegacyCreateReturnInput,
  ) => Promise<CreateReturnRequestResponse>;
  /** Fire and forget version of `mutateAsync`; failures land in `error`. */
  mutate: (
    input: LegacyCreateReturnInput,
    options?: {
      onSuccess?: (response: CreateReturnRequestResponse) => void;
      onError?: (error: Error) => void;
    },
  ) => void;
  /** Response of the last successful request. */
  data: CreateReturnRequestResponse | undefined;
  reset: () => void;
  status: MutationStatus;
  isError: boolean;
  isSuccess: boolean;
};

/**
 * Creates a return request. With `submit` the idempotency key is generated
 * once per hook instance, which is once per confirmation screen, and reused on
 * retry.
 */
export function useCreateReturn(): UseCreateReturnResult {
  const ctx = useReturnsContext("useCreateReturn");
  const queryClient = useQueryClient();
  const mutation = useMutation(rpcProvider.returns.createReturnRequest);
  const instrument = useInstrumentContext();
  const idempotencyKey = useRef<string | undefined>(undefined);
  const { clearSession } = ctx;

  const send = useCallback(
    async (input: CreateReturnInput, key: string) => {
      try {
        const response = await mutation.mutateAsync({
          projectId: ctx.projectID,
          sessionToken: ctx.token ?? "",
          canonicalOrderId: input.orderId,
          items: input.items,
          note: input.note ?? "",
          idempotencyKey: key,
        });
        // Quantities and the list of returns changed.
        void queryClient.invalidateQueries({ queryKey: returnsQueryKey() });
        // The flow has no reason picker yet; the note is free text and never leaves the page.
        instrument.track(
          "return_submitted",
          { reason_code: "unspecified", item_count: input.items.length },
          // The order id may be an access token: report no order reference.
          { order_ref: null },
        );
        return response;
      } catch (error) {
        if (isSessionExpiredError(error)) {
          clearSession();
        }
        throw error;
      }
    },
    [ctx.projectID, ctx.token, mutation, queryClient, clearSession, instrument],
  );

  const submit = useCallback(
    async (input: CreateReturnInput) => {
      idempotencyKey.current ??= createIdempotencyKey();
      try {
        const response = await send(input, idempotencyKey.current);
        idempotencyKey.current = undefined;
        return response.request;
      } catch {
        return undefined;
      }
    },
    [send],
  );

  const mutateAsync = useCallback(
    async (input: LegacyCreateReturnInput) => {
      if (ctx.token == null) {
        throw new Error("Verify your email to continue.");
      }
      return send(
        {
          orderId: input.canonicalOrderID,
          items: input.items,
          note: input.note,
        },
        input.idempotencyKey ?? createIdempotencyKey(),
      );
    },
    [ctx.token, send],
  );

  const mutate = useCallback(
    (
      input: LegacyCreateReturnInput,
      options?: {
        onSuccess?: (response: CreateReturnRequestResponse) => void;
        onError?: (error: Error) => void;
      },
    ) => {
      mutateAsync(input).then(
        (response) => options?.onSuccess?.(response),
        (error: unknown) => options?.onError?.(asError(error) as Error),
      );
    },
    [mutateAsync],
  );

  return {
    submit,
    isPending: mutation.isPending,
    error: asError(mutation.error),
    errorKey: errorKeyOf(mutation.error),
    mutateAsync,
    mutate,
    data: mutation.data,
    reset: mutation.reset,
    status: mutation.status,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
  };
}

export type UseMyReturnsResult = {
  returns: ReturnRequestView[];
  total: number;
  /** Response for the requested page (React Query style). */
  data: ListMyReturnsResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  errorKey: ReturnsTextKey | undefined;
  status: QueryStatus;
  isError: boolean;
  isSuccess: boolean;
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
  refetch: () => Promise<unknown>;
};

/**
 * Return requests of the signed-in customer, page by page. Accepts
 * `{ pageSize }` or the `bitsnap-react` 1.6.0 `(pageSize, pageToken)` form,
 * like `useReturnOrders`.
 */
export function useMyReturns(options?: PagedOptions): UseMyReturnsResult;
export function useMyReturns(
  pageSize?: number,
  pageToken?: string,
): UseMyReturnsResult;
export function useMyReturns(
  first?: number | PagedOptions,
  token?: string,
): UseMyReturnsResult {
  const ctx = useReturnsContext("useMyReturns");
  const { pageSize, explicitPageToken } = resolvePagedArguments(first, token);
  const pages = usePageTokens(ctx.token);

  const query = useQuery(
    rpcProvider.returns.listMyReturns,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      pageSize,
      pageToken: explicitPageToken ?? pages.pageToken,
    },
    { enabled: ctx.token != null },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  const nextPageToken = query.data?.nextPageToken ?? "";

  return {
    returns: query.data?.returns ?? [],
    total: query.data?.total ?? 0,
    data: query.data,
    isLoading: isSessionPending(ctx) || query.isLoading,
    isFetching: query.isFetching,
    error: asError(query.error),
    errorKey: errorKeyOf(query.error),
    status: query.status,
    isError: query.isError,
    isSuccess: query.isSuccess,
    page: pages.page,
    hasNext: nextPageToken !== "",
    hasPrevious: pages.page > 1,
    next: () => {
      if (nextPageToken !== "") {
        pages.push(nextPageToken);
      }
    },
    previous: pages.pop,
    refetch: () => query.refetch(),
  };
}

export type UseMyReturnResult = {
  request: ReturnRequestView | undefined;
  isLoading: boolean;
  error: unknown;
  errorKey: ReturnsTextKey | undefined;
  refetch: () => void;
};

/** One return request of the signed-in customer. */
export function useMyReturn(returnId: string): UseMyReturnResult {
  const ctx = useReturnsContext("useMyReturn");

  const query = useQuery(
    rpcProvider.returns.getMyReturn,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      returnId,
    },
    { enabled: ctx.token != null },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  return {
    request: query.data?.request,
    isLoading: isSessionPending(ctx) || query.isLoading,
    error: query.error,
    errorKey: errorKeyOf(query.error),
    refetch: () => query.refetch(),
  };
}

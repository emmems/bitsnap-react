import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReturnOrderDetail,
  ReturnOrderSummary,
  ReturnHistoryEntry,
  ReturnRequestView,
} from "@/src/gen/proto/public/v1/returns_pb";
import { rpcProvider } from "@/src/rpc-provider";
import { isSessionExpiredError, mapReturnsError } from "./errors";
import { createIdempotencyKey } from "./idempotency";
import {
  returnsQueryKey,
  useReturnsContext,
  type ReturnsChallenge,
  type ReturnsSessionStatus,
} from "./ReturnsProvider";
import { expiryToMillis } from "./session-storage";
import type { ReturnsTextKey } from "./texts";

const DEFAULT_PAGE_SIZE = 10;

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
  error: unknown;
  errorKey: ReturnsTextKey | undefined;
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

  const start = useCallback(
    async (email: string) => {
      verifyMutation.reset();
      try {
        const trimmed = email.trim();
        const response = await startMutation.mutateAsync({
          projectId: ctx.projectID,
          email: trimmed,
          environment: ctx.environment,
        });
        setChallenge({
          challengeId: response.challengeId,
          email: trimmed,
          resendAvailableAt:
            Date.now() + Math.max(0, response.resendAfterSeconds) * 1000,
        });
        return true;
      } catch {
        return false;
      }
    },
    [ctx.projectID, ctx.environment, setChallenge, startMutation, verifyMutation],
  );

  const verify = useCallback(
    async (code: string) => {
      if (ctx.challenge == null) {
        return false;
      }
      try {
        const response = await verifyMutation.mutateAsync({
          projectId: ctx.projectID,
          challengeId: ctx.challenge.challengeId,
          code: code.trim(),
          environment: ctx.environment,
        });
        const expiresAt = expiryToMillis(response.expiresAt);
        if (response.sessionToken === "" || expiresAt == null) {
          return false;
        }
        authenticate({ token: response.sessionToken, expiresAt });
        return true;
      } catch {
        return false;
      }
    },
    [ctx.projectID, ctx.environment, ctx.challenge, authenticate, verifyMutation],
  );

  const resend = useCallback(
    () => (ctx.challenge != null ? start(ctx.challenge.email) : Promise.resolve(false)),
    [ctx.challenge, start],
  );

  const error =
    startMutation.error ?? verifyMutation.error ?? ctx.exchangeError;

  return {
    status: ctx.status,
    isAuthenticated: ctx.status === "authenticated",
    challenge: ctx.challenge,
    isStarting: startMutation.isPending,
    isVerifying: verifyMutation.isPending,
    error,
    errorKey: errorKeyOf(error),
    start,
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
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  errorKey: ReturnsTextKey | undefined;
  /** 1-based number of the current page. */
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
  refetch: () => void;
};

/** Orders of the signed-in customer that have lines to return, page by page. */
export function useReturnOrders(
  options: PagedOptions = {},
): UseReturnOrdersResult {
  const ctx = useReturnsContext("useReturnOrders");
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const pages = usePageTokens(ctx.token);

  const query = useQuery(
    rpcProvider.returns.listReturnOrders,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      pageSize,
      pageToken: pages.pageToken,
    },
    { enabled: ctx.token != null },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  const nextPageToken = query.data?.nextPageToken ?? "";

  return {
    orders: query.data?.orders ?? [],
    total: query.data?.total ?? 0,
    isLoading: ctx.token == null || query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    errorKey: errorKeyOf(query.error),
    page: pages.page,
    hasNext: nextPageToken !== "",
    hasPrevious: pages.page > 1,
    next: () => {
      if (nextPageToken !== "") {
        pages.push(nextPageToken);
      }
    },
    previous: pages.pop,
    refetch: () => void query.refetch(),
  };
}

export type UseReturnableOrderResult = {
  order: ReturnOrderDetail | undefined;
  /** Earlier return requests for this order. */
  returnHistory: ReturnHistoryEntry[];
  isLoading: boolean;
  error: unknown;
  errorKey: ReturnsTextKey | undefined;
  refetch: () => void;
};

/** One order with the eligibility of each line. */
export function useReturnableOrder(orderId: string): UseReturnableOrderResult {
  const ctx = useReturnsContext("useReturnableOrder");

  const query = useQuery(
    rpcProvider.returns.getReturnableOrder,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      canonicalOrderId: orderId,
    },
    { enabled: ctx.token != null },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  return {
    order: query.data?.order,
    returnHistory: query.data?.returnHistory ?? [],
    isLoading: ctx.token == null || query.isLoading,
    error: query.error,
    errorKey: errorKeyOf(query.error),
    refetch: () => void query.refetch(),
  };
}

export type CreateReturnInput = {
  orderId: string;
  items: { lineId: string; quantity: number }[];
  note?: string;
};

export type UseCreateReturnResult = {
  /**
   * Submits the return request. Resolves to the created request, or
   * `undefined` when it failed (see `error`). Retrying reuses the same
   * idempotency key, so a retry can never create a second request.
   */
  submit: (input: CreateReturnInput) => Promise<ReturnRequestView | undefined>;
  isPending: boolean;
  error: unknown;
  errorKey: ReturnsTextKey | undefined;
};

/**
 * Creates a return request. The idempotency key is generated once per hook
 * instance, which is once per confirmation screen, and reused on retry.
 */
export function useCreateReturn(): UseCreateReturnResult {
  const ctx = useReturnsContext("useCreateReturn");
  const queryClient = useQueryClient();
  const mutation = useMutation(rpcProvider.returns.createReturnRequest);
  const idempotencyKey = useRef<string | undefined>(undefined);
  const { clearSession } = ctx;

  const submit = useCallback(
    async (input: CreateReturnInput) => {
      idempotencyKey.current ??= createIdempotencyKey();
      try {
        const response = await mutation.mutateAsync({
          projectId: ctx.projectID,
          sessionToken: ctx.token ?? "",
          canonicalOrderId: input.orderId,
          items: input.items,
          note: input.note ?? "",
          idempotencyKey: idempotencyKey.current,
        });
        idempotencyKey.current = undefined;
        // Quantities and the list of returns changed.
        void queryClient.invalidateQueries({ queryKey: returnsQueryKey() });
        return response.request;
      } catch (error) {
        if (isSessionExpiredError(error)) {
          clearSession();
        }
        return undefined;
      }
    },
    [ctx.projectID, ctx.token, mutation, queryClient, clearSession],
  );

  return {
    submit,
    isPending: mutation.isPending,
    error: mutation.error,
    errorKey: errorKeyOf(mutation.error),
  };
}

export type UseMyReturnsResult = {
  returns: ReturnRequestView[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  errorKey: ReturnsTextKey | undefined;
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
  refetch: () => void;
};

/** Return requests of the signed-in customer, page by page. */
export function useMyReturns(options: PagedOptions = {}): UseMyReturnsResult {
  const ctx = useReturnsContext("useMyReturns");
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const pages = usePageTokens(ctx.token);

  const query = useQuery(
    rpcProvider.returns.listMyReturns,
    {
      projectId: ctx.projectID,
      sessionToken: ctx.token ?? "",
      pageSize,
      pageToken: pages.pageToken,
    },
    { enabled: ctx.token != null },
  );
  useDropSessionOnExpiry(query.error, ctx.clearSession);

  const nextPageToken = query.data?.nextPageToken ?? "";

  return {
    returns: query.data?.returns ?? [],
    total: query.data?.total ?? 0,
    isLoading: ctx.token == null || query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    errorKey: errorKeyOf(query.error),
    page: pages.page,
    hasNext: nextPageToken !== "",
    hasPrevious: pages.page > 1,
    next: () => {
      if (nextPageToken !== "") {
        pages.push(nextPageToken);
      }
    },
    previous: pages.pop,
    refetch: () => void query.refetch(),
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
    isLoading: ctx.token == null || query.isLoading,
    error: query.error,
    errorKey: errorKeyOf(query.error),
    refetch: () => void query.refetch(),
  };
}

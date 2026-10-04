import { createClient } from "@connectrpc/connect";
import {
  createConnectQueryKey,
  TransportProvider,
} from "@connectrpc/connect-query";
import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { Environment } from "@/src/gen/proto/common/v1/environment_pb";
import { ReturnsService } from "@/src/gen/proto/public/v1/returns_pb";
import { cn } from "@/src/lib/utils";
import { getRpcTransport, getTransportHost } from "@/src/rpc-provider";
import type { Transport } from "@connectrpc/connect";
import type { ReturnsAppearance } from "./appearance";
import {
  ReturnsAppearanceProvider,
  useReturnsAppearance,
  useReturnsSlot,
} from "./appearance.context";
import {
  clearStoredSession,
  expiryToMillis,
  getBrowserSessionStorage,
  readStoredSession,
  writeStoredSession,
  type StoredReturnsSession,
} from "./session-storage";
import {
  mapLegacyTexts,
  resolveBrandAppearance,
  resolveReturnsEnvironment,
  type LegacyReturnsTheme,
  type ReturnsEnvironmentInput,
  type ReturnsTextsInput,
} from "./legacy";
import { ReturnsTextsProvider } from "./texts.context";

/**
 * Backend environment the returns calls run against. The library has no other
 * environment switch for public API calls, so this defaults to `"production"`.
 */
export type ReturnsEnvironment = "production" | "test";

export type ReturnsSessionStatus =
  /** Server render and first client render: storage has not been read yet. */
  | "hydrating"
  /** A `panelAccessToken` is being exchanged for a returns session. */
  | "exchanging"
  | "anonymous"
  | "authenticated";

/** A pending email verification. */
export type ReturnsChallenge = {
  challengeId: string;
  email: string;
  /** Unix milliseconds when the next code may be requested. */
  resendAvailableAt: number;
};

export type ReturnsContextValue = {
  projectID: string;
  environment: Environment;
  status: ReturnsSessionStatus;
  /** Session token. Never log it. */
  token: string | undefined;
  /** Failure of the last panel token exchange, if any. */
  exchangeError: unknown;
  challenge: ReturnsChallenge | undefined;
  setChallenge: (challenge: ReturnsChallenge | undefined) => void;
  /** Stores a freshly issued session in state and `sessionStorage`. */
  authenticate: (session: StoredReturnsSession) => void;
  /** Drops the session, the pending challenge and cached customer data. */
  clearSession: () => void;
};

const ReturnsContext = createContext<ReturnsContextValue | undefined>(
  undefined,
);

/**
 * Context of the nearest `ReturnsProvider`. Throws a clear error outside of
 * it, naming the component or hook that was misplaced.
 */
export function useReturnsContext(name: string): ReturnsContextValue {
  const value = useContext(ReturnsContext);

  if (value == null) {
    throw new Error(`${name} must be rendered inside <ReturnsProvider>`);
  }

  return value;
}

export type ReturnsProviderProps = {
  /** Bitsnap project ID. */
  projectID: string;
  /**
   * API host. Defaults to the host set with `setCustomHost`/`setHost`, then to
   * `https://bitsnap.pl`. Each provider keeps its own transport.
   */
  host?: string;
  /**
   * Backend environment, `"production"` unless set to `"test"`. The proto
   * `Environment` enum is accepted too.
   */
  environment?: ReturnsEnvironmentInput;
  /** Theme, tokens and per-element overrides. */
  appearance?: ReturnsAppearance;
  /**
   * Text overrides, applied whatever the locale. The keys of `bitsnap-react`
   * 1.6.0 (`title`, `email`, `sendCode`, ...) are accepted too; our own keys
   * win when both are given.
   */
  texts?: ReturnsTextsInput;
  /** `bitsnap-react` 1.6.0 brand color. Explicit `appearance.tokens` win. */
  theme?: LegacyReturnsTheme;
  /** Locale of texts, dates and money. Defaults to the library locale. */
  locale?: string;
  /**
   * Customer panel access token. When set, it is exchanged for a returns
   * session on mount, so the customer needs no second verification code.
   * Changing or removing it drops the session.
   */
  panelAccessToken?: string;
  /** Class of the themed root element. */
  className?: string;
  children?: ReactNode;
};

/** Key prefix that matches every returns query, for invalidation and removal. */
export function returnsQueryKey(): readonly unknown[] {
  return createConnectQueryKey({
    schema: ReturnsService,
    cardinality: undefined,
  });
}

/** Longest delay `setTimeout` accepts. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function SessionProvider({
  projectID,
  environment,
  transport,
  panelAccessToken,
  className,
  children,
}: {
  projectID: string;
  environment: Environment;
  transport: Transport;
  panelAccessToken?: string;
  className?: string;
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const { boundaryClassName, boundaryStyle } = useReturnsAppearance();
  const root = useReturnsSlot("root");

  const [session, setSession] = useState<{
    status: ReturnsSessionStatus;
    token?: string;
    expiresAt?: number;
  }>({ status: "hydrating" });
  const [exchangeError, setExchangeError] = useState<unknown>();
  const [challenge, setChallenge] = useState<ReturnsChallenge>();
  const previousPanelToken = useRef<string | undefined>(undefined);

  const dropCachedData = useCallback(() => {
    // Query inputs carry the session token, so cached customer data must not
    // outlive the session. Only returns queries are touched.
    queryClient.removeQueries({ queryKey: returnsQueryKey() });
  }, [queryClient]);

  const clearSession = useCallback(() => {
    clearStoredSession(getBrowserSessionStorage(), projectID);
    setChallenge(undefined);
    setSession({ status: "anonymous" });
    dropCachedData();
  }, [projectID, dropCachedData]);

  const authenticate = useCallback(
    (next: StoredReturnsSession) => {
      writeStoredSession(getBrowserSessionStorage(), projectID, next);
      setExchangeError(undefined);
      setChallenge(undefined);
      setSession({
        status: "authenticated",
        token: next.token,
        expiresAt: next.expiresAt,
      });
    },
    [projectID],
  );

  // Hydrates from `sessionStorage`, or exchanges the panel token. Runs after
  // mount, so render never touches `window`.
  useEffect(() => {
    let cancelled = false;
    const storage = getBrowserSessionStorage();

    if (panelAccessToken == null || panelAccessToken === "") {
      const hadPanelToken = previousPanelToken.current != null;
      previousPanelToken.current = undefined;

      if (hadPanelToken) {
        clearSession();
        return;
      }

      const stored = readStoredSession(storage, projectID);
      setSession(
        stored != null
          ? {
              status: "authenticated",
              token: stored.token,
              expiresAt: stored.expiresAt,
            }
          : { status: "anonymous" },
      );
      return;
    }

    previousPanelToken.current = panelAccessToken;
    clearStoredSession(storage, projectID);
    dropCachedData();
    setExchangeError(undefined);
    setSession({ status: "exchanging" });

    createClient(ReturnsService, transport)
      .exchangePanelSession({
        projectId: projectID,
        accessToken: panelAccessToken,
        environment,
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const expiresAt = expiryToMillis(response.expiresAt);
        if (response.sessionToken === "" || expiresAt == null) {
          throw new Error("EMPTY_SESSION");
        }
        authenticate({ token: response.sessionToken, expiresAt });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setExchangeError(error);
        setSession({ status: "anonymous" });
      });

    return () => {
      cancelled = true;
    };
    // `clearSession`, `authenticate` and `dropCachedData` only change with the
    // project or the query client, which are already covered.
  }, [panelAccessToken, projectID, environment, transport]);

  // Expired sessions are dropped even when the page stays open.
  useEffect(() => {
    if (session.status !== "authenticated" || session.expiresAt == null) {
      return;
    }
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clearSession();
      return;
    }
    const timer = setTimeout(
      clearSession,
      Math.min(remaining, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [session.status, session.expiresAt, clearSession]);

  const value = useMemo<ReturnsContextValue>(
    () => ({
      projectID,
      environment,
      status: session.status,
      token: session.token,
      exchangeError,
      challenge,
      setChallenge,
      authenticate,
      clearSession,
    }),
    [
      projectID,
      environment,
      session.status,
      session.token,
      exchangeError,
      challenge,
      authenticate,
      clearSession,
    ],
  );

  return (
    <ReturnsContext.Provider value={value}>
      <div
        data-bitsnap-returns="root"
        data-bitsnap-returns-slot="root"
        className={cn("bitsnap-react", boundaryClassName, className, root.className)}
        style={{ ...boundaryStyle, ...root.style } as CSSProperties}
      >
        {children}
      </div>
    </ReturnsContext.Provider>
  );
}

/**
 * Holds everything the returns views share: the per-instance transport, the
 * query client (when the app has none), appearance, texts and the returns
 * session. It renders the themed root element, so step components composed
 * under it are themed without extra markup.
 *
 * ```tsx
 * <ReturnsProvider projectID="…" appearance={brand}>
 *   <ReturnsOrderList onSelectOrder={setOrderId} />
 * </ReturnsProvider>
 * ```
 */
export function ReturnsProvider({
  projectID,
  host,
  environment,
  appearance,
  texts,
  theme,
  locale,
  panelAccessToken,
  className,
  children,
}: ReturnsProviderProps) {
  const existingQueryClient = useContext(QueryClientContext);
  const [ownQueryClient] = useState(() =>
    existingQueryClient == null
      ? new QueryClient({ defaultOptions: { queries: { staleTime: 5000 } } })
      : undefined,
  );

  const resolvedHost = host ?? getTransportHost();
  const transport = useMemo(
    () => getRpcTransport(resolvedHost),
    [resolvedHost],
  );

  const brandColor = theme?.brandColor;
  const resolvedAppearance = useMemo(
    () => resolveBrandAppearance(appearance, { brandColor }),
    [appearance, brandColor],
  );
  const resolvedTexts = useMemo(() => mapLegacyTexts(texts), [texts]);

  const content = (
    <TransportProvider transport={transport}>
      <ReturnsAppearanceProvider appearance={resolvedAppearance}>
        <ReturnsTextsProvider texts={resolvedTexts} locale={locale}>
          <SessionProvider
            projectID={projectID}
            environment={resolveReturnsEnvironment(environment)}
            transport={transport}
            panelAccessToken={panelAccessToken}
            className={className}
          >
            {children}
          </SessionProvider>
        </ReturnsTextsProvider>
      </ReturnsAppearanceProvider>
    </TransportProvider>
  );

  return existingQueryClient == null && ownQueryClient != null ? (
    <QueryClientProvider client={ownQueryClient}>{content}</QueryClientProvider>
  ) : (
    content
  );
}

/** Name of {@link ReturnsProvider} in `bitsnap-react` 1.6.0. */
export const BitsnapReturnsProvider = ReturnsProvider;

export type BitsnapReturnsProviderProps = ReturnsProviderProps;

"use client";

import { Code, ConnectError, createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { Environment } from "../gen/proto/common/v1/environment_pb";
import { ReturnsService } from "../gen/proto/public/v1/returns_pb";
import type {
  ReturnOrderDetail,
  ReturnRequestView,
  ReturnOrderSummary,
} from "../gen/proto/public/v1/returns_pb";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { createContext, useContext, useMemo, useRef, useState } from "react";

export type BitsnapReturnsProviderProps = {
  projectID: string;
  host?: string;
  environment?: Environment;
  children: React.ReactNode;
};

type ReturnsContextValue = {
  projectID: string;
  host: string;
  environment: Environment;
  client: Client<typeof ReturnsService>;
  sessionToken?: string;
  setSession: (token?: string, expiresAt?: number) => void;
  expiresAt?: number;
};

const ReturnsContext = createContext<ReturnsContextValue | null>(null);

/** Provider for the returns hooks when building a custom customer flow. */
export function BitsnapReturnsProvider({
  projectID,
  host = "https://bitsnap.pl",
  environment = Environment.PRODUCTION,
  children,
}: BitsnapReturnsProviderProps) {
  const scope = `${host.replace(/\/$/, "")}|${projectID}|${environment}`;
  const [session, setSessionState] = useState<{ token: string; expiresAt?: number; scope: string }>();
  const sessionToken = session?.scope === scope ? session.token : undefined;
  const expiresAt = session?.scope === scope ? session.expiresAt : undefined;
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 0, refetchOnWindowFocus: true } } }));
  const client = useMemo(
    () =>
      createClient(
        ReturnsService,
        createConnectTransport({
      baseUrl: `${host.replace(/\/$/, "")}/api/rpc`,
          useBinaryFormat: true,
        }),
      ),
    [host],
  );
  const contextValue = useMemo(
    () => ({
      projectID,
      host: host.replace(/\/$/, ""),
      environment,
      client,
      sessionToken,
      setSession: (token?: string, expiry?: number) => setSessionState(
        token ? { token, expiresAt: expiry, scope } : undefined,
      ),
      expiresAt,
    }),
    [projectID, host, environment, client, sessionToken, expiresAt, scope],
  );

  return <QueryClientProvider client={queryClient}><ReturnsContext.Provider value={contextValue}>{children}</ReturnsContext.Provider></QueryClientProvider>;
}

function useReturnsContext() {
  const value = useContext(ReturnsContext);
  if (!value) throw new Error("Wrap returns hooks in BitsnapReturnsProvider.");
  return value;
}

function handleSessionError(error: unknown, clear: () => void) {
  if (error instanceof ConnectError && error.code === Code.Unauthenticated) clear();
  throw error;
}

export function useReturnSession() {
  const ctx = useReturnsContext();
  const start = useMutation({
    mutationFn: (email: string) =>
      ctx.client.startReturnSession({ projectId: ctx.projectID, email, environment: ctx.environment }),
  });
  const verify = useMutation({
    mutationFn: async ({ challengeId, code }: { challengeId: string; code: string }) => {
      const result = await ctx.client.verifyReturnSession({
        projectId: ctx.projectID,
        challengeId,
        code,
        environment: ctx.environment,
      });
      const expiry = result.expiresAt
        ? Number(result.expiresAt.seconds) * 1000 + result.expiresAt.nanos / 1_000_000
        : undefined;
      ctx.setSession(result.sessionToken, expiry);
      return result;
    },
  });
  const logout = () => {
    ctx.setSession(undefined);
    verify.reset();
    start.reset();
  };
  return { startSession: start.mutateAsync, verifySession: verify.mutateAsync, logout, isAuthenticated: Boolean(ctx.sessionToken && (!ctx.expiresAt || Date.now() < ctx.expiresAt)), starting: start.isPending, verifying: verify.isPending, error: start.error ?? verify.error };
}

export function useReturnOrders(pageSize = 20, pageToken = "") {
  const ctx = useReturnsContext();
  const token = ctx.sessionToken;
  return useQuery({
    queryKey: ["bitsnap-returns", ctx.host, ctx.projectID, ctx.environment, pageSize, pageToken, "orders"],
    enabled: Boolean(token && (!ctx.expiresAt || Date.now() < ctx.expiresAt)),
    queryFn: () => ctx.client.listReturnOrders({ projectId: ctx.projectID, sessionToken: token!, pageSize, pageToken }).catch((e) => handleSessionError(e, () => ctx.setSession(undefined))),
  });
}

export function useReturnableOrder(canonicalOrderID?: string) {
  const ctx = useReturnsContext();
  const token = ctx.sessionToken;
  return useQuery({
    queryKey: ["bitsnap-returns", ctx.host, ctx.projectID, ctx.environment, canonicalOrderID, "order"],
    enabled: Boolean(token && canonicalOrderID && (!ctx.expiresAt || Date.now() < ctx.expiresAt)),
    queryFn: () => ctx.client.getReturnableOrder({ projectId: ctx.projectID, sessionToken: token!, canonicalOrderId: canonicalOrderID! }).catch((e) => handleSessionError(e, () => ctx.setSession(undefined))),
  });
}

export function useCreateReturn() {
  const ctx = useReturnsContext();
  const token = ctx.sessionToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { canonicalOrderID: string; items: { lineId: string; quantity: number }[]; note?: string; idempotencyKey?: string }) => {
      if (!token || (ctx.expiresAt && Date.now() >= ctx.expiresAt)) {
        ctx.setSession(undefined);
        throw new Error("Verify your email to continue.");
      }
      return ctx.client.createReturnRequest({
        projectId: ctx.projectID,
        sessionToken: token,
        canonicalOrderId: input.canonicalOrderID,
        items: input.items,
        note: input.note ?? "",
        idempotencyKey: input.idempotencyKey ?? globalThis.crypto.randomUUID(),
      }).catch((e) => handleSessionError(e, () => ctx.setSession(undefined)));
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["bitsnap-returns", ctx.host, ctx.projectID, ctx.environment] }),
  });
}

export function useMyReturns(pageSize = 20, pageToken = "") {
  const ctx = useReturnsContext();
  const token = ctx.sessionToken;
  return useQuery({
    queryKey: ["bitsnap-returns", ctx.host, ctx.projectID, ctx.environment, pageSize, pageToken, "mine"],
    enabled: Boolean(token && (!ctx.expiresAt || Date.now() < ctx.expiresAt)),
    queryFn: () => ctx.client.listMyReturns({ projectId: ctx.projectID, sessionToken: token!, pageSize, pageToken }).catch((e) => handleSessionError(e, () => ctx.setSession(undefined))),
  });
}

export type BitsnapReturnsProps = {
  projectID: string;
  host?: string;
  environment?: Environment;
  texts?: Partial<{
    title: string; email: string; sendCode: string; code: string; verify: string;
    orders: string; submit: string; note: string; loading: string; history: string;
  }>;
  theme?: { brandColor?: string };
  className?: string;
};

const defaultTexts = {
  title: "Request a return", email: "Email address", sendCode: "Send code", code: "Email code",
  verify: "Verify", orders: "Your orders", submit: "Submit return", note: "Note (optional)",
  loading: "Loading…", history: "My return requests",
};

export function BitsnapReturns(props: BitsnapReturnsProps) {
  return (
    <BitsnapReturnsProvider projectID={props.projectID} host={props.host} environment={props.environment}>
      <BitsnapReturnsForm {...props} />
    </BitsnapReturnsProvider>
  );
}

function BitsnapReturnsForm(props: BitsnapReturnsProps) {
  const texts = { ...defaultTexts, ...props.texts };
  const session = useReturnSession();
  const [orderPageToken, setOrderPageToken] = useState("");
  const ordersQuery = useReturnOrders(20, orderPageToken);
  const mineQuery = useMyReturns();
  const create = useCreateReturn();
  const [email, setEmail] = useState("");
  const [challengeID, setChallengeID] = useState("");
  const [code, setCode] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ReturnOrderSummary>();
  const [orderDetail, setOrderDetail] = useState<ReturnOrderDetail>();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<ReturnRequestView>();
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | undefined>(undefined);
  const orderQuery = useReturnableOrder(selectedOrder?.canonicalOrderId);
  React.useEffect(() => { if (orderQuery.data?.order) setOrderDetail(orderQuery.data.order); }, [orderQuery.data]);
  const error = session.error ?? ordersQuery.error ?? orderQuery.error ?? create.error;
  const style = { "--bitsnap-returns-brand": props.theme?.brandColor ?? "#111827" } as React.CSSProperties;

  return (
    <section className={`bitsnap-returns ${props.className ?? ""}`} style={style} aria-live="polite">
      <h2 className="mb-4 text-xl font-semibold">{texts.title}</h2>
      {!session.isAuthenticated && (
        <div className="space-y-3">
          <label className="block text-sm">{texts.email}<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
          {!challengeID ? <button type="button" disabled={session.starting || !email} onClick={async () => { const response = await session.startSession(email); setChallengeID(response.challengeId); }} className="rounded bg-[var(--bitsnap-returns-brand)] px-4 py-2 text-white disabled:opacity-50">{session.starting ? texts.loading : texts.sendCode}</button> : <>
            <label className="block text-sm">{texts.code}<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
            <button type="button" disabled={session.verifying || !code} onClick={() => session.verifySession({ challengeId: challengeID, code })} className="rounded bg-[var(--bitsnap-returns-brand)] px-4 py-2 text-white disabled:opacity-50">{session.verifying ? texts.loading : texts.verify}</button>
            <button type="button" disabled={session.starting} onClick={async () => { const response = await session.startSession(email); setChallengeID(response.challengeId); }} className="ml-3 underline">Resend code</button>
          </>}
        </div>
      )}
      {ordersQuery.isLoading && <p>{texts.loading}</p>}
      {ordersQuery.data != null && !selectedOrder && !created && <div className="space-y-3"><h3 className="font-medium">{texts.orders}</h3>{ordersQuery.data.orders.length === 0 && <p>No eligible orders found.</p>}{ordersQuery.data.orders.map((order) => <button key={order.canonicalOrderId} type="button" onClick={() => setSelectedOrder(order)} className="block w-full rounded border p-3 text-left hover:border-[var(--bitsnap-returns-brand)]"><span className="font-medium">{order.displayReference}</span><span className="ml-2 text-sm text-gray-600">{order.currency} {formatMinor(order.totalMinor)}</span></button>)}{ordersQuery.data.nextPageToken && <button type="button" onClick={() => setOrderPageToken(ordersQuery.data?.nextPageToken ?? "")} className="underline">Next orders</button>}</div>}
      {orderDetail && !created && <div className="space-y-3"><button type="button" onClick={() => { setSelectedOrder(undefined); setOrderDetail(undefined); }} className="text-sm underline">← {texts.orders}</button>{orderDetail.lines.map((line) => <label key={line.lineId} className="flex items-center justify-between gap-3 rounded border p-3"><span>{line.name}<small className="block text-gray-600">{line.availableQuantity} available · {line.currency} {formatMinor(line.paidUnitMinor)}</small></span><input type="number" min={0} max={line.availableQuantity} disabled={!line.eligible} value={quantities[line.lineId] ?? 0} onChange={(e) => setQuantities((prev) => ({ ...prev, [line.lineId]: Math.max(0, Math.min(line.availableQuantity, Number(e.target.value))) }))} className="w-20 rounded border p-2" />{!line.eligible && <small>{line.exclusionReason}</small>}</label>)}<label className="block text-sm">{texts.note}<textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label><button type="button" disabled={create.isPending || !Object.values(quantities).some((q) => q > 0)} onClick={async () => { if (submittingRef.current) return; submittingRef.current = true; idempotencyKeyRef.current ??= globalThis.crypto.randomUUID(); try { const result = await create.mutateAsync({ canonicalOrderID: orderDetail.canonicalOrderId, items: Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([lineId, quantity]) => ({ lineId, quantity })), note, idempotencyKey: idempotencyKeyRef.current }); if (result && "request" in result && result.request) setCreated(result.request); } finally { submittingRef.current = false; } }} className="rounded bg-[var(--bitsnap-returns-brand)] px-4 py-2 text-white disabled:opacity-50">{create.isPending ? texts.loading : texts.submit}</button></div>}
      {created && <div className="rounded border p-4"><h3 className="font-semibold">Return submitted</h3><p>Reference: <strong>{created.reference}</strong></p><p>Status: {created.status}</p>{created.returnInstructions && <p className="mt-2">{created.returnInstructions}</p>}<button type="button" onClick={() => { setCreated(undefined); setSelectedOrder(undefined); setOrderDetail(undefined); setQuantities({}); void mineQuery.refetch(); }} className="mt-3 underline">{texts.history}</button></div>}
      {mineQuery.data?.returns && mineQuery.data.returns.length > 0 && !created && <div className="mt-6"><h3 className="mb-2 font-medium">{texts.history}</h3>{mineQuery.data.returns.map((item) => <div key={item.id} className="border-t py-2"><strong>{item.reference}</strong><span className="ml-2">{item.status}</span></div>)}</div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error.message}</p>}
    </section>
  );
}

function formatMinor(amount: bigint | number) {
  return (Number(amount) / 100).toFixed(2);
}

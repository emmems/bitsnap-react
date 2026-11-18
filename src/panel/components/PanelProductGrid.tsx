import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  FailureMessage,
  UserProductSchema,
  UserProductType,
  type UserProduct,
} from "../../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useQuery } from "../../rpc-provider";
import { Button } from "../../ui/button";
import {
  BookOpen,
  Files,
  Headphones,
  MessageCircle,
  Ticket,
  Users,
} from "lucide-react";
import { getProductTexts } from "./products/texts";

import { renderText } from "@/src/lib/render.text";
import { fromJsonString } from "@bufbuild/protobuf";
import type { PanelScreen, PanelSearchParamsType } from "../types";
import PanelProductDetails from "./PanelProductDetails";
import { clearPanelSession } from "../session-storage";
import { usePanelConfig } from "../PanelProvider";
import { useModelFiles, type ModelFilesLoad } from "./model-files-load";

// The 3D files list (UI + download RPC) loads only for buyers who have some.
const PanelModelFiles = lazy(() => import("./PanelModelFiles"));

interface PanelProductGridComponentProps {
  projectID: string;
  accessToken: string;
  loginURL: string;
  activeScreen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: PanelSearchParamsType) => void;
  openCourse: (accessId: string) => void;
  /** Opens "Wiadomości" (CHAT and COMMUNITY products). */
  openMessages?: () => void;
}

const PanelProductGridComponent = ({
  accessToken,
  projectID,
  loginURL,
  activeScreen,
  params,
  setParams,
  openCourse,
  openMessages,
}: PanelProductGridComponentProps) => {
  const { host } = usePanelConfig();
  const {
    data: products,
    isLoading: isProductsLoading,
    error: productsError,
    refetch,
  } = useQuery(rpcProvider.publicApi.userPanelGetProducts, {
    accessToken: accessToken,
  });
  const modelFiles = useModelFiles(accessToken, projectID);
  const decision = decidePanelProducts({
    products: isProductsLoading
      ? { status: "loading" }
      : productsError != null
        ? { status: "error" }
        : products?.result.case === "success"
          ? { status: "ok", count: products.result.value.products.length }
          : products?.result.case === "failure"
            ? {
                status: "failure",
                unauthorized:
                  products.result.value === FailureMessage.UNAUTHORIZED,
              }
            : { status: "error" },
    modelFiles,
  });

  // Only an expired session signs the buyer out; an empty list or another
  // failure keeps them in (a buyer of 3D files only has no access products).
  useEffect(() => {
    if (decision.kind !== "signed-out") return;
    clearPanelSession(projectID, host);
    window.location.href = loginURL;
  }, [decision.kind, projectID, host, loginURL]);

  if (decision.kind === "loading" || decision.kind === "signed-out") {
    return (
      <div
        role="status"
        aria-label={getProductTexts().loading}
        aria-busy="true"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-72 rounded-xl bg-(--panel-surface-2) motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }

  const productsList =
    products && products.result.case === "success"
      ? products.result.value.products
      : [];
  const models = modelFiles.status === "ready" ? modelFiles.models : [];
  const filesSection =
    models.length > 0 ? (
      <Suspense fallback={null}>
        <PanelModelFiles
          accessToken={accessToken}
          models={models}
        />
      </Suspense>
    ) : null;

  if (decision.kind === "error") {
    return (
      <>
        <PanelProductsError onRetry={() => void refetch()} />
        {filesSection}
      </>
    );
  }

  if (decision.kind === "empty") {
    return <PanelProductsEmpty />;
  }

  return (
    <ProductsComponent
      accessToken={accessToken}
      products={productsList}
      activeScreen={activeScreen}
      params={params}
      setParams={setParams}
      openCourse={openCourse}
      openMessages={openMessages}
      filesSection={filesSection}
    />
  );
};

/** Inputs of `decidePanelProducts`, in the shape the RPC answers. */
export type PanelProductsInput = {
  products:
    | { status: "loading" }
    | { status: "ok"; count: number }
    | { status: "failure"; unauthorized: boolean }
    | { status: "error" };
  modelFiles: ModelFilesLoad;
};

export type PanelProductsDecision =
  | { kind: "loading" }
  /** The session expired: clear it and go to the login page. */
  | { kind: "signed-out" }
  /** Products and/or 3D files to show. */
  | { kind: "list" }
  /** Nothing bought in this shop yet. */
  | { kind: "empty" }
  /** The products could not be loaded (3D files, if any, still show). */
  | { kind: "error" };

/**
 * What the products screen shows. Pure, so the sign-out rule is tested
 * without a browser: only an expired session (`UNAUTHORIZED` from either
 * call) signs the buyer out. Older panels also signed out on an empty list
 * or any failure, which locked out buyers of 3D files only.
 */
export function decidePanelProducts({
  products,
  modelFiles,
}: PanelProductsInput): PanelProductsDecision {
  if (products.status === "failure" && products.unauthorized) {
    return { kind: "signed-out" };
  }
  if (products.status === "loading") return { kind: "loading" };
  // Access products show at once; the 3D files join the list when they arrive.
  if (products.status === "ok" && products.count > 0) return { kind: "list" };
  if (modelFiles.status === "loading") return { kind: "loading" };
  if (products.status === "failure" || products.status === "error") {
    return modelFiles.status === "unauthorized"
      ? { kind: "signed-out" }
      : { kind: "error" };
  }
  const models = modelFiles.status === "ready" ? modelFiles.models.length : 0;
  if (products.count === 0 && models === 0) return { kind: "empty" };
  return { kind: "list" };
}

function PanelProductsEmpty() {
  const t = getProductTexts();
  return (
    <div className="flex flex-col items-start gap-1" data-testid="panel-empty">
      <h3 className="text-2xl">{t.hello}</h3>
      <p className="text-sm text-(--panel-muted)">{t.empty}</p>
    </div>
  );
}

function PanelProductsError({ onRetry }: { onRetry: () => void }) {
  const t = getProductTexts();
  return (
    <div
      className="flex flex-col items-start gap-3"
      role="alert"
      data-testid="panel-error"
    >
      <p className="text-sm text-(--panel-muted)">{t.productsError}</p>
      <Button type="button" onClick={onRetry} className="min-h-11 text-sm">
        {t.retry}
      </Button>
    </div>
  );
}

export default PanelProductGridComponent;

interface ProductsComponentProps {
  accessToken: string;
  products: UserProduct[];
  filesSection?: ReactNode;
  activeScreen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: PanelSearchParamsType) => void;
  openCourse: (accessId: string) => void;
  openMessages?: () => void;
}

/** CHAT and COMMUNITY products open "Wiadomości", not the product details. */
export function opensMessages(product: UserProduct): boolean {
  return (
    product.productType === UserProductType.CHAT ||
    product.productType === UserProductType.COMMUNITY
  );
}

const ProductsComponent = ({
  accessToken,
  products,
  filesSection,
  activeScreen,
  params,
  setParams,
  openCourse,
  openMessages,
}: ProductsComponentProps) => {
  const t = getProductTexts();
  const [selectedProduct, setSelectedProduct] = useState(() =>
    resolvePanelProduct(params.product, products),
  );
  useEffect(() => {
    setSelectedProduct(resolvePanelProduct(params.product, products));
  }, [params.product, products]);
  const reveal = (product?: UserProduct) => {
    setSelectedProduct(product);
    setParams({
      product: product ? panelProductKey(product) : undefined,
      state: "products",
    });
  };

  useEffect(() => {
    if (
      activeScreen === "products" &&
      selectedProduct?.productType === UserProductType.COURSE
    )
      openCourse(selectedProduct.accessId);
    else if (
      activeScreen === "products" &&
      selectedProduct &&
      opensMessages(selectedProduct) &&
      openMessages
    )
      openMessages();
  }, [activeScreen, selectedProduct, openCourse, openMessages]);

  function handleSelectedProduct(product: UserProduct) {
    if (opensMessages(product) && openMessages) {
      openMessages();
      return;
    }
    // A course opens in its own screen, not in the product details.
    if (product.productType === UserProductType.COURSE) {
      openCourse(product.accessId);
      return;
    }
    reveal(product);
  }

  if (
    activeScreen === "products" &&
    selectedProduct?.productType === UserProductType.COURSE
  )
    return null;

  if (activeScreen === "products" && selectedProduct != undefined) {
    return (
      <PanelProductDetails
        key={panelProductKey(selectedProduct)}
        accessToken={accessToken}
        product={selectedProduct}
        reveal={reveal}
      />
    );
  }

  return (
    <>
      <h3 className="text-2xl">{t.hello}</h3>
      {products.length > 0 && (
        <p className="text-sm text-(--panel-muted)">
          {t.intro}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {products.map((product) => {
          const [label, action, Icon] =
            product.productType === UserProductType.AUDIO
              ? ([t.audio, t.listen, Headphones] as const)
              : product.productType === UserProductType.COURSE
                ? ([t.course, t.openCourse, BookOpen] as const)
                : product.productType === UserProductType.CHAT
                  ? ([t.chat, t.openMessages, MessageCircle] as const)
                  : product.productType === UserProductType.COMMUNITY
                    ? ([t.community, t.openMessages, Users] as const)
                : product.productType === UserProductType.TICKET
                  ? ([t.ticket, t.showTicket, Ticket] as const)
                  : ([t.files, t.downloadFiles, Files] as const);
          return (
            <button
              type="button"
              key={panelProductKey(product)}
              onClick={() => handleSelectedProduct(product)}
              className="flex min-h-11 min-w-0 flex-col overflow-hidden rounded-xl border border-(--panel-border) bg-(--panel-surface) text-left text-(--panel-fg) transition-colors hover:border-(--panel-muted) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--panel-accent-text-now)"
            >
              <span className="flex w-full flex-col gap-3 bg-(--panel-surface-2) p-3">
                <span className="flex w-fit items-center gap-1.5 rounded-md bg-(--panel-surface) px-2 py-1 text-xs font-medium">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </span>
                <img
                  src={product.productImageUrl}
                  alt={product.productName}
                  draggable={false}
                  className="aspect-square w-full object-contain"
                />
              </span>
              <span className="flex flex-1 flex-col gap-3 p-3">
                <span className="line-clamp-2 font-semibold">
                  {product.productName}
                </span>
                <span className="line-clamp-2 text-sm text-(--panel-muted)">
                  {renderText(product.productDescription)}
                </span>
                <span className="mt-auto pt-2 text-sm font-medium underline underline-offset-4">
                  {action}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {filesSection}
    </>
  );
};

/** Resolve current IDs and old protobuf JSON links against the buyer's library. */
/**
 * The id of a library item in the panel's URL: its type and its access id
 * (e.g. `audio-bv`). Access ids come from a separate table per product type,
 * so an audiobook and a course can share one; the type keeps them apart.
 */
export function panelProductKey(product: UserProduct): string {
  const type = UserProductType[product.productType]?.toLowerCase() ?? "product";
  return `${type}-${product.accessId || product.productId}`;
}

export function resolvePanelProduct(
  value: string | undefined,
  products: UserProduct[],
): UserProduct | undefined {
  if (!value) return undefined;
  const keyed = products.find((product) => panelProductKey(product) === value);
  if (keyed) return keyed;
  // Links from before `panelProductKey`: a bare access id or product id.
  const match = products.find(
    (product) =>
      (product.accessId || product.productId) === value ||
      product.productId === value,
  );
  if (match) return match;
  try {
    const legacy = fromJsonString(UserProductSchema, value);
    return products.find(
      (product) =>
        (legacy.accessId
          ? product.accessId === legacy.accessId
          : product.productId === legacy.productId) &&
        (legacy.productType === UserProductType.UNKNOWN ||
          product.productType === legacy.productType),
    );
  } catch {
    return undefined;
  }
}

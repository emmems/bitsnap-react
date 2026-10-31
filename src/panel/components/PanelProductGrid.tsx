import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  FailureMessage,
  UserProductSchema,
  UserProductType,
  type UserProduct,
} from "../../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useQuery } from "../../rpc-provider";
import { Button } from "../../ui/button";
import LoadingIndicator from "../LoadingIndicator";

import { renderText } from "@/src/lib/render.text";
import { fromJsonString, toJsonString } from "@bufbuild/protobuf";
import type { PanelScreen, PanelSearchParamsType } from "../types";
import PanelProductDetails from "./PanelProductDetails";
import { clearPanelSession } from "../session-storage";
import { usePanelConfig } from "../PanelProvider";
import { getLocale } from "../../components/checkout/locale";
import { useModelFiles, type ModelFilesLoad } from "./model-files-load";

// The 3D files list (UI + download RPC) loads only for buyers who have some.
const PanelModelFiles = lazy(() => import("./PanelModelFiles"));

interface PanelProductGridComponentProps {
  projectID: string;
  accessToken: string;
  loginURL: string;
  styles: CSSProperties;
  activeScreen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: PanelSearchParamsType) => void;
  openCourse: (accessId: string) => void;
}

const PanelProductGridComponent = ({
  accessToken,
  projectID,
  loginURL,
  styles,
  activeScreen,
  params,
  setParams,
  openCourse,
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
      <div className="flex items-center gap-2 bg-white p-2 dark:bg-black">
        <p className="text-dark font-inter font-medium dark:text-white">
          {getLocale().toLowerCase().startsWith("en") ? "Loading..." : "Ładowanie..."}
        </p>
        <LoadingIndicator />
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
          buttonStyle={styles}
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
      styles={styles}
      activeScreen={activeScreen}
      params={params}
      setParams={setParams}
      openCourse={openCourse}
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
  const en = getLocale().toLowerCase().startsWith("en");
  return (
    <div className="flex flex-col items-start gap-1" data-testid="panel-empty">
      <h3 className="text-2xl">{en ? "Hi 👋" : "Hej 👋"}</h3>
      <p className="text-sm text-neutral-500">
        {en
          ? "You have no products in this shop yet. Your purchases will show up here."
          : "Nie masz jeszcze produktów w tym sklepie. Twoje zakupy pojawią się tutaj."}
      </p>
    </div>
  );
}

function PanelProductsError({ onRetry }: { onRetry: () => void }) {
  const en = getLocale().toLowerCase().startsWith("en");
  return (
    <div className="flex flex-col items-start gap-3" role="alert" data-testid="panel-error">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {en ? "Your products could not be loaded." : "Nie udało się wczytać Twoich produktów."}
      </p>
      <Button type="button" onClick={onRetry} className="text-sm">
        {en ? "Try again" : "Spróbuj ponownie"}
      </Button>
    </div>
  );
}

export default PanelProductGridComponent;

interface ProductsComponentProps {
  accessToken: string;
  products: UserProduct[];
  styles: CSSProperties;
  filesSection?: ReactNode;
  activeScreen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: PanelSearchParamsType) => void;
  openCourse: (accessId: string) => void;
}

const ProductsComponent = ({
  accessToken,
  products,
  styles,
  filesSection,
  activeScreen,
  params,
  setParams,
  openCourse,
}: ProductsComponentProps) => {
  const [selectedProduct, setSelectedProduct] = useState<
    UserProduct | undefined
  >(
    params.product
      ? fromJsonString(UserProductSchema, params.product)
      : undefined,
  );

  const reveal = (product?: UserProduct) => {
    if (product == null) {
      setSelectedProduct(undefined);
      setParams({
        product: undefined,
        state: "products",
      });
    } else {
      setParams({
        product: toJsonString(UserProductSchema, product),
        state: "products",
      });
    }
  };

  function getProductTypeName(type: UserProductType) {
    switch (type) {
      case UserProductType.AUDIO:
        return "Audio";
      case UserProductType.FILE:
        return "Plik";
      case UserProductType.TICKET:
        return "Bilet";
      case UserProductType.COURSE:
        return "Kurs";
      default:
        return undefined;
    }
  }

  function handleSelectedProduct(product: UserProduct) {
    // A course opens in its own screen, not in the product details.
    if (product.productType === UserProductType.COURSE) {
      openCourse(product.accessId);
      return;
    }
    setSelectedProduct(product);
    reveal(product);
  }

  if (activeScreen === "products" && selectedProduct != undefined) {
    return (
      <PanelProductDetails
        accessToken={accessToken}
        product={selectedProduct}
        styles={styles}
        reveal={reveal}
        onOpenCourse={openCourse}
      />
    );
  }

  return (
    <>
      <h3 className="text-2xl">Hej 👋</h3>
      {products.length > 0 && (
        <p className="text-sm text-neutral-500">
          Poniżej znajdziesz swoje produkty
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-9 sm:justify-start">
        {products?.map((product, index) => (
          <section
            onClick={() => handleSelectedProduct(product)}
            key={index}
            className="w-full max-w-xs cursor-pointer rounded drop-shadow-xl dark:border dark:border-slate-600 dark:drop-shadow-none"
          >
            <section className="flex flex-col items-center space-y-2 rounded bg-slate-100 p-4 dark:bg-neutral-900">
              {product.productType && (
                <div className="w-fit self-end rounded bg-red-900 px-4 py-1">
                  <span className="text-sm font-medium text-white dark:text-slate-100">
                    {getProductTypeName(product.productType)}
                  </span>
                </div>
              )}
              <div className="jusitfy-center flex max-h-40 items-center">
                <img
                  src={product.productImageUrl}
                  alt={`Product ${index} Photo`}
                  draggable={false}
                  className="aspect-auto max-h-40"
                />
              </div>
            </section>
            <div className="space-y-4 rounded bg-white p-4 dark:bg-black">
              <h2 className="text-xl font-semibold">{product.productName}</h2>
              <p
                title={product.productDescription}
                className="line-clamp-3 text-sm font-normal text-neutral-600 dark:text-neutral-300"
              >
                {renderText(product.productDescription)}
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectedProduct(product);
                }}
                className="w-full text-sm font-medium transition-opacity duration-300 ease-in-out hover:opacity-80 active:opacity-80"
                style={styles}
              >
                Zobacz
              </Button>
            </div>
          </section>
        ))}
      </div>
      {filesSection}
    </>
  );
};

import { useState, type CSSProperties } from "react";
import {
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

interface PanelProductGridComponentProps {
  accessToken: string;
  loginURL: string;
  styles: CSSProperties;
  activeScreen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: PanelSearchParamsType) => void;
}

const PanelProductGridComponent = ({
  accessToken,
  loginURL,
  styles,
  activeScreen,
  params,
  setParams,
}: PanelProductGridComponentProps) => {
  const { data: products, isLoading: isProductsLoading } = useQuery(
    rpcProvider.publicApi.userPanelGetProducts,
    {
      accessToken: accessToken,
    },
  );

  if (isProductsLoading) {
    return (
      <div className="flex items-center gap-2 bg-white p-2 dark:bg-black">
        <p className="text-dark font-inter font-medium dark:text-white">
          Ładowanie...
        </p>
        <LoadingIndicator />
      </div>
    );
  }

  if (products && products.result.case === "failure") {
    console.warn("error:", `Kod błędu: ${products.result.value}`);
    localStorage.removeItem("__access_token");
    window.location.href = loginURL;
    return null;
  }

  const productsList =
    products && products.result.case === "success"
      ? products.result.value.products
      : [];

  return (
    <ProductsComponent
      accessToken={accessToken}
      products={productsList}
      styles={styles}
      loginURL={loginURL}
      activeScreen={activeScreen}
      params={params}
      setParams={setParams}
    />
  );
};

export default PanelProductGridComponent;

interface ProductsComponentProps {
  accessToken: string;
  products: UserProduct[];
  styles: CSSProperties;
  loginURL: string;
  activeScreen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: PanelSearchParamsType) => void;
}

const ProductsComponent = ({
  accessToken,
  products,
  styles,
  loginURL,
  activeScreen,
  params,
  setParams,
}: ProductsComponentProps) => {
  if (products.length === 0) {
    window.location.href = loginURL;
    return null;
  }

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
      />
    );
  }

  return (
    <>
      <h3 className="text-2xl">Hej 👋</h3>
      <p className="text-sm text-neutral-500">
        Poniżej znajdziesz swoje produkty
      </p>
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
    </>
  );
};

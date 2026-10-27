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
import { cn } from "@/src/lib/utils";
import { DEFAULT_LOCALE } from "../checkout/locale";
import { addProductToCart } from "./add-to-cart";
import {
  getProductListSlotAppearance,
  resolveProductListAppearance,
  type ProductListAppearance,
  type ProductListSlotName,
  type ResolvedProductListAppearance,
} from "./appearance";
import { clampPageSize, type PublicListProduct } from "./fetch";
import { formatProductPrice } from "./format";
import {
  fillProductListText,
  resolveProductListTexts,
  type ProductListTexts,
} from "./texts";
import { useProducts, type UseProductsOptions } from "./useProducts";

/** What `renderItem` gets next to the product. */
export type ProductListItemContext = {
  /** Product page URL from `productHref`. */
  href: string;
  /** Price formatted for the locale and currency, without the "from" prefix. */
  price: string;
  /** Formatted regular price when the product is discounted. */
  compareAtPrice: string | null;
  texts: ProductListTexts;
  locale: string;
  /** Adds the product to the cart the way the built-in button does. */
  addToCart: () => Promise<void>;
};

export type ProductListProps = UseProductsOptions & {
  /**
   * Product page URL. Defaults to the relative `/p/{uniqueSlug}`, which works
   * on a Bitsnap custom domain. Embedded on another site, return the full
   * URL of the product page.
   */
  productHref?: (product: PublicListProduct) => string;
  appearance?: ProductListAppearance;
  /** Text overrides, applied whatever the locale. */
  texts?: Partial<ProductListTexts>;
  /** Replaces the content of a card. The card frame stays. */
  renderItem?: (
    product: PublicListProduct,
    context: ProductListItemContext,
  ) => ReactNode;
  /**
   * Called by the "Add to cart" button instead of the default action
   * (`Bitsnap.addProductToCart`). A rejected promise shows the error message.
   */
  onAddToCart?: (product: PublicListProduct) => void | Promise<void>;
  /** Open the cart drawer after the default add to cart. Defaults to `true`. */
  showCartOnAdd?: boolean;
  className?: string;
};

type ListContext = {
  appearance: ResolvedProductListAppearance;
  texts: ProductListTexts;
  locale: string;
};

const ProductListContext = createContext<ListContext | undefined>(undefined);

function useListContext(): ListContext {
  const value = useContext(ProductListContext);
  if (value == null) {
    throw new Error("ProductList parts must be rendered inside ProductList");
  }
  return value;
}

/** Stable slot attribute, built-in classes and the caller overrides for a slot. */
function useSlot(slot: ProductListSlotName, className?: string) {
  const { appearance } = useListContext();
  const override = getProductListSlotAppearance(appearance, slot);

  return {
    "data-bitsnap-products-slot": slot,
    className: cn(className, override?.className),
    style: override?.style,
  };
}

const BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const BLOCK_BUTTON_CLASS = `${BUTTON_CLASS} w-full`;
const LINK_BUTTON_CLASS = `${BLOCK_BUTTON_CLASS} no-underline`;

type AddStatus = "idle" | "adding" | "added" | "error";

function AddToCartButton({
  product,
  onAdd,
}: {
  product: PublicListProduct;
  onAdd: () => Promise<void>;
}) {
  const { texts } = useListContext();
  const [status, setStatus] = useState<AddStatus>("idle");
  const button = useSlot("addToCartButton", BLOCK_BUTTON_CLASS);
  const message = useSlot("message", "mt-2 text-xs");

  useEffect(() => {
    if (status !== "added") {
      return;
    }
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const click = useCallback(async () => {
    setStatus("adding");
    try {
      await onAdd();
      setStatus("added");
    } catch (error) {
      console.error("bitsnap-react: could not add to the cart", error);
      setStatus("error");
    }
  }, [onAdd]);

  const label =
    status === "adding"
      ? texts.addingToCart
      : status === "added"
        ? texts.addedToCart
        : texts.addToCart;

  return (
    <>
      <button
        type="button"
        {...button}
        disabled={status === "adding"}
        aria-label={`${label}: ${product.name}`}
        onClick={click}
      >
        {label}
      </button>
      {status === "error" ? (
        <p {...message} role="alert">
          {texts.addToCartError}
        </p>
      ) : null}
    </>
  );
}

function ProductCard({
  product,
  href,
  onAdd,
  renderItem,
}: {
  product: PublicListProduct;
  href: string;
  onAdd: () => Promise<void>;
  renderItem?: ProductListProps["renderItem"];
}) {
  const { texts, locale } = useListContext();
  const card = useSlot(
    "card",
    "relative flex flex-col overflow-hidden border transition-colors",
  );
  const cardLink = useSlot("cardLink", "flex flex-1 flex-col no-underline");
  const imageFrame = useSlot("image", "aspect-square w-full overflow-hidden");
  const placeholder = useSlot("imagePlaceholder", "aspect-square w-full");
  const body = useSlot("body", "flex flex-1 flex-col gap-1 p-4");
  const name = useSlot("name", "text-base font-medium leading-snug");
  const description = useSlot("description", "line-clamp-2 text-sm");
  const price = useSlot("price", "mt-auto pt-2 text-base font-semibold");
  const comparePrice = useSlot("comparePrice", "ml-2 text-sm font-normal");
  const badge = useSlot(
    "badge",
    "absolute left-3 top-3 px-2 py-0.5 text-xs font-medium",
  );
  const actions = useSlot("actions", "p-4 pt-0");
  const selectButton = useSlot("selectButton", LINK_BUTTON_CLASS);

  const formattedPrice = formatProductPrice(
    product.price,
    product.currency,
    locale,
  );
  const formattedCompare =
    product.compareAtPrice != null && product.compareAtPrice > product.price
      ? formatProductPrice(product.compareAtPrice, product.currency, locale)
      : null;

  if (renderItem != null) {
    return (
      <li {...card} data-unavailable={product.available ? undefined : ""}>
        {renderItem(product, {
          href,
          price: formattedPrice,
          compareAtPrice: formattedCompare,
          texts,
          locale,
          addToCart: onAdd,
        })}
      </li>
    );
  }

  const imageSource = product.image?.thumbnailUrl ?? product.image?.url;
  const badgeText = !product.available
    ? texts.unavailable
    : product.isRecurring
      ? texts.subscription
      : null;

  return (
    <li {...card} data-unavailable={product.available ? undefined : ""}>
      <a {...cardLink} href={href}>
        {imageSource != null ? (
          <div {...imageFrame}>
            <img
              src={imageSource}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div {...placeholder} aria-hidden="true" />
        )}
        <div {...body}>
          <h3 {...name}>{product.name}</h3>
          {product.shortDescription ? (
            <p {...description}>{product.shortDescription}</p>
          ) : null}
          <p {...price}>
            {product.priceFrom
              ? fillProductListText(texts.priceFrom, { price: formattedPrice })
              : formattedPrice}
            {formattedCompare != null ? (
              <>
                <span className="sr-only">{texts.originalPrice}: </span>
                <del {...comparePrice}>{formattedCompare}</del>
              </>
            ) : null}
          </p>
        </div>
      </a>
      {badgeText != null ? (
        <span
          {...badge}
          data-kind={product.available ? "subscription" : "unavailable"}
        >
          {badgeText}
        </span>
      ) : null}
      <div {...actions}>
        {!product.available ? (
          <button type="button" {...selectButton} disabled>
            {texts.unavailable}
          </button>
        ) : product.addToCart ? (
          <AddToCartButton product={product} onAdd={onAdd} />
        ) : (
          <a {...selectButton} href={href}>
            {product.variantCount > 1 ? texts.chooseOptions : texts.viewProduct}
          </a>
        )}
      </div>
    </li>
  );
}

const GRID_CLASS =
  "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-5 p-0";

function SkeletonGrid({ count, label }: { count: number; label: string }) {
  const grid = useSlot("grid", GRID_CLASS);
  const skeleton = useSlot("skeleton", "aspect-[3/4] animate-pulse");

  return (
    <div {...grid} role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} {...skeleton} aria-hidden="true" />
      ))}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  isLoading,
  onPage,
}: {
  page: number;
  pageCount: number;
  isLoading: boolean;
  onPage: (page: number) => void;
}) {
  const { texts } = useListContext();
  const nav = useSlot(
    "pagination",
    "mt-8 flex items-center justify-center gap-4",
  );
  const button = useSlot("paginationButton", BUTTON_CLASS);
  const indicator = useSlot("pageIndicator", "text-sm");

  return (
    <nav {...nav} aria-label={texts.pagination}>
      <button
        type="button"
        {...button}
        aria-disabled={isLoading || page <= 1}
        onClick={() => {
          if (!isLoading && page > 1) {
            onPage(page - 1);
          }
        }}
      >
        {texts.previousPage}
      </button>
      <span {...indicator} aria-live="polite">
        {fillProductListText(texts.pageOf, { page, pageCount })}
      </span>
      <button
        type="button"
        {...button}
        aria-disabled={isLoading || page >= pageCount}
        onClick={() => {
          if (!isLoading && page < pageCount) {
            onPage(page + 1);
          }
        }}
      >
        {texts.nextPage}
      </button>
    </nav>
  );
}

function ProductListContent({
  options,
  productHref,
  renderItem,
  onAddToCart,
  showCartOnAdd,
}: {
  options: UseProductsOptions;
  productHref: (product: PublicListProduct) => string;
  renderItem?: ProductListProps["renderItem"];
  onAddToCart?: ProductListProps["onAddToCart"];
  showCartOnAdd: boolean;
}) {
  const { texts } = useListContext();
  const { products, page, pageCount, setPage, isLoading, error, refetch } =
    useProducts(options);

  // After a page change by the user, move focus to the products (the button
  // that was pressed stays where it is, but the content above it changes) and
  // bring them into view once the page has loaded.
  const content = useRef<HTMLDivElement>(null);
  const movedPage = useRef(false);
  const changePage = useCallback(
    (next: number) => {
      movedPage.current = true;
      setPage(next);
    },
    [setPage],
  );
  useEffect(() => {
    if (isLoading || !movedPage.current) {
      return;
    }
    movedPage.current = false;
    content.current?.focus({ preventScroll: true });
    content.current?.scrollIntoView({ block: "start" });
  }, [isLoading]);

  const grid = useSlot("grid", GRID_CLASS);
  const empty = useSlot("emptyState", "py-12 text-center text-sm");
  const errorSlot = useSlot("error", "flex flex-col items-center gap-3 py-12 text-center text-sm");
  const retry = useSlot("retryButton", BUTTON_CLASS);

  const { projectID, host } = options;
  const addFor = useCallback(
    (product: PublicListProduct) => () =>
      onAddToCart != null
        ? Promise.resolve(onAddToCart(product))
        : addProductToCart(product, {
            projectID,
            host,
            showCart: showCartOnAdd,
          }),
    [onAddToCart, projectID, host, showCartOnAdd],
  );

  let body: ReactNode;
  if (isLoading && products.length === 0) {
    body = (
      <SkeletonGrid
        count={Math.min(clampPageSize(options.pageSize), 8)}
        label={texts.loading}
      />
    );
  } else if (error != null) {
    body = (
      <div {...errorSlot} role="alert">
        <p>{texts.error}</p>
        <button type="button" {...retry} onClick={refetch}>
          {texts.retry}
        </button>
      </div>
    );
  } else if (products.length === 0) {
    body = <p {...empty}>{texts.empty}</p>;
  } else {
    body = (
      <ul
        {...grid}
        aria-busy={isLoading || undefined}
        className={cn(grid.className, isLoading && "opacity-60")}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            href={productHref(product)}
            onAdd={addFor(product)}
            renderItem={renderItem}
          />
        ))}
      </ul>
    );
  }

  return (
    <div
      ref={content}
      tabIndex={-1}
      className="p-1 outline-none scroll-mt-4"
    >
      {body}
      {pageCount > 1 && error == null ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          isLoading={isLoading}
          onPage={changePage}
        />
      ) : null}
    </div>
  );
}

const defaultProductHref = (product: PublicListProduct) =>
  `/p/${encodeURIComponent(product.uniqueSlug)}`;

/**
 * Responsive grid of the shop's products with pagination, loading, empty and
 * error states. Cards link to the product page and can add to the cart.
 *
 * ```tsx
 * <ProductList projectID="…" locale="pl-PL" initialData={firstPage} />
 * ```
 *
 * It renders on the server: pass `initialData` (the first page, fetched on the
 * server) to have the products in the HTML; without it the server renders the
 * loading skeleton and the browser fetches the first page.
 */
export function ProductList({
  productHref = defaultProductHref,
  appearance,
  texts,
  renderItem,
  onAddToCart,
  showCartOnAdd = true,
  className,
  ...options
}: ProductListProps) {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const resolvedAppearance = useMemo(
    () => resolveProductListAppearance(appearance),
    [appearance],
  );
  const resolvedTexts = useMemo(
    () => resolveProductListTexts(locale, texts),
    [locale, texts],
  );
  const context = useMemo(
    () => ({ appearance: resolvedAppearance, texts: resolvedTexts, locale }),
    [resolvedAppearance, resolvedTexts, locale],
  );
  const root = getProductListSlotAppearance(resolvedAppearance, "root");

  return (
    <ProductListContext.Provider value={context}>
      <div
        data-bitsnap-products="root"
        data-bitsnap-products-slot="root"
        className={cn(
          "bitsnap-react",
          resolvedAppearance.boundaryClassName,
          className,
          root?.className,
        )}
        style={
          { ...resolvedAppearance.boundaryStyle, ...root?.style } as CSSProperties
        }
      >
        <ProductListContent
          options={options}
          productHref={productHref}
          renderItem={renderItem}
          onAddToCart={onAddToCart}
          showCartOnAdd={showCartOnAdd}
        />
      </div>
    </ProductListContext.Provider>
  );
}

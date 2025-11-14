import { useAutoAnimate } from "@formkit/auto-animate/react";
import { createPortal } from "react-dom";
import CartComponentContent from "./CartComponentContent";
import CartProvider from "./CartProvider";

interface Props {
  isVisible: boolean;
  shouldHide: () => void;
}

function CartComponent({ isVisible, shouldHide }: Props) {
  const [parent] = useAutoAnimate(/* optional config */);

  return (
    <div ref={parent} className={"bitsnap-checkout dark"} style={{ zIndex: 999999 }}>
      {isVisible && (
        <>
          <div
            className={
              "fixed top-0 right-0 left-0 bottom-0 bg-black/30 cursor-pointer z-10"
            }
            onClick={shouldHide}
          ></div>
          <div
            className={
              "fixed z-20 top-0 right-0 bottom-0 w-full md:w-[350px] xl:w-[420px] dark:bg-neutral-900 bg-neutral-300 dark:text-neutral-200 text-neutral-900 flex flex-col"
            }
          >
            <div
              className={
                "mx-3 mt-7 flex justify-between items-center"
              }
            >
              <h1 className={"text-2xl font-medium"}>Koszyk</h1>
              <button
                className="rounded-full dark:hover:bg-neutral-700 hover:bg-neutral-400 p-2 transition"
                onClick={shouldHide}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-x"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <CartComponentContent className={"grow"} />
          </div>
        </>
      )}
    </div>
  );
}

const WrapperCartComponent = (props: Props) => {
  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <CartProvider>
      <CartComponent {...props} />
    </CartProvider>,
    document.body,
  );
};

export default WrapperCartComponent;

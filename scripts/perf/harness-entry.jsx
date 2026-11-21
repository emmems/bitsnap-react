// Minimal page for scripts/perf/cart-open.mjs: the cart button of the SDK under test
// plus an "add" button that does what a shop does (addProductToCart, then showCart).
// `bitsnap-sdk` is aliased by the script to <sdk dist>/index.mjs.
import { createRoot } from "react-dom/client";
import { Bitsnap, BitsnapCheckout } from "bitsnap-sdk";
import "bitsnap-sdk-css";

const ADD_ID = "perf-1";

function App() {
  return (
    <main>
      <BitsnapCheckout projectID="perf">
        <span>Cart</span>
      </BitsnapCheckout>
      <button
        id="perf-add"
        type="button"
        onClick={async () => {
          const start = performance.now();
          const err = await Bitsnap.addProductToCart(ADD_ID, 1);
          const added = performance.now();
          Bitsnap.showCart();
          // `added` (the add promise resolved, just before showCart) is where the drawer time starts (A3).
          window.__perfAdd = { addMs: added - start, err: err ?? null, added, shownAt: performance.now(), timeOrigin: performance.timeOrigin };
        }}
      >
        Add to cart
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
window.__perfReady = true;

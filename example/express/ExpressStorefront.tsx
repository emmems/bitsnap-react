"use client";

import { useState } from "react";
import {
  BitsnapCheckout,
  InPostPayButton,
  RevolutPayButton,
  setProjectID,
  type ExpressItem,
} from "bitsnap-react";

/**
 * A custom storefront with its own cart state.
 *
 * `setProjectID` is the public hashed project id; the server needs no key for
 * a normal checkout. Prices are calculated by Bitsnap, never sent from here.
 */

const projectID = process.env.NEXT_PUBLIC_BITSNAP_PROJECT_ID ?? "";
setProjectID(projectID);

type Product = {
  /** The catalog product or single variant id. */
  id: string;
  name: string;
  price: string;
};

const products: Product[] = [
  { id: "prodv2_shirt", name: "Shirt", price: "129,00 zł" },
  { id: "prodv2_mug", name: "Mug", price: "49,00 zł" },
];

export function ExpressStorefront() {
  const [cart, setCart] = useState<ExpressItem[]>([]);

  const items: ExpressItem[] = cart;

  return (
    <main style={{ display: "grid", gap: 32, maxWidth: 960, margin: "0 auto" }}>
      <section>
        <h1>Products</h1>
        {products.map((product) => (
          <article key={product.id} style={{ display: "grid", gap: 8, padding: 16 }}>
            <h2 style={{ margin: 0 }}>{product.name}</h2>
            <p style={{ margin: 0 }}>{product.price}</p>
            <button
              type="button"
              onClick={() =>
                setCart((current) => {
                  const existing = current.find((line) => line.id === product.id);
                  return existing == null
                    ? [...current, { id: product.id, quantity: 1 }]
                    : current.map((line) =>
                        line.id === product.id
                          ? { ...line, quantity: line.quantity + 1 }
                          : line,
                      );
                })
              }
            >
              Add to cart
            </button>
            {/* Product page: the first click adds this product and binds it. */}
            <InPostPayButton
              projectID={projectID}
              productId={product.id}
              quantity={1}
              bindingPlace="PRODUCT_CARD"
              locale="pl"
            />
            <RevolutPayButton
              projectID={projectID}
              productId={product.id}
              quantity={1}
              locale="pl"
            />
          </article>
        ))}
      </section>

      <section>
        <h2>Cart</h2>
        {items.length === 0 ? (
          <p>Your cart is empty.</p>
        ) : (
          <>
            <ul>
              {items.map((line) => (
                <li key={line.id}>
                  {line.id} × {line.quantity}
                </li>
              ))}
            </ul>
            {/* Custom cart layout: pass the lines instead of the Bitsnap cart. */}
            <InPostPayButton
              projectID={projectID}
              items={items}
              bindingPlace="BASKET_SUMMARY"
              locale="pl"
              onOrderCreated={() => setCart([])}
            />
            <RevolutPayButton
              projectID={projectID}
              items={items}
              locale="pl"
              onPaymentResult={(outcome) => {
                if (outcome.status === "completed") {
                  setCart([]);
                }
              }}
            />
          </>
        )}
      </section>

      {/* The same providers also appear in the SDK cart drawer's express area. */}
      <BitsnapCheckout projectID={projectID} locale="pl" />
    </main>
  );
}

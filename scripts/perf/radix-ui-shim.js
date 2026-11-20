// Used by cart-open.mjs only when the umbrella package `radix-ui` is not installed in node_modules
// (an SDK build before the move to `@radix-ui/react-slot` imports `{ Slot } from "radix-ui"`;
// that export is the same module as `@radix-ui/react-slot`).
import * as Slot from "@radix-ui/react-slot";

export { Slot };

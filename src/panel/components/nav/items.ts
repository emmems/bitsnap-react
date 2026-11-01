import { Library, Receipt, Undo2, User } from "lucide-react";
import type { PanelTexts } from "../../texts";
import type { PanelScreen } from "../../types";

export const panelNavItems = [
  { screen: "products", label: "libraryNavLabel", icon: Library },
  { screen: "orders", label: "ordersNavLabel", icon: Receipt },
  { screen: "returns", label: "returnsNavLabel", icon: Undo2 },
  { screen: "profile", label: "accountNavLabel", icon: User },
] as const satisfies ReadonlyArray<{ screen: PanelScreen; label: keyof PanelTexts; icon: typeof Library }>;

export function navScreen(screen: PanelScreen): PanelScreen {
  if (screen === "course") return "products";
  if (screen === "order-details") return "orders";
  if (screen === "return-details") return "returns";
  return screen;
}

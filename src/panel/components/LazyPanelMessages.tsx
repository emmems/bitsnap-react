import { lazy, Suspense } from "react";
import type { PanelMessagesProps } from "../../chat";
import LoadingIndicator from "../LoadingIndicator";

// The chat (client, views, realtime) is loaded when the buyer opens
// "Wiadomości", so the rest of the panel does not carry it.
const PanelMessages = lazy(() =>
  import("../../chat").then((module) => ({ default: module.PanelMessages })),
);

/** `PanelMessages` loaded on demand. */
export default function LazyPanelMessages(props: PanelMessagesProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-2" role="status">
          <LoadingIndicator />
        </div>
      }
    >
      <PanelMessages {...props} />
    </Suspense>
  );
}

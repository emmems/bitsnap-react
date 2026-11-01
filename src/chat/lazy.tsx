import { lazy, Suspense } from "react";
import type { ChannelProps, ChatThreadProps } from "./widgets";

// The chat view is a separate chunk: shops without chat never load it.
const LazyThread = lazy(() =>
  import("./index").then((module) => ({ default: module.ChatThread })),
);
const LazyChannel = lazy(() =>
  import("./index").then((module) => ({ default: module.Channel })),
);

function Fallback() {
  return (
    <div className="bitsnap-react h-full">
      <div
        role="status"
        aria-busy="true"
        className="h-full min-h-[28rem] w-full rounded-xl border border-neutral-200 bg-white motion-safe:animate-pulse dark:border-neutral-800 dark:bg-neutral-900"
      />
    </div>
  );
}

/**
 * A buyer's pack thread for one service product. Loads the chat on demand;
 * the same component is exported eagerly from `bitsnap-react/chat`.
 */
export function ChatThread(props: ChatThreadProps) {
  return (
    <Suspense fallback={<Fallback />}>
      <LazyThread {...props} />
    </Suspense>
  );
}

/**
 * A community channel. Loads the chat on demand; the same component is
 * exported eagerly from `bitsnap-react/chat`.
 */
export function Channel(props: ChannelProps) {
  return (
    <Suspense fallback={<Fallback />}>
      <LazyChannel {...props} />
    </Suspense>
  );
}

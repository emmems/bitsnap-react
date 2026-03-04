import { lazy, Suspense } from "react";


function MessagePreviewer({ msg }: { msg: string }) {

  if (typeof window == 'undefined') {
    return <></>;
  }

  const RichTextEditorV2 = lazy(() => import("@/src/components/RichTextEditorV2"));

  return <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-2">

      {typeof window !== "undefined" && (
        <Suspense>
          <RichTextEditorV2
            readOnly={true}
            projectID=""
            preloadContent={msg}
          />
        </Suspense>
      )}
    </div>
  </div>
}

export default MessagePreviewer;

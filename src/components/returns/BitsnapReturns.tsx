import { useEffect, useReducer } from "react";
import { cn } from "@/src/lib/utils";
import { useReturnsSlot } from "./appearance.context";
import { ReturnsCodeStep, ReturnsEmailStep } from "./AuthSteps";
import { SkeletonRows } from "./internal";
import { ReturnsMyReturnDetail, ReturnsMyReturnsList } from "./MyReturns";
import {
  ReturnsConfirmation,
  ReturnsOrderDetail,
  ReturnsOrderList,
  ReturnsResult,
} from "./OrderSteps";
import { toReturnsProviderProps, type BitsnapReturnsProps } from "./legacy";
import { ReturnsProvider, useReturnsContext } from "./ReturnsProvider";
import {
  initialReturnsStep,
  reduceReturnsStep,
  RETURNS_STEP_COUNT,
  returnsStepNumber,
} from "./state-machine";
import { useReturnsText } from "./texts.context";

export type { BitsnapReturnsProps } from "./legacy";

function StepIndicator({ current }: { current: number }) {
  const text = useReturnsText();
  const slot = useReturnsSlot("stepIndicator");

  return (
    <p
      data-bitsnap-returns-slot="stepIndicator"
      className={cn("text-xs", slot.className)}
      style={slot.style}
    >
      {text("stepIndicator", { current, total: RETURNS_STEP_COUNT })}
    </p>
  );
}

/** Default step router. All transitions come from the pure state machine. */
function ReturnsRouter({ showLogout }: { showLogout: boolean }) {
  const { status } = useReturnsContext("BitsnapReturns");
  const [step, dispatch] = useReducer(
    reduceReturnsStep,
    initialReturnsStep(false),
  );

  // A valid session (verified code, stored session, exchanged panel token)
  // moves on to the orders; a dropped one returns to the start.
  useEffect(() => {
    if (status === "authenticated") {
      dispatch({ type: "AUTHENTICATED" });
    } else if (status === "anonymous") {
      dispatch({ type: "SESSION_EXPIRED" });
    }
  }, [status]);

  if (status === "hydrating" || status === "exchanging") {
    return <SkeletonRows />;
  }

  const stepNumber = returnsStepNumber(step.name);

  return (
    <div className="flex flex-col gap-4">
      {stepNumber != null && <StepIndicator current={stepNumber} />}
      {step.name === "email" && (
        <ReturnsEmailStep onSubmitted={() => dispatch({ type: "CODE_SENT" })} />
      )}
      {step.name === "code" && (
        <ReturnsCodeStep
          onVerified={() => dispatch({ type: "AUTHENTICATED" })}
          onBack={() => dispatch({ type: "BACK" })}
        />
      )}
      {step.name === "orders" && (
        <ReturnsOrderList
          showLogout={showLogout}
          onSelectOrder={(orderId) =>
            dispatch({ type: "SELECT_ORDER", orderId })
          }
          onOpenMyReturns={() => dispatch({ type: "OPEN_MY_RETURNS" })}
        />
      )}
      {step.name === "order" && (
        <ReturnsOrderDetail
          orderId={step.orderId}
          initialItems={step.items}
          initialNote={step.note}
          onBack={() => dispatch({ type: "BACK" })}
          onContinue={({ items, note }) =>
            dispatch({ type: "REVIEW", items, note })
          }
        />
      )}
      {step.name === "confirmation" && (
        <ReturnsConfirmation
          orderId={step.orderId}
          items={step.items}
          note={step.note}
          onBack={() => dispatch({ type: "BACK" })}
          onSubmitted={(returnId) =>
            dispatch({ type: "SUBMITTED", returnId })
          }
        />
      )}
      {step.name === "result" && (
        <ReturnsResult
          returnId={step.returnId}
          onContinue={() => dispatch({ type: "CONTINUE" })}
          onOpenMyReturns={() => dispatch({ type: "OPEN_MY_RETURNS" })}
        />
      )}
      {step.name === "myReturns" && (
        <ReturnsMyReturnsList
          onSelectReturn={(returnId) =>
            dispatch({ type: "SELECT_RETURN", returnId })
          }
          onBack={() => dispatch({ type: "BACK" })}
        />
      )}
      {step.name === "myReturn" && (
        <ReturnsMyReturnDetail
          returnId={step.returnId}
          onBack={() => dispatch({ type: "BACK" })}
        />
      )}
    </div>
  );
}

/**
 * Customer return flow: email, code, orders, line selection, confirmation and
 * result, plus the list of earlier returns. It is `ReturnsProvider` with the
 * default step router; compose your own page from the step components to
 * change the layout.
 *
 * ```tsx
 * <BitsnapReturns projectID="…" appearance={brand} texts={{ emailStepTitle: "Return a product" }} />
 * ```
 */
export function BitsnapReturns(props: BitsnapReturnsProps) {
  return (
    <ReturnsProvider {...toReturnsProviderProps(props)}>
      <ReturnsRouter showLogout={props.panelAccessToken == null} />
    </ReturnsProvider>
  );
}

import { useEffect, useReducer, useRef } from "react";
import { cn } from "@/src/lib/utils";
import {
  LoginBrandLogo,
  type LoginLogoOptions,
} from "@/src/ui/email-code-login/LoginBrandLogo";
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
import {
  ReturnsProvider,
  useReturnsContext,
  type ReturnsProviderProps,
} from "./ReturnsProvider";
import {
  initialReturnsStep,
  reduceReturnsStep,
  RETURNS_STEP_COUNT,
  returnsStepNumber,
} from "./state-machine";
import { useReturnsLocale, useReturnsText } from "./texts.context";

/**
 * Props of {@link BitsnapReturns}. `showLogo`, `logoUrl` and `logoDarkUrl` set
 * the shop logo above the e-mail and code steps: by default the logo from the
 * shop settings, or Bitsnap's when the shop has none.
 */
export type BitsnapReturnsProps = Omit<ReturnsProviderProps, "children"> &
  LoginLogoOptions;

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
function ReturnsRouter({
  panelToken,
  logo,
}: {
  panelToken: boolean;
  logo: LoginLogoOptions;
}) {
  const { status, challenge, projectID } = useReturnsContext("BitsnapReturns");
  const locale = useReturnsLocale();
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

  // A verification that was pending before a reload or an app switch returns
  // to the code step once, when the stored state has been read.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || status === "hydrating") {
      return;
    }
    restored.current = true;
    if (status === "anonymous" && challenge != null) {
      dispatch({ type: "CODE_SENT" });
    }
  }, [status, challenge]);

  // Without a panel token the server render and the first client render show
  // the email step; a stored session switches to the orders after hydration.
  if (status === "exchanging" || (status === "hydrating" && panelToken)) {
    return <SkeletonRows />;
  }

  const stepNumber = returnsStepNumber(step.name);

  // The logo sits above the step indicator, and stays mounted between the
  // e-mail and the code step; the steps themselves then show none.
  const loginStep = step.name === "email" || step.name === "code";

  return (
    <div className="flex flex-col gap-4">
      {loginStep && (
        <LoginBrandLogo projectId={projectID} locale={locale} {...logo} />
      )}
      {stepNumber != null && <StepIndicator current={stepNumber} />}
      {step.name === "email" && (
        <ReturnsEmailStep
          showLogo={false}
          onSubmitted={() => dispatch({ type: "CODE_SENT" })}
        />
      )}
      {step.name === "code" && (
        <ReturnsCodeStep
          showLogo={false}
          onVerified={() => dispatch({ type: "AUTHENTICATED" })}
          onBack={() => dispatch({ type: "BACK" })}
        />
      )}
      {step.name === "orders" && (
        <ReturnsOrderList
          showLogout={!panelToken}
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
export function BitsnapReturns({
  showLogo,
  logoUrl,
  logoDarkUrl,
  ...props
}: BitsnapReturnsProps) {
  return (
    <ReturnsProvider {...props}>
      <ReturnsRouter
        panelToken={props.panelAccessToken != null && props.panelAccessToken !== ""}
        logo={{ showLogo, logoUrl, logoDarkUrl }}
      />
    </ReturnsProvider>
  );
}

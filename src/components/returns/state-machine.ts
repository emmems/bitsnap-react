/** One line chosen for return. */
export type SelectedReturnLine = {
  lineId: string;
  quantity: number;
};

/** Where the default flow of `BitsnapReturns` currently is. */
export type ReturnsStep =
  | { name: "email" }
  | { name: "code" }
  | { name: "orders" }
  | {
      name: "order";
      orderId: string;
      /** Selection to restore when coming back from the confirmation. */
      items?: SelectedReturnLine[];
      note?: string;
    }
  | {
      name: "confirmation";
      orderId: string;
      items: SelectedReturnLine[];
      note: string;
    }
  | { name: "result"; returnId: string }
  | { name: "myReturns" }
  | { name: "myReturn"; returnId: string };

export type ReturnsStepName = ReturnsStep["name"];

export type ReturnsStepEvent =
  /** A verification code was requested. */
  | { type: "CODE_SENT" }
  /** The session became valid: code verified, stored session or panel token. */
  | { type: "AUTHENTICATED" }
  /** The session was dropped by the backend, expiry or logout. */
  | { type: "SESSION_EXPIRED" }
  | { type: "SELECT_ORDER"; orderId: string }
  | { type: "REVIEW"; items: SelectedReturnLine[]; note: string }
  | { type: "SUBMITTED"; returnId: string }
  | { type: "OPEN_MY_RETURNS" }
  | { type: "SELECT_RETURN"; returnId: string }
  | { type: "BACK" }
  /** Leave the result screen for the order list. */
  | { type: "CONTINUE" };

const STEPS_WITH_SESSION: readonly ReturnsStepName[] = [
  "orders",
  "order",
  "confirmation",
  "result",
  "myReturns",
  "myReturn",
];

/** Steps that cannot be shown without a returns session. */
export function stepRequiresSession(step: ReturnsStepName): boolean {
  return STEPS_WITH_SESSION.includes(step);
}

/** Starts at the orders when a session exists, otherwise at the email. */
export function initialReturnsStep(hasSession: boolean): ReturnsStep {
  return hasSession ? { name: "orders" } : { name: "email" };
}

/**
 * Pure transition function of the default flow. Events that do not apply to
 * the current step leave it unchanged.
 */
export function reduceReturnsStep(
  step: ReturnsStep,
  event: ReturnsStepEvent,
): ReturnsStep {
  switch (event.type) {
    case "SESSION_EXPIRED":
      // Email and code do not need a session; keep a pending verification.
      return stepRequiresSession(step.name) ? { name: "email" } : step;
    case "CODE_SENT":
      return step.name === "email" ? { name: "code" } : step;
    case "AUTHENTICATED":
      return step.name === "email" || step.name === "code"
        ? { name: "orders" }
        : step;
    case "SELECT_ORDER":
      return step.name === "orders"
        ? { name: "order", orderId: event.orderId }
        : step;
    case "REVIEW":
      return step.name === "order"
        ? {
            name: "confirmation",
            orderId: step.orderId,
            items: event.items,
            note: event.note,
          }
        : step;
    case "SUBMITTED":
      return step.name === "confirmation"
        ? { name: "result", returnId: event.returnId }
        : step;
    case "OPEN_MY_RETURNS":
      return step.name === "orders" || step.name === "result"
        ? { name: "myReturns" }
        : step;
    case "SELECT_RETURN":
      return step.name === "myReturns"
        ? { name: "myReturn", returnId: event.returnId }
        : step;
    case "CONTINUE":
      return step.name === "result" ? { name: "orders" } : step;
    case "BACK":
      switch (step.name) {
        case "code":
          return { name: "email" };
        case "order":
        case "myReturns":
          return { name: "orders" };
        case "confirmation":
          return {
            name: "order",
            orderId: step.orderId,
            items: step.items,
            note: step.note,
          };
        case "myReturn":
          return { name: "myReturns" };
        default:
          return step;
      }
  }
}

const STEP_NUMBERS: Partial<Record<ReturnsStepName, number>> = {
  email: 1,
  code: 2,
  orders: 3,
  order: 4,
  confirmation: 5,
  result: 6,
};

export const RETURNS_STEP_COUNT = 6;

/** Position of a step in the return flow, `undefined` for the "my returns" views. */
export function returnsStepNumber(step: ReturnsStepName): number | undefined {
  return STEP_NUMBERS[step];
}

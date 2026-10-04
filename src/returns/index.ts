/**
 * `bitsnap-react/returns` subpath. It keeps the 1.6.0 import path working and
 * exposes the same implementation as the package root: the 1.6.0 names plus
 * the whole returns API.
 */
export {
  BitsnapReturns,
  type BitsnapReturnsProps,
} from "../components/returns/BitsnapReturns";
export {
  BitsnapReturnsProvider,
  ReturnsProvider,
  type BitsnapReturnsProviderProps,
  type ReturnsChallenge,
  type ReturnsEnvironment,
  type ReturnsProviderProps,
  type ReturnsSessionStatus,
} from "../components/returns/ReturnsProvider";
export {
  ReturnsCodeStep,
  ReturnsEmailStep,
  type ReturnsCodeStepProps,
  type ReturnsEmailStepProps,
} from "../components/returns/AuthSteps";
export {
  ReturnsConfirmation,
  ReturnsOrderDetail,
  ReturnsOrderList,
  ReturnsResult,
  type ReturnsConfirmationProps,
  type ReturnsOrderDetailProps,
  type ReturnsOrderListProps,
  type ReturnsResultProps,
} from "../components/returns/OrderSteps";
export {
  ReturnsMyReturnDetail,
  ReturnsMyReturnsList,
  type ReturnsMyReturnDetailProps,
  type ReturnsMyReturnsListProps,
} from "../components/returns/MyReturns";
export {
  useCreateReturn,
  useMyReturn,
  useMyReturns,
  useReturnableOrder,
  useReturnOrders,
  useReturnSession,
  type CreateReturnInput,
  type LegacyCreateReturnInput,
  type UseCreateReturnResult,
  type UseMyReturnResult,
  type UseMyReturnsResult,
  type UseReturnableOrderResult,
  type UseReturnOrdersResult,
  type UseReturnSessionResult,
} from "../components/returns/hooks";
export {
  RETURNS_SLOT_NAMES,
  type ReturnsAppearance,
  type ReturnsAppearanceElements,
  type ReturnsAppearanceTokens,
  type ReturnsSlotAppearance,
  type ReturnsSlotName,
  type ReturnsTheme,
} from "../components/returns/appearance";
export {
  ReturnsAppearanceProvider,
  useReturnsAppearance,
  useReturnsSlot,
} from "../components/returns/appearance.context";
export { useReturnsText } from "../components/returns/texts.context";
export {
  type ReturnsTextKey,
  type ReturnsTexts,
} from "../components/returns/texts";
export {
  type LegacyReturnsTexts,
  type LegacyReturnsTheme,
  type ReturnsEnvironmentInput,
  type ReturnsTextsInput,
} from "../components/returns/legacy";
export { type SelectedReturnLine } from "../components/returns/state-machine";
export { Environment } from "../gen/proto/common/v1/environment_pb";

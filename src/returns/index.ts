/**
 * @deprecated The 1.6.0 returns widget, kept for compatibility. Import
 * `BitsnapReturns`, `ReturnsProvider` and the returns hooks from
 * `bitsnap-react` instead.
 */
export {
  BitsnapReturns,
  BitsnapReturnsProvider,
  useCreateReturn,
  useMyReturns,
  useReturnableOrder,
  useReturnOrders,
  useReturnSession,
} from "./BitsnapReturns";
export type {
  BitsnapReturnsProps,
  BitsnapReturnsProviderProps,
} from "./BitsnapReturns";
export { Environment } from "../gen/proto/common/v1/environment_pb";

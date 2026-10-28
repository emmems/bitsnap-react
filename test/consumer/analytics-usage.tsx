import {
  ApplePayButton,
  BitsnapCheckout,
  BitsnapReturns,
  ProductList,
  type AnalyticsOption,
} from "bitsnap-react";
import { PanelCourse } from "bitsnap-react/course";
import {
  BitsnapAnalyticsProvider,
  InstrumentProvider,
  createTracker,
  initTracker,
  scoreBucket,
  useAnalytics,
  useInstrument,
  type BitsnapAnalyticsProviderProps,
  type Instrument,
  type ClientEvent,
  type Tracker,
  type TrackerOptions,
} from "bitsnap-react/analytics";

/** Consumer fixture for the merchant analytics tracker of this package. */

const forward = (event: ClientEvent) => void event.event;

const props: BitsnapAnalyticsProviderProps = {
  projectKey: "Ab12Cd",
  env: "live",
  enabled: true,
  onEvent: forward,
};

function ViewTracker({ productId }: { productId: string }) {
  const { track, page } = useAnalytics();
  page("product");
  track("product_view", { price_minor: 1999, currency: "PLN", availability: "in_stock" }, { product_id: productId });
  // @ts-expect-error add_to_cart needs qty, value_minor and currency
  track("add_to_cart", { qty: 1 });
  // @ts-expect-error the consent log is written by the consent banner only
  track("consent_updated", {});
  return null;
}

const options: TrackerOptions = { projectKey: "pk_Ab12Cd", endpoint: "https://collect.example.test", debug: true };
const tracker: Tracker = createTracker(options);
const off: () => void = tracker.onEvent(forward);
tracker.flush();

export const view = (
  <BitsnapAnalyticsProvider {...props}>
    <ViewTracker productId="prod1" />
  </BitsnapAnalyticsProvider>
);
export { initTracker, off };

/** Every component takes `analytics`: on by default, `false` to opt out, `{ onEvent }` to forward. */
const optOut: AnalyticsOption = false;
const forwardOnly: AnalyticsOption = { onEvent: forward, env: "test" };

export const components = (
  <>
    <ProductList projectID="Ab12Cd" analytics={forwardOnly} />
    <BitsnapCheckout projectID="Ab12Cd" analytics={optOut} />
    <BitsnapReturns projectID="Ab12Cd" analytics={forwardOnly} />
    <ApplePayButton items={[]} analytics={optOut} />
    <PanelCourse accessId="access-1" analytics={forwardOnly} />
    {/* @ts-expect-error not an analytics option */}
    <ProductList projectID="Ab12Cd" analytics="no" />
  </>
);

/** Custom components can report with the same instrument as the built-in ones. */
function CustomPart() {
  const instrument: Instrument = useInstrument("Ab12Cd", forwardOnly, "cart");
  instrument.track("cart_opened", { item_count: 1, value_minor: 100, currency: "PLN" });
  // @ts-expect-error cart_opened needs its props
  instrument.track("cart_opened", {});
  return <InstrumentProvider value={instrument}>{scoreBucket(80)}</InstrumentProvider>;
}
export { CustomPart };

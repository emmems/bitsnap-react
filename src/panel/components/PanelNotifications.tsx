import { getPanelTexts } from "../texts";

export default function PanelNotifications({}: {}) {
  const texts = getPanelTexts();
  return <section>
    <h3 className="text-2xl">{texts.notificationsHeading}</h3>
    <p className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">{texts.notificationsUnavailable}</p>
  </section>;
}

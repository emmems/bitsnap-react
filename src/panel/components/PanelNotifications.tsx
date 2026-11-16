import { NotificationSettings } from "../notifications/NotificationSettings";
import { getPanelTexts } from "../texts";

export default function PanelNotifications({}: {}) {
  const texts = getPanelTexts();
  return <section className="w-full max-w-xl">
    <h3 className="text-2xl">{texts.notificationsHeading}</h3>
    <div className="mt-6">
      <NotificationSettings
        fallback={<p className="text-sm text-neutral-600 dark:text-neutral-400">{texts.notificationsUnavailable}</p>}
      />
    </div>
  </section>;
}

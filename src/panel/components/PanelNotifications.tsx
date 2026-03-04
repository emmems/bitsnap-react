import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { useState } from "react";

interface PanelNotificationsComponentProps {}

function PanelNotificationsComponent({}: PanelNotificationsComponentProps) {
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    disableAll: false,
  });

  return (
    <>
      <h3 className="text-2xl">Powiadomienia</h3>
      <p className="text-sm text-neutral-500">
        Zarządzaj swoimi powiadomieniami
      </p>
      <div className="mt-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="disable-all-notifications"
            checked={notifications.disableAll}
            onCheckedChange={(checked) =>
              setNotifications((prevState) => ({
                ...prevState,
                disableAll: checked,
              }))
            }
          />
          <Label
            htmlFor="disable-all-notifications"
            className="flex flex-col gap-1 text-base"
          >
            Wszystkie powiadomienia
            <span className="text-xs font-normal text-neutral-500 md:text-sm">
              Ten przycisk może wyłączyć wszystkie powiadomienia
            </span>
          </Label>
        </div>
      </div>
    </>
  );
}

export default PanelNotificationsComponent;

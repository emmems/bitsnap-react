import { Switch } from "@/src/ui/switch";
import { cn } from "@/src/lib/utils";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { CheckCircleIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/src/ui/button";
import { Spinner } from "@/src/ui/spinner";
import type {
  NotificationGroup,
  ComponentClassNames,
  CustomizationTexts,
} from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { HowOftenComponent } from "./HowOftenComponent";
import { rpcProvider, useQuery } from "@/src/rpc-provider";
import { NotificationGroupHowOften } from "@/src/gen/proto/common/v1/push_notifications_pb";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/ui/card";

interface NotificationGroupsListProps {
  groups: NotificationGroup[];
  hiddenGroupIds?: string[];
  isManaging?: boolean;
  onToggle: (groupID: string) => void;
  onCheckAll: () => void;
  onUpdate?: () => void;
  isUpdating?: boolean;
  wasChanged?: boolean;
  isUserGroupsUpdated?: boolean;
  className?: ComponentClassNames;
  texts?: CustomizationTexts;
}

export function NotificationGroupsList({
  groups = [],
  isManaging,
  onToggle,
  onCheckAll,
  onUpdate,
  isUpdating,
  wasChanged,
  isUserGroupsUpdated,
  className,
  texts,
}: NotificationGroupsListProps) {
  const [groupsParent] = useAutoAnimate();
  const [updateGroupsParent] = useAutoAnimate();

  const hasNoSelection =
    groups.filter((group) => group.isOn === false).length > 0;
  const hasUnchecked =
    groups.filter((group) => group.isOn === false).length > 0;

  if (groups.length <= 1 && isManaging != true) {
    return null;
  }

  const content = (
    <div
      ref={groupsParent}
      className={cn("my-5 flex flex-col gap-3", className?.groupsList)}
    >
      {groups.map((group) => (
        <div
          id={group.id}
          role="button"
          key={group.id}
          className={cn(
            group.isOn
              ? "bg-neutral-50 hover:bg-transparent shadow-sm border-transparent dark:bg-neutral-800"
              : "border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-800 shadow-sm dark:border-neutral-800",
            "active:bg-beige-300 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition active:dark:bg-neutral-900",
            className?.groupItem
          )}
          onClick={(e) => {
            if (e.target instanceof HTMLButtonElement) {
              return;
            }
            onToggle(group.id);
          }}
        >
          <Switch
            checked={group.isOn}
            className="data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-neutral-700"
            onCheckedChange={() => {
              onToggle(group.id);
            }}
          />
          <div className="flex flex-col items-start justify-start">
            <p className="font-medium text-sm">{group.name}</p>
            {group.description && (
              <p className="text-xs font-light">{group.description}</p>
            )}
          </div>
          <div className="grow"></div>
          {group.howOften && <HowOftenComponent regularity={group.howOften} />}
        </div>
      ))}
      <div className="flex gap-2">
        {isManaging === true && (
          <>
            <div
              ref={updateGroupsParent}
              className="flex flex-col items-start justify-start"
            >
              {wasChanged && (
                <Button
                  variant="default"
                  size="sm"
                  className="relative"
                  disabled={isUpdating}
                  onClick={onUpdate}
                >
                  {texts?.groupsUpdateButton ??
                    DEFAULT_TEXTS.groupsUpdateButton}
                  {isUpdating && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                      <Spinner />
                    </div>
                  )}
                </Button>
              )}
              {isUserGroupsUpdated && (
                <p className="mt-3 flex items-center gap-2 text-sm text-green-500">
                  <CheckCircleIcon color="var(--color-green-500" size={16} />{" "}
                  {texts?.groupsUpdateSuccess ??
                    DEFAULT_TEXTS.groupsUpdateSuccess}
                </p>
              )}
            </div>
            <div className="grow"></div>
          </>
        )}
        {hasUnchecked && (
          <div className="flex justify-start">
            <Button
              className="cursor-pointer dark:bg-neutral-700"
              onClick={onCheckAll}
              size="sm"
              variant="secondary"
              type="button"
            >
              {texts?.groupsSelectAllButton ??
                DEFAULT_TEXTS.groupsSelectAllButton}
            </Button>
          </div>
        )}
      </div>
      {hasNoSelection && (
        <div className="flex text-left gap-2 text-xs text-yellow-500">
          <TriangleAlertIcon color="orange" size={16} />
          {texts?.groupsNoSelectionWarning ??
            DEFAULT_TEXTS.groupsNoSelectionWarning}
        </div>
      )}
    </div>
  );

  if (isManaging == true) {
    return (
      <Card className="mt-5 text-left">
        <CardHeader>
          <CardTitle>
            {texts?.groupsTitle ?? DEFAULT_TEXTS.groupsTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    );
  }

  return content;
}

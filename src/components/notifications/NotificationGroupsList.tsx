import { Switch } from "@/src/ui/switch";
import { cn } from "@/src/lib/utils";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
    CheckCircleIcon,
    TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/src/ui/button";
import { Spinner } from "@/src/ui/spinner";
import type { NotificationGroup, ComponentClassNames, CustomizationTexts } from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { HowOftenComponent } from "./HowOftenComponent";

interface NotificationGroupsListProps {
    groups: NotificationGroup[];
    groupsChecked: Record<string, boolean>;
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
    groups,
    groupsChecked,
    hiddenGroupIds = [],
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

    const visibleGroups = groups.filter(
        (group) => !hiddenGroupIds.includes(group.id),
    );

    function getIfIsChecked(groupID: string): boolean {
        return groupsChecked[groupID] ?? false;
    }

    const hasNoSelection =
        Object.values(groupsChecked).findIndex((el) => el === true) === -1;
    const hasUnchecked =
        Object.values(groupsChecked).findIndex((el) => el === false) !== -1;

    return (
        <div ref={groupsParent} className={cn("my-5 flex flex-col gap-3", className?.groupsList)}>
            {visibleGroups.map((group) => (
                <div
                    id={group.id}
                    role="button"
                    key={group.id}
                    className={cn(
                        getIfIsChecked(group.id)
                            ? "bg-beige-100 border-transparent dark:bg-neutral-700"
                            : "border-neutral-400 dark:border-neutral-700",
                        "active:bg-beige-300 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition active:dark:bg-neutral-900",
                        className?.groupItem,
                    )}
                    onClick={() => onToggle(group.id)}
                >
                    <Switch
                        className="data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-neutral-700"
                        checked={getIfIsChecked(group.id)}
                        onCheckedChange={() => onToggle(group.id)}
                    />
                    <div className="flex flex-col items-start justify-start">
                        <p className="font-medium">{group.name}</p>
                        {group.description && (
                            <p className="text-xs font-light">{group.description}</p>
                        )}
                    </div>
                    <div className="grow"></div>
                    {group.howOften && <HowOftenComponent regularity={group.howOften} />}
                </div>
            ))}
            {hasNoSelection && (
                <div className="flex gap-2 text-xs text-amber-400">
                    <TriangleAlertIcon color="orange" size={16} />
                    {texts?.groupsNoSelectionWarning ?? DEFAULT_TEXTS.groupsNoSelectionWarning}
                </div>
            )}
            {hasUnchecked && (
                <div className="flex justify-start">
                    <Button
                        className="cursor-pointer dark:bg-neutral-700"
                        onClick={onCheckAll}
                        size="sm"
                        variant="ghost"
                        type="button"
                    >
                        {texts?.groupsSelectAllButton ?? DEFAULT_TEXTS.groupsSelectAllButton}
                    </Button>
                </div>
            )}
            {isManaging === true && (
                <div
                    ref={updateGroupsParent}
                    className="flex flex-col items-start justify-start"
                >
                    {wasChanged && (
                        <Button
                            className="relative"
                            disabled={isUpdating}
                            onClick={onUpdate}
                        >
                            {texts?.groupsUpdateButton ?? DEFAULT_TEXTS.groupsUpdateButton}
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
                            {texts?.groupsUpdateSuccess ?? DEFAULT_TEXTS.groupsUpdateSuccess}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}


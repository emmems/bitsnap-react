import { useEffect, useState } from "react";
import { Skeleton } from "@/src/ui/skeleton";
import { Switch } from "@/src/ui/switch";
import { cn } from "@/src/lib/utils";
import { Label } from "@radix-ui/react-label";
import { MessageCircleWarningIcon } from "lucide-react";
import { rpcProvider, useMutation, useQuery } from "src/rpc-provider";
import { useDebouncedCallback } from "use-debounce";
import { UnsubscribeDialog } from "./UnsubscribeDialog";
import { Button } from "@/src/ui/button";
import { Spinner } from "@/src/ui/spinner";
import type { ComponentClassNames, CustomizationTexts } from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/ui/card";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface ManageMyDataProps {
  accessToken: string;
  slug: string;
  userID: string;
  className?: ComponentClassNames;
  texts?: CustomizationTexts;
}

export function ManageMyData({
  accessToken,
  slug,
  userID,
  className,
  texts,
}: ManageMyDataProps) {
  const [parent] = useAutoAnimate();
  const [parentCard] = useAutoAnimate();
  const { mutateAsync: deleteMyData, isPending: isDeleting } = useMutation(
    rpcProvider.notifications.deleteNotificationUser
  );
  const { mutateAsync: updateNotificationUser, isPending: isUpdating } =
    useMutation(rpcProvider.notifications.updateNotificationUser);

  const { data: userSettings, isFetching: isLoading } = useQuery(
    rpcProvider.notifications.getNotificationUserSettings,
    {
      userId: userID,
      slug: slug,
      accessToken: accessToken,
    }
  );

  const [email, setEmail] = useState(false);
  const [phone, setPhone] = useState(false);
  const [isDataUpdated, setIsDataUpdated] = useState(false);
  const [push, setPush] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const details =
    userSettings?.result.case === "success"
      ? userSettings?.result?.value
      : undefined;

  function deleteData() {
    setIsDialogOpen(true);
  }

  async function handleConfirmDelete() {
    await deleteMyData({
      accessToken: accessToken,
      slug: slug,
      userId: userID,
    });
    setIsDialogOpen(false);
  }

  async function updateData() {
    await updateNotificationUser({
      accessToken: accessToken,
      slug: slug,
      notificationUserId: userID,
      mobileNotificationEnabled: push,
      emailNotificationEnabled: email,
      smsNotificationEnabled: phone,
    });
    setIsDataUpdated(true);
    setTimeout(() => {
      setIsDataUpdated(false);
    }, 3000);
  }
  const debouncedUpdateData = useDebouncedCallback((_: boolean) => {
    updateData();
  }, 300);

  useEffect(() => {
    const details =
      userSettings?.result.case === "success"
        ? userSettings?.result?.value
        : undefined;

    setEmail(details?.emailNotificationEnabled ?? false);
    setPhone(details?.smsNotificationEnabled ?? false);
    setPush(details?.mobileNotificationEnabled ?? false);
  }, [userSettings]);

  function setData(key: "email" | "phone" | "push", value: boolean) {
    if (key === "email") {
      setEmail(value);
    }
    if (key === "phone") {
      setPhone(value);
    }
    if (key === "push") {
      setPush(value);
    }
    debouncedUpdateData(true);
  }

  return (
    <div
      className={cn(
        "bg-beige-100 rounded-xl p-4 dark:bg-neutral-700",
        className?.manageDataSection
      )}
    >
      <div className="flex justify-start">
        <h3
          className={cn(
            "mb-3 text-base font-medium lg:text-lg",
            className?.manageDataTitle
          )}
        >
          {texts?.manageDataTitle ?? DEFAULT_TEXTS.manageDataTitle}
        </h3>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card ref={parentCard} className={cn(isUpdating && "relative")}>
          <CardHeader>
            <CardTitle>
              <p className="text-sm text-left">
                {texts?.manageDataDescription ??
                  DEFAULT_TEXTS.manageDataDescription}
              </p>
            </CardTitle>
          </CardHeader>
          <CardContent ref={parent}>
            <div
              className={cn(
                isUpdating && "opacity-50 pointer-events-none",
                "flex flex-col gap-2"
              )}
            >
              <div className="flex flex-col items-start gap-5 gap-x-2">
                {details?.emailNotificationAvailable && (
                  <div className="flex items-center gap-3">
                    <Switch
                      id="email-enabled"
                      className="data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-neutral-600"
                      checked={email}
                      onCheckedChange={() => {
                        setData("email", !email);
                      }}
                    />
                    <Label htmlFor="email-enabled" className="text-sm">
                      Email
                    </Label>
                  </div>
                )}
                {details?.smsNotificationAvailable && (
                  <div className="flex items-center gap-3">
                    <Switch
                      id="sms-enabled"
                      className="data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-neutral-600"
                      checked={phone}
                      onCheckedChange={() => {
                        setData("phone", !phone);
                      }}
                    />
                    <Label htmlFor="sms-enabled" className="text-sm">
                      SMS
                    </Label>
                  </div>
                )}
                {details?.mobileNotificationAvailable && (
                  <>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="push-enabled"
                        className="data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-neutral-600"
                        checked={push}
                        onCheckedChange={() => {
                          setData("push", !push);
                        }}
                      />
                      <Label htmlFor="push-enabled" className="text-sm">
                        Powiadomienia na telefon
                      </Label>
                    </div>
                    {details?.hasUserInstalledApp === false && (
                      <div className="flex items-center gap-3">
                        <MessageCircleWarningIcon
                          color="var(--color-amber-500)"
                          size={26}
                        />
                        <p className="text-xs text-amber-500">
                          Wygląda na to, że nie masz zainstalowanej aplikacji
                          mobilnej. Zainstaluj i wyraź zgodę na otrzymywanie
                          powiadomień na telefon.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 text-left">
              <hr />
              {isDataUpdated && (
                <p className="text-xs text-green-500">
                  {texts?.manageDataUpdatedMessage ??
                    DEFAULT_TEXTS.manageDataUpdatedMessage}
                </p>
              )}
              <div className="flex items-center gap-x-2">
                <Button
                  size="sm"
                  variant="link"
                  className={cn(
                    "pl-0 ml-0",
                    isDeleting && "cursor-not-allowed"
                  )}
                  onClick={deleteData}
                >
                  {texts?.manageDataUnsubscribeButton ??
                    DEFAULT_TEXTS.manageDataUnsubscribeButton}
                  {isDeleting && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                      <Spinner />
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
          {isUpdating && (
            <div className="bg-black/30 absolute inset-0 rounded-xl">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Spinner />
              </div>
            </div>
          )}
        </Card>
      )}
      <UnsubscribeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}

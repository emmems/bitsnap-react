import { Input } from "@/src/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/ui/popover";
import { Skeleton } from "@/src/ui/skeleton";
import { Switch } from "@/src/ui/switch";
import { cn } from "@/src/lib/utils";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Label } from "@radix-ui/react-label";
import {
  CheckCircleIcon,
  CircleAlertIcon,
  ClockIcon,
  MessageCircleWarningIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { isValidPhoneNumber } from "react-phone-number-input";

import "react-phone-number-input/style.css";
import { rpcProvider, RpcProvider, useMutation, useQuery } from "src/rpc-provider";

import { useDebouncedCallback } from "use-debounce";
import { UnsubscribeDialog } from "./UnsubscribeDialog";
import { Button } from "@/src/ui/button";
import { Spinner } from "@/src/ui/spinner";
import { FailureMessage } from "@/src/gen/proto/dashboard/v1/notifications_pb";

export type NotificationGroup = {
  id: string;
  name: string;
  description?: string;
  howOften?: string;
};

interface NotificationsComponentPublicProps {
  slug: string;
  userID?: string;
  productID?: string;
  projectName?: string;
  projectLogo?: string;
  projectLogoDark?: string;
  groups?: NotificationGroup[];
  groupsChecked: Record<string, boolean>;
  isManaging?: boolean;
}

function NotificationsComponentPublic(
  props: NotificationsComponentPublicProps,
) {
  const isBrowser = typeof window !== "undefined";
  const darkMode = isBrowser
    ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? true
      : false
    : false;

  const [groupsParent] = useAutoAnimate();
  const [updateGroupsParent] = useAutoAnimate();

  const { mutateAsync: updateUserGroups, isPending: isUpdating } = useMutation(
    rpcProvider.notifications.updateUserGroups,
  );

  const [isUserGroupsUpdated, setIsUserGroupsUpdated] = useState(false);

  const [wasChanged, setWasChanged] = useState(false);

  const [groupChecked, setGroupChecked] = useState<Record<string, boolean>>(
    props.groupsChecked,
  );

  async function updateGroups() {
    await updateUserGroups({
      slug: props.slug,
      userId: props.userID,
      groupIds: Object.entries(groupChecked)
        .filter(([key, value]) => value === true)
        .map(([key]) => key),
    });
    setWasChanged(false);
    setIsUserGroupsUpdated(true);
    setTimeout(() => {
      setIsUserGroupsUpdated(false);
    }, 2000);
  }

  function getURL(isBrowser: boolean) {
    if (isBrowser) {
      return window.location.href;
    }
    return "";
  }

  function toggleGroup(groupID: string) {
    setWasChanged(true);
    setGroupChecked({
      ...groupChecked,
      [groupID]:
        typeof groupChecked[groupID] === "undefined"
          ? true
          : !groupChecked[groupID],
    });
  }

  function getIfIsChecked(groupID: string): boolean {
    return groupChecked[groupID] ?? false;
  }

  function checkAllGroups() {
    Object.keys(groupChecked).forEach((key) => {
      groupChecked[key] = true;
    });
    setGroupChecked({
      ...groupChecked,
    });
  }

  return (
    <main className="container mx-auto min-h-screen p-3 md:p-5">
      <h1 className="text-2xl font-semibold text-black md:text-3xl lg:text-4xl xl:text-5xl dark:text-neutral-100">
        Powiadomienia
      </h1>

      <div className="md:pt8 relative z-0 mt-6 overflow-hidden rounded-2xl bg-white px-3 pt-6 pb-3 md:px-5 md:pb-5 dark:bg-neutral-800">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-6">
          <div>
            <h2 className="flex max-w-44 items-center gap-3 text-lg font-medium text-black sm:max-w-none md:text-xl lg:text-2xl xl:text-3xl dark:text-neutral-100">
              {props.projectLogo != null && (
                <>
                  <img
                    src={props.projectLogo}
                    alt=""
                    className="h-12 w-auto dark:hidden"
                  />
                  <img
                    src={props.projectLogoDark ?? props.projectLogo}
                    alt=""
                    className="hidden h-12 w-auto dark:inline"
                  />
                </>
              )}
              <span>{props.projectName}</span>
            </h2>
            {props.isManaging ? (
              <p className="mt-4 text-xs md:text-sm xl:text-sm">
                Zarządzaj rodzajami powiadomień i sposobem dostarczania.
              </p>
            ) : (
              <p className="mt-4 text-xs md:text-sm xl:text-sm">
                Otrzymuj powiadomienia za pomocą aplikacji mobilnej, smsów lub
                emaili. <span className="font-semibold">Ty decydujesz</span>{" "}
                jakie treści Cię interesują i w jaki sposób chcesz je
                otrzymywać.
              </p>
            )}

            {props.groups && (
              <div ref={groupsParent} className="my-5 flex flex-col gap-3">
                {props.groups.map((group) => (
                  <div
                    id={group.id}
                    role="button"
                    key={group.id}
                    className={cn(
                      getIfIsChecked(group.id)
                        ? "bg-beige-100 border-transparent dark:bg-neutral-700"
                        : "border-neutral-400 dark:border-neutral-700",
                      "active:bg-beige-300 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition active:dark:bg-neutral-900",
                    )}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <Switch
                      className="data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-neutral-700"
                      checked={getIfIsChecked(group.id)}
                      onCheckedChange={() => toggleGroup(group.id)}
                    />
                    <div className="flex flex-col items-start justify-start">
                      <p className="font-medium">{group.name}</p>
                      {group.description && (
                        <p className="text-xs font-light">
                          {group.description}
                        </p>
                      )}
                    </div>
                    <div className="grow"></div>
                    {group.howOften && (
                      <HowOftenComponent regularity={group.howOften} />
                    )}
                  </div>
                ))}
                {Object.values(groupChecked).findIndex((el) => el === true) ===
                  -1 && (
                    <div className="flex gap-2 text-xs text-amber-400">
                      <TriangleAlertIcon color="orange" size={16} />
                      Jeśli żadna z grup nie jest zaznaczona, nie otrzymasz
                      żadnych powiadomień.
                    </div>
                  )}
                {Object.values(groupChecked).findIndex((el) => el === false) !=
                  -1 && (
                    <div className="flex justify-start">
                      <Button
                        className="cursor-pointer dark:bg-neutral-700"
                        onClick={() => {
                          checkAllGroups();
                        }}
                        size="sm"
                        variant="ghost"
                        type="button"
                      >
                        Zaznacz wszystkie
                      </Button>
                    </div>
                  )}
                {props.isManaging === true && (
                  <div
                    ref={updateGroupsParent}
                    className="flex flex-col items-start justify-start"
                  >
                    {wasChanged && (
                      <Button
                        className="relative"
                        disabled={isUpdating}
                        onClick={updateGroups}
                      >
                        Aktualizuj
                        {isUpdating && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            <Spinner />
                          </div>
                        )}
                      </Button>
                    )}
                    {isUserGroupsUpdated && (
                      <p className="mt-3 flex items-center gap-2 text-sm text-green-500">
                        <CheckCircleIcon
                          color="var(--color-green-500"
                          size={16}
                        />{" "}
                        Zaktualizowano pomyślnie.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="hidden md:inline"></div>
          {props.isManaging !== true && (
            <AddUserToGroups slug={props.slug} groupsChecked={groupChecked} />
          )}
          {props.isManaging === true && props.userID != null && (
            <ManageMyData slug={props.slug} userID={props.userID} />
          )}

          <div className="bg-beige-100 rounded-xl p-4 dark:bg-neutral-700">
            <h3 className="mb-3 text-base font-medium lg:text-lg">
              {props.isManaging !== true
                ? "lub zainstaluj aplikację mobilną"
                : "Aplikacja mobilna"}
            </h3>
            <div className="flex flex-col gap-2">
              <div className="mt-1.5 mb-3 flex items-center gap-x-2">
                <a
                  href="https://apps.apple.com/us/app/bitsnap/id6741902807"
                  target="_blank"
                  className="max-w-28 flex-1 basis-1/2 lg:max-w-36"
                >
                  <img
                    className="h-auto w-full"
                    src="/app-store-logo.png"
                    alt="Download on App Store"
                  />
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=com.bitsnap.Bitsnap&pli=1"
                  target="_blank"
                  className="max-w-28 flex-1 basis-1/2 lg:max-w-36"
                >
                  <img
                    className="h-auto w-full"
                    src="/google-play-logo.png"
                    alt="Get in on Google Play"
                  />
                </a>
              </div>
              {isBrowser && (
                <div className="flex items-start justify-start">
                  <div className="flex min-w-[40%] flex-col items-center gap-2 rounded-xl bg-white p-2 dark:bg-neutral-900">
                    <img
                      className="mt-3 w-[80%] p-1 pt-3"
                      src={`/api/qr-gen?url=${getURL(isBrowser)}&bgColor=${!darkMode ? "F6F4F0" : "171717"}&textColor=${!darkMode ? "000000" : "ffffff"}&margin=0`}
                    />
                    <p className="text-xs md:text-sm">zeskanuj kod QR</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Wrapper(props: NotificationsComponentPublicProps) {

  return (
    <RpcProvider>
      <NotificationsComponentPublic {...props} />
    </RpcProvider>
  );
}
export default Wrapper;

function HowOftenComponent({ regularity }: { regularity: string }) {
  let text = "";
  switch (regularity) {
    case "rarely":
      text = "rzadko";
      break;
    case "often":
      text = "często";
      break;
    case "very_often":
      text = "codzienne";
      break;
  }

  return (
    <Popover>
      <PopoverTrigger>
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          type="button"
          className="flex w-[30%] cursor-help flex-col items-center justify-center text-xs md:w-[25%] xl:w-[20%]"
        >
          <ClockIcon size={12} />
          <span>{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">Co to oznacza?</h4>
            <ul className="list-inside list-disc text-sm">
              <li>
                <span className="font-semibold">Rzadko</span> – powiadomienia
                będą wysyłane maksymalnie kilka razy w miesiącu.
              </li>
              <li>
                <span className="font-semibold">Często</span> – powiadomienia
                mogę być wysyłane kilka razy w tygodniu.
              </li>
              <li>
                <span className="font-semibold">Codzienne</span> – powiadomienia
                będą wysyłane nawet codziennie.
              </li>
            </ul>
          </div>
          <div className="grid gap-2"></div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddUserToGroups({
  groupsChecked,
  slug,
}: {
  slug: string;
  groupsChecked: Record<string, boolean>;
}) {
  const [errMsg, setErrMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");
  const [isSubmited, setIsSubmited] = useState(false);
  const [agreementLack, setAgreementLack] = useState(false);

  const {
    mutateAsync: createNotificationUserMutation,
    isPending: isCreateNotificationUserPending,
  } = useMutation(rpcProvider.notifications.createNotificationUser);

  function validatePhoneNumber(phone: string): boolean {
    if (phone == null) {
      return false;
    }
    return isValidPhoneNumber(phone, "PL");
  }

  async function save(email: string, phone: string, agreement: boolean) {
    setErrMsg("");
    setWarnMsg("");
    setIsSubmited(false);
    setAgreementLack(false);

    if (!agreement) {
      setAgreementLack(true);
      const msg = "Zgoda w tym przypadku jest wymagana.";
      setErrMsg(msg);
      return;
    }

    if (emailRegex.test(email) === false) {
      setErrMsg("Email jest nieprawidłowy.");
      return;
    }

    if (phone.length > 0) {
      if (validatePhoneNumber(phone) === false) {
        const msg =
          "Numer telefonu może być nieprawidłowy. Zapisaliśmy go ale jeśli jest nieprawidłowy to wpisz jeszcze raz i kliknij przycisk.";
        setWarnMsg(msg);
      }
    }

    const checkedGroupsId = Object.entries(groupsChecked)
      .map(([key, value]) => {
        if (value) {
          return key;
        }
        return undefined;
      })
      .filter((el) => el != null);

    try {
      const newNotificationUser = await createNotificationUserMutation({
        slug: slug,
        email: email,
        phone: phone,
        groups: checkedGroupsId,
        mobileNotificationEnabled: true,
        emailNotificationEnabled: true,
        smsNotificationEnabled: true,
      });

      if (newNotificationUser.result.case === "success") {
        setIsSubmited(true);

        window.location.pathname =
          window.location.pathname +
          "/" +
          newNotificationUser.result.value.notificationUserId;

        return;
      } else {
        const failureMessage = newNotificationUser.result.value;

        if (failureMessage != null) {
          console.log(`Code error: ${FailureMessage[failureMessage]}`);
          return;
        }

        return;
      }
    } catch (e) {
      console.log(`Error: ${e}`);
    }
  }

  return (
    <div className="bg-beige-100 rounded-xl p-4 dark:bg-neutral-700">
      <h3 className="mb-3 text-base font-medium lg:text-lg">
        Podaj Email i telefon(opcjonalnie)
      </h3>

      <FormInput
        errMsg={errMsg}
        warnMsg={warnMsg}
        submit={save}
        isLoading={isCreateNotificationUserPending}
        isSubmited={isSubmited}
        agreementLack={agreementLack}
      />
    </div>
  );
}

function FormInput({
  submit,
  isLoading,
  errMsg,
  warnMsg,
  isSubmited,
  agreementLack,
}: {
  isLoading: boolean;
  submit: (email: string, phone: string, agreement: boolean) => void;
  errMsg: string;
  agreementLack?: boolean;
  warnMsg: string;
  isSubmited: boolean;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isChecked, setIsChecked] = useState(false);

  const [parent] = useAutoAnimate();

  function submitForm(e: FormEvent) {
    e.preventDefault();
    submit(email, phone, isChecked);
  }

  return (
    <form ref={parent} onSubmit={submitForm}>
      <Label className="text-sm" htmlFor="email">
        Email
      </Label>
      <Input
        value={email}
        onChange={(newVal) => {
          setEmail(newVal.currentTarget.value);
        }}
        id="email"
        className="mb-5 bg-white dark:bg-neutral-900"
        type="email"
        placeholder="np. mail@gmail..."
      />

      <Label className="text-sm" htmlFor="phone">
        Numer telefonu{" "}
        <span className="text-neutral-600 dark:text-neutral-400">
          (opcjonalnie)
        </span>
      </Label>
      <Input
        value={phone}
        onChange={(newVal) => {
          setPhone(newVal.currentTarget.value);
        }}
        id="phone"
        className="mb-3 bg-white dark:bg-neutral-900"
        type="tel"
        placeholder="np. 663..."
      />
      <div className="my-5 flex items-start gap-x-1.5">
        <input
          className="cursor-pointer"
          id="notification-marketing-consent"
          type="checkbox"
          checked={isChecked}
          onChange={() => {
            setIsChecked(!isChecked);
          }}
        />
        <label
          htmlFor="notification-marketing-consent"
          className={cn(
            "cursor-pointer text-xs leading-4 transition-colors md:text-sm md:leading-4",
            agreementLack === true ? "text-amber-400" : "",
          )}
        >
          <span style={{ color: "red" }}>*</span>
          Wyrażam zgodę na przetwarzanie moich danych w celach marketingowych
          zgodnie z{" "}
          <a
            href="/regulations/polityka-prywatnosci"
            target="_blank"
            className="cursor-alias font-bold hover:font-medium"
          >
            regulaminem
          </a>{" "}
          <span className="text-xs font-light">
            (zgodę można w każdej chwili wycofać)
          </span>
        </label>
      </div>
      {errMsg.length > 0 && (
        <p className="mb-3 flex items-center gap-1 text-sm text-red-400">
          <TriangleAlertIcon color="#ff6467" size={16} /> {errMsg}
        </p>
      )}
      {warnMsg.length > 0 && (
        <p className="mb-3 flex items-center gap-1 text-sm text-amber-400">
          <CircleAlertIcon color="var(--color-amber-400)" size={16} /> {warnMsg}
        </p>
      )}
      <Button
        variant="default"
        disabled={isLoading}
        className={cn(
          isLoading ? "cursor-not-allowed text-transparent" : "",
          "relative",
        )}
      >
        Zapisz się
        {isLoading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Spinner />
          </div>
        )}
      </Button>
      {isSubmited && (
        <div className="mt-3 flex items-center gap-3 text-sm text-green-400">
          <CheckCircleIcon color="#00b366" size={22} /> Zasubskrybowano Cię. Na
          maila otrzymasz instrukcję jak zarządzać swoimi powiadomieniami.
        </div>
      )}
    </form>
  );
}

const emailRegex =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

function ManageMyData({ slug, userID }: { slug: string; userID: string }) {
  const { mutateAsync: deleteMyData, isPending: isDeleting } = useMutation(
    rpcProvider.notifications.deleteNotificationUser,
  );
  const { mutateAsync: updateNotificationUser, isPending: isUpdating } =
    useMutation(rpcProvider.notifications.updateNotificationUser);

  const { data: userSettings, isFetching: isLoading } = useQuery(
    rpcProvider.notifications.getNotificationUserSettings,
    {
      userId: userID,
      slug: slug,
    },
  );

  const [email, setEmail] = useState(false);
  const [phone, setPhone] = useState(false);
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
      slug: slug,
      userId: userID,
    });
    setIsDialogOpen(false);
  }

  async function updateData() {
    await updateNotificationUser({
      slug: slug,
      notificationUserId: userID,
      mobileNotificationEnabled: push,
      emailNotificationEnabled: email,
      smsNotificationEnabled: phone,
    });
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
    <div className="bg-beige-100 rounded-xl p-4 dark:bg-neutral-700">
      <div className="flex justify-start">
        {isUpdating && <Spinner />}
        <h3 className="mb-3 text-base font-medium lg:text-lg">
          Zarządzaj powiadomieniami
        </h3>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              W jaki sposób chcesz otrzymywać powiadomienia?
            </p>
            <div className="mt-1.5 mb-3 flex flex-col items-start gap-5 gap-x-2">
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

          <div className="mt-5 flex flex-col gap-2">
            <hr />
            <p className="text-sm opacity-80">
              Wypisz mnie z wszystkich powiadomień i grup.
            </p>
            <div className="mt-1.5 mb-3 flex items-center gap-x-2">
              <Button
                size="sm"
                variant="destructive"
                className={cn(isDeleting && "cursor-not-allowed")}
                onClick={deleteData}
              >
                Odsubskrybuj
                {isDeleting && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Spinner />
                  </div>
                )}
              </Button>
            </div>
          </div>
        </>
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

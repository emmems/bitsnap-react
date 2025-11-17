import { useState } from "react";
import { isValidPhoneNumber } from "react-phone-number-input";
import { cn } from "@/src/lib/utils";
import { rpcProvider, useMutation } from "src/rpc-provider";
import { FailureMessage } from "@/src/gen/proto/dashboard/v1/notifications_pb";
import type {
  ComponentClassNames,
  CustomizationTexts,
  NotificationGroup,
} from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { FormInput } from "./FormInput";
import type { ReactNode } from "react";
import { NotificationGroupsList } from "./NotificationGroupsList";

const emailRegex =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

interface AddUserToGroupsProps {
  slug: string;
  groups: NotificationGroup[];
  isUpdating?: boolean;
  wasChanged?: boolean;
  onToggle?: (id: string) => void;
  onCheckAll?: () => void;
  showPhoneInput?: boolean;
  agreementText?: string | ReactNode;
  className?: ComponentClassNames;
  texts?: CustomizationTexts;
  onSuccess?: (
    userAlreadyExists: boolean,
    userID: string | undefined,
    accessToken: string | undefined
  ) => void;
}

export function AddUserToGroups({
  groups,
  onToggle,
  onCheckAll,
  slug,
  showPhoneInput = false,
  agreementText,
  className,
  texts,
  isUpdating,
  wasChanged,
  onSuccess,
}: AddUserToGroupsProps) {
  const [errMsg, setErrMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");
  const [isSubmited, setIsSubmited] = useState(false);
  const [agreementLack, setAgreementLack] = useState(false);
  const [emailLack, setEmailLack] = useState(false);
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
    setEmailLack(false);
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
      setEmailLack(true);
      return;
    }

    if (phone.length > 0) {
      if (validatePhoneNumber(phone) === false) {
        const msg =
          "Numer telefonu może być nieprawidłowy. Zapisaliśmy go ale jeśli jest nieprawidłowy to wpisz jeszcze raz i kliknij przycisk.";
        setWarnMsg(msg);
      }
    }

    try {
      const newNotificationUser = await createNotificationUserMutation({
        slug: slug,
        email: email,
        phone: phone,
        groups: groups.filter((el) => el.isOn == true).map((el) => el.id),
        mobileNotificationEnabled: true,
        emailNotificationEnabled: true,
        smsNotificationEnabled: true,
      });

      if (newNotificationUser.result.case === "success") {
        setIsSubmited(true);
        setTimeout(() => {
          onSuccess?.(
            false,
            newNotificationUser.userId,
            newNotificationUser.accessToken
          );
        }, 1000);
        return;
      } else {
        setIsSubmited(true);
        const failureMessage = newNotificationUser.result.value;

        if (failureMessage != null) {
          if (
            failureMessage == FailureMessage.NOTIFICATION_USER_ALREADY_EXIST
          ) {
            onSuccess?.(true, undefined, undefined);
            return;
          }
          console.log(`Code error: ${FailureMessage[failureMessage]}`);
          setErrMsg("Wystąpił błąd: " + FailureMessage[failureMessage]);
          return;
        }

        return;
      }
    } catch (e) {
      setErrMsg("Wystąpił błąd podczas zapisywania. Spróbuj ponownie.");
      console.log(`Error: ${e}`);
    }
  }

  const text = texts?.formTitle ?? DEFAULT_TEXTS.formTitle;

  return (
    <div
      className={cn(
        "bg-beige-100 rounded-xl p-4 dark:bg-neutral-700",
        className?.formSection
      )}
    >
      {text.length > 0 && (
        <h3
          className={cn(
            "mb-3 text-base font-medium lg:text-lg",
            className?.formTitle
          )}
        >
          {text}
        </h3>
      )}

      <NotificationGroupsList
        groups={groups}
        isManaging={false}
        onToggle={onToggle ?? (() => {})}
        onCheckAll={onCheckAll ?? (() => {})}
        isUpdating={isUpdating ?? false}
        wasChanged={wasChanged ?? false}
        isUserGroupsUpdated={false}
        className={className}
        texts={texts}
      />

      <FormInput
        errMsg={errMsg}
        emailLack={emailLack}
        warnMsg={warnMsg}
        submit={save}
        isLoading={isCreateNotificationUserPending}
        isSubmited={isSubmited}
        agreementLack={agreementLack}
        showPhoneInput={showPhoneInput}
        agreementText={
          agreementText ?? texts?.agreementText ?? DEFAULT_TEXTS.agreementText
        }
        className={className}
        texts={texts}
      />
    </div>
  );
}

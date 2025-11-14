import { useState } from "react";
import { isValidPhoneNumber } from "react-phone-number-input";
import { cn } from "@/src/lib/utils";
import { rpcProvider, useMutation } from "src/rpc-provider";
import { FailureMessage } from "@/src/gen/proto/dashboard/v1/notifications_pb";
import type { ComponentClassNames, CustomizationTexts } from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { FormInput } from "./FormInput";
import type { ReactNode } from "react";

const emailRegex =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

interface AddUserToGroupsProps {
  slug: string;
  groupsChecked: Record<string, boolean>;
  showPhoneInput?: boolean;
  agreementText?: string | ReactNode;
  className?: ComponentClassNames;
  texts?: CustomizationTexts;
}

export function AddUserToGroups({
  groupsChecked,
  slug,
  showPhoneInput = true,
  agreementText,
  className,
  texts,
}: AddUserToGroupsProps) {
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
          "Numer telefonu może być nieprawidłowy. Zapisaliśmy go ale jeśli jest nieprawidłowy to wpisz jeszcze raz i kliknij przycisk.";
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
    <div
      className={cn(
        "bg-beige-100 rounded-xl p-4 dark:bg-neutral-700",
        className?.formSection,
      )}
    >
      <h3 className={cn("mb-3 text-base font-medium lg:text-lg", className?.formTitle)}>
        {texts?.formTitle ?? DEFAULT_TEXTS.formTitle}
      </h3>

      <FormInput
        errMsg={errMsg}
        warnMsg={warnMsg}
        submit={save}
        isLoading={isCreateNotificationUserPending}
        isSubmited={isSubmited}
        agreementLack={agreementLack}
        showPhoneInput={showPhoneInput}
        agreementText={agreementText ?? texts?.agreementText ?? DEFAULT_TEXTS.agreementText}
        className={className}
        texts={texts}
      />
    </div>
  );
}


import type { ReactNode } from "react";
import type { AnalyticsOption } from "@/src/analytics/instrument";

export type PublicNotificationGroup = {
  id: string;
  isOn?: boolean;
};

export type NotificationGroup = {
  id: string;
  name: string;
  description?: string;
  howOften?: string;
  isOn?: boolean;
};

export interface CustomizationTexts {
  title?: string | null;
  description?: string | null;
  managingDescription?: string;
  formTitle?: string;
  formEmailLabel?: string;
  formPhoneLabel?: string;
  formPhoneOptional?: string;
  formEmailPlaceholder?: string;
  formPhonePlaceholder?: string;
  formSubmitButton?: string;
  formSuccessMessage?: string;
  agreementText?: string | ReactNode;
  qrCodeTitle?: string;
  qrCodeSubtitle?: string;
  qrCodeScanText?: string;
  groupsNoSelectionWarning?: string;
  groupsTitle?: string;
  groupsSelectAllButton?: string;
  groupsUpdateButton?: string;
  groupsUpdateSuccess?: string;
  manageDataTitle?: string;
  manageDataDescription?: string;
  manageDataUnsubscribeButton?: string;
  manageDataUnsubscribeDescription?: string;
  manageDataUpdatedMessage?: string;
  loginEmailLabel?: string;
  loginEmailPlaceholder?: string;
  loginSendCodeButton?: string;
  loginIHaveCode?: string;
  loginSendingButton?: string;
  loginCodeLabel?: string;
  loginCodeSentMessage?: string;
  loginChangeEmailButton?: string;
  loginResendCodeButton?: string;
  loginInvalidEmailError?: string;
  loginSlugRequiredError?: string;
  loginVerificationFailedError?: string;
  loginInvalidCodeError?: string;
  loginSendEmailError?: string;
  loginVerifyCodeError?: string;
  loginResendEmailError?: string;
  loginTitle?: string;
  /** Submit button of the code step. */
  loginVerifyButton?: string;
  /** Placeholder `{seconds}`: the resend button while the cooldown runs. */
  loginResendInText?: string;
  loginResentMessage?: string;
  loginExpiredError?: string;
  loginTooManyAttemptsError?: string;
  /** Placeholder `{time}`, for example "45 s" or "2 min". */
  loginRateLimitedError?: string;
  loginNetworkError?: string;
  loginSpamHint?: string;
  loginValidityHint?: string;
  loginDescription?: string;
  /** Code button while the code is checked. */
  loginVerifyingButton?: string;
  /** Spoken when the e-mail step is shown again. */
  loginStepEmailHint?: string;
  /** Spoken when the code step is shown. */
  loginStepCodeHint?: string;
  /** Placeholder `{time}`: a code was sent a moment ago, a new one comes later. */
  loginAlreadySentMessage?: string;
  loginEmailNotFoundError?: string;
  loginDeliveryUnavailableError?: string;
  /** Resend button once the code expired or ran out of attempts. */
  loginResendNewCodeButton?: string;
  /** Link in the "I already have a code" view that goes back to sending one. */
  loginNoCodeButton?: string;
  loginCodeIncompleteError?: string;
}

export interface ComponentClassNames {
  container?: string;
  header?: string;
  headerTitle?: string;
  headerLogo?: string;
  headerDescription?: string;
  groupsContainer?: string;
  groupsList?: string;
  groupItem?: string;
  qrCodeSection?: string;
  qrCodeTitle?: string;
  qrCodeContainer?: string;
  formSection?: string;
  formTitle?: string;
  formContainer?: string;
  manageDataSection?: string;
  manageDataTitle?: string;
}

/**
 * Props for the NotificationsComponentPublic component.
 */
/** The texts of the notifications login dialog. */
export type LoginScreenTexts = Pick<
  CustomizationTexts,
  | "loginTitle"
  | "loginDescription"
  | "loginEmailLabel"
  | "loginEmailPlaceholder"
  | "loginSendCodeButton"
  | "loginSendingButton"
  | "loginCodeLabel"
  | "loginCodeSentMessage"
  | "loginIHaveCode"
  | "loginChangeEmailButton"
  | "loginResendCodeButton"
  | "loginInvalidEmailError"
  | "loginInvalidCodeError"
  | "loginSlugRequiredError"
  | "loginVerificationFailedError"
  | "loginSendEmailError"
  | "loginVerifyCodeError"
  | "loginResendEmailError"
  | "loginVerifyButton"
  | "loginResendInText"
  | "loginResentMessage"
  | "loginExpiredError"
  | "loginTooManyAttemptsError"
  | "loginRateLimitedError"
  | "loginNetworkError"
  | "loginSpamHint"
  | "loginValidityHint"
  | "loginVerifyingButton"
  | "loginStepEmailHint"
  | "loginStepCodeHint"
  | "loginAlreadySentMessage"
  | "loginEmailNotFoundError"
  | "loginDeliveryUnavailableError"
  | "loginResendNewCodeButton"
  | "loginNoCodeButton"
  | "loginCodeIncompleteError"
>;

export interface NotificationsComponentPublicProps {
  /**
   * Unique identifier for the project (if not provided, productID will be used via CartProvider).
   */
  slug?: string;

  /**
   * Unique identifier for the user.
   */
  userID?: string;

  /**
   * Project ID (alternative to slug, used if slug is not provided).
   */
  productID?: string;

  /**
   * Name of the project, displayed in the component.
   */
  projectName?: string;

  /**
   * URL or path to the project's logo (light mode).
   */
  projectLogo?: string;

  /**
   * URL or path to the project's logo (dark mode).
   */
  projectLogoDark?: string;

  /**
   * The login dialog shows the project logo (`projectLogo`, else the one of
   * the shop settings, else Bitsnap's). `false` hides it.
   */
  showLoginLogo?: boolean;

  /**
   * Array of notification groups that the user can subscribe to. If you will provide group, we will not show all possible public groups from dashboard.
   */
  groups?: PublicNotificationGroup[];

  /**
   * If true, the component is rendered in "manage my notifications" mode.
   */
  isManaging?: boolean;

  /**
   * Custom texts used throughout the component for i18n or personalisation.
   */
  texts?: CustomizationTexts;

  /**
   * If true, show the QR code section that allows users to get a mobile app.
   */
  showQRCode?: boolean;

  /**
   * If true, show the phone input in the notification form.
   */
  showPhoneInput?: boolean;

  /**
   * List of group IDs to hide from the selection interface.
   */
  hiddenGroupIds?: string[];

  /**
   * Custom CSS class names for various component sections (for easier styling).
   */
  className?: ComponentClassNames;

  /**
   * Public project ID used for usage statistics. Defaults to the one set by
   * `<BitsnapCheckout projectID>`.
   */
  projectID?: string;

  /**
   * Usage statistics for your Bitsnap dashboard (sign-ups). On by default;
   * `false` turns it off. An object lets you forward every event:
   * `{ onEvent }`. Nothing is stored on the visitor's device.
   */
  analytics?: AnalyticsOption;
}

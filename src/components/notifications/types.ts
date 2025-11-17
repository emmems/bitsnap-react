import type { ReactNode } from "react";

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
  loginDescription?: string;
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
}

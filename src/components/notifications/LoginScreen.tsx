import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ArrowLeft } from "lucide-react";
import { useMemo, useRef } from "react";
import { rpcProvider, RpcProvider, useMutation } from "src/rpc-provider";
import { Button } from "@/src/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/ui/dialog";
import { EmailCodeLoginForm } from "@/src/ui/email-code-login/EmailCodeLoginForm";
import { LoginBrandLogo } from "@/src/ui/email-code-login/LoginBrandLogo";
import { pendingLoginKey } from "@/src/ui/email-code-login/pending";
import { useEmailCodeLogin } from "@/src/ui/email-code-login/useEmailCodeLogin";
import {
  createNotificationsAdapter,
  notificationsLoginTexts,
  type NotificationsLoginResult,
} from "./login-adapter";
import type { LoginScreenTexts } from "./types";

export type { LoginScreenTexts };

interface LoginScreenProps {
  /**
   * Unique identifier for the project (if not provided, productID will be used via CartProvider).
   */
  slug: string;

  /**
   * Callback function called when login is successful with the access token.
   */
  onSuccess?: (userID: string | undefined, accessToken: string) => void;

  /**
   * Callback function called when an error occurs.
   */
  onError?: (error: Error) => void;

  /**
   * Callback function called when the close button is clicked.
   */
  onClose?: () => void;

  /**
   * If true, the dialog is open.
   */
  isOpen: boolean;

  /**
   * Custom CSS class names for styling.
   */
  className?: string;

  /**
   * Custom texts used throughout the component for i18n or personalisation.
   */
  texts: LoginScreenTexts;

  /** Name and logos of the project, when the page already has them. */
  projectName?: string;
  projectLogo?: string;
  projectLogoDark?: string;

  /** `false` hides the logo above the login. Default `true`. */
  showLogo?: boolean;
}

/**
 * The dialog content. It mounts each time the dialog opens, so a finished or
 * abandoned login never leaves a locked form behind; a pending code step is
 * restored from `sessionStorage`.
 */
function LoginDialogBody({
  slug,
  onSuccess,
  onError,
  texts,
  projectName,
  projectLogo,
  projectLogoDark,
  showLogo,
}: Pick<
  LoginScreenProps,
  | "slug"
  | "onSuccess"
  | "onError"
  | "texts"
  | "projectName"
  | "projectLogo"
  | "projectLogoDark"
  | "showLogo"
>) {
  const [parentHeader] = useAutoAnimate();
  const { mutateAsync: verifyUserEmail } = useMutation(
    rpcProvider.notifications.verifyUserEmail,
  );

  const loginTexts = useMemo(() => notificationsLoginTexts(texts), [texts]);
  const [before, after] = loginTexts.codeSentTo.split("{email}");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const adapter = useMemo(() => {
    const base = createNotificationsAdapter(
      (request) => verifyUserEmail(request),
      slug,
      texts,
    );
    return {
      ...base,
      // The hook reports every failure but a wrong code; `onError` always
      // got that one too, so keep it.
      async verify(input) {
        const outcome = await base.verify(input);
        if (!outcome.ok && outcome.kind === "wrongCode") {
          onErrorRef.current?.(
            outcome.cause instanceof Error
              ? outcome.cause
              : new Error(outcome.message ?? "wrongCode"),
          );
        }
        return outcome;
      },
    } satisfies typeof base;
  }, [verifyUserEmail, slug, texts]);

  const login = useEmailCodeLogin<NotificationsLoginResult>({
    adapter,
    texts: loginTexts,
    storageKey: slug ? pendingLoginKey("notifications", slug) : undefined,
    onVerified: ({ userId, accessToken }) => onSuccess?.(userId, accessToken),
    onFailure: (kind, cause) =>
      onError?.(cause instanceof Error ? cause : new Error(kind)),
  });

  const onCodeStep = login.step === "code";
  // The title of the code step is the code label, as before.
  const title =
    onCodeStep && !login.needsEmail
      ? texts.loginCodeLabel ?? ""
      : texts.loginTitle ?? "";

  return (
    <div className="flex h-full flex-col">
      <LoginBrandLogo
        projectId={slug}
        name={projectName}
        showLogo={showLogo}
        logoUrl={projectLogo}
        logoDarkUrl={projectLogoDark}
        className="text-foreground mb-3"
      />
      <div ref={parentHeader} className="mb-2 flex items-start gap-2">
        {onCodeStep && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mt-2 -ml-2 size-11 shrink-0"
            aria-label={loginTexts.changeEmail}
            disabled={login.isBusy}
            onClick={login.changeEmail}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Button>
        )}
        <DialogTitle className="text-lg leading-6 font-semibold">
          {title}
        </DialogTitle>
      </div>
      {/* The form announces "step 2 of 2" itself; the description of the
          code step is the address, so nothing is read twice. */}
      <DialogDescription className={onCodeStep ? "sr-only" : "mb-4"}>
        {onCodeStep
          ? `${before}${login.email}${after ?? ""}`
          : texts.loginDescription ?? ""}
      </DialogDescription>
      <EmailCodeLoginForm login={login} texts={loginTexts} />
    </div>
  );
}

export function LoginScreen({
  slug,
  onSuccess,
  onError,
  className: _className,
  isOpen,
  onClose,
  texts,
  projectName,
  projectLogo,
  projectLogoDark,
  showLogo,
}: LoginScreenProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto sm:max-w-[425px]">
        <LoginDialogBody
          slug={slug}
          onSuccess={onSuccess}
          onError={onError}
          texts={texts}
          projectName={projectName}
          projectLogo={projectLogo}
          projectLogoDark={projectLogoDark}
          showLogo={showLogo}
        />
      </DialogContent>
    </Dialog>
  );
}

function Wrapper(props: LoginScreenProps) {
  return (
    <RpcProvider>
      <LoginScreen {...props} />
    </RpcProvider>
  );
}

export default Wrapper;

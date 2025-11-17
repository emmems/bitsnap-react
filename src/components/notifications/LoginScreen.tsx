import { useState } from "react";
import { rpcProvider, RpcProvider, useMutation } from "src/rpc-provider";
import { getProjectID } from "../checkout/CartProvider";
import { Input } from "@/src/ui/input";
import { Label } from "@/src/ui/label";
import { Button } from "@/src/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/src/ui/input-otp";
import { cn } from "@/src/lib/utils";
import { DEFAULT_TEXTS } from "./constants";
import type { CustomizationTexts } from "./types";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/ui/card";
import { ArrowLeft, X } from "lucide-react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Dialog, DialogContent } from "@/src/ui/dialog";
import { ConnectError } from "@connectrpc/connect";
import { Spinner } from "@/src/ui/spinner";

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
>;

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
}

export function LoginScreen({
  slug,
  onSuccess,
  onError,
  className,
  isOpen,
  onClose,
  texts,
}: LoginScreenProps) {
  const [parentContent] = useAutoAnimate();
  const [parentHeader] = useAutoAnimate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: verifyUserEmail, isPending: isVerifying } = useMutation(
    rpcProvider.notifications.verifyUserEmail
  );

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError(texts.loginInvalidEmailError ?? "");
      return;
    }

    try {
      await verifyUserEmail({
        email,
        slug: slug,
      });
      setIsEmailSent(true);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(texts.loginSendEmailError);
      setError(error.message);
      onError?.(error);
    }
  };

  const handleVerifyCode = async (value: string) => {
    setCode(value);
    setError(null);

    // Only verify when all 6 digits are entered
    if (value.length === 6) {
      try {
        const response = await verifyUserEmail({
          email: undefined,
          code: value,
          slug: slug,
        });

        if (response.ok && response.accessToken) {
          onSuccess?.(response.userId, response.accessToken);
        } else {
          setError(texts.loginVerificationFailedError ?? "");
          onError?.(new Error(texts.loginVerificationFailedError));
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error(texts.loginVerifyCodeError);
        if (error.message.includes("Invalid code")) {
          setError(texts.loginInvalidCodeError ?? error.message);
          setCode("");
          return;
        }
        setError(error.message);
        onError?.(error);
        // Clear the code on error so user can retry
        setCode("");
      }
    }
  };

  const handleResendEmail = async () => {
    setCode("");
    setError(null);

    if (!email || !slug) {
      setError(texts.loginSlugRequiredError ?? "");
      return;
    }

    try {
      await verifyUserEmail({
        email,
        slug: slug,
      });
      // Keep isEmailSent as true, just clear the code
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(texts.loginResendEmailError);
      setError(error.message);
      onError?.(error);
    }
  };

  const handleChangeEmail = () => {
    setIsEmailSent(false);
    setCode("");
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] min-h-[250px]">
        <div className="flex flex-col min-h-[250px] h-full">
          {/* Header */}
          <div ref={parentHeader} className="flex items-start gap-2 mb-2">
            {isEmailSent && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setIsEmailSent(false);
                }}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <CardTitle>
                {isEmailSent
                  ? texts.loginCodeLabel ?? ""
                  : texts.loginTitle ?? ""}
              </CardTitle>
            </div>
          </div>
          {/* Description */}
          <CardDescription className="mb-4">
            {isEmailSent ? (
              <>
                {texts.loginCodeSentMessage ?? ""} {email}
              </>
            ) : (
              texts.loginDescription ?? ""
            )}
          </CardDescription>

          {/* Main form area */}
          <div className="flex-1 flex flex-col">
            {!isEmailSent ? (
              <form onSubmit={handleSendEmail} className="flex flex-col flex-1">
                <div className="space-y-2">
                  <Label htmlFor="email">{texts.loginEmailLabel ?? ""}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={texts.loginEmailPlaceholder ?? ""}
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEmail(e.target.value)
                    }
                    required
                    disabled={isVerifying}
                    aria-invalid={error ? "true" : "false"}
                  />
                </div>
                {error && (
                  <div
                    className="text-sm text-destructive mt-2 mb-1"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
                <div className="grow" />
                {/* Always pin buttons to the bottom */}
                <div className="flex flex-col items-start gap-0 pt-2">
                  <Button type="submit" size="sm" disabled={isVerifying}>
                    {isVerifying
                      ? texts.loginSendingButton ?? ""
                      : texts.loginSendCodeButton ?? ""}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="ml-0 pl-0"
                    size="sm"
                    onClick={() => {
                      setIsEmailSent(true);
                    }}
                  >
                    {texts.loginIHaveCode ?? ""}
                  </Button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex flex-col flex-1"
              >
                <div className="space-y-2">
                  <Label>{texts.loginCodeLabel ?? ""}</Label>
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={handleVerifyCode}
                    disabled={isVerifying}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  {isVerifying && <Spinner />}
                </div>
                {error && (
                  <div
                    className="text-sm text-destructive mt-2 mb-1"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
                <div className="grow" />
                {/* Always pin buttons to the bottom */}
                <div className="flex flex-col items-start gap-2 pt-2">
                  {email.length > 0 && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleResendEmail}
                      disabled={isVerifying}
                      className="flex-1 ml-0 pl-0"
                    >
                      {texts.loginResendCodeButton ?? ""}
                    </Button>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleChangeEmail}
                    disabled={isVerifying}
                    className="flex-1 ml-0 pl-0"
                  >
                    {texts.loginChangeEmailButton ?? ""}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
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

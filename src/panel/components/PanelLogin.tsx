import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from "react";
import { cn } from "../../lib/utils";
import { rpcProvider, useMutation } from "../../rpc-provider";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { Input } from "../../ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "../../ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Label } from "../../ui/label";
import LoadingIndicator from "../LoadingIndicator";
import {
  getAllowedReturnOrigins,
  setAllowedReturnOrigins,
} from "../config";
import { usePanelConfig } from "../PanelProvider";
import {
  buildAccessTokenRedirect,
  getReturnURLFromSearch,
  persistReturnURL,
  readPersistedReturnURL,
} from "../return-url";

type LoginResponseStatus = "success" | "error" | "default";

if (typeof window !== "undefined") {
  const currentOrigin = window.location.origin;
  const knownSiblings = [
    currentOrigin,
    "https://bitsnap.pl",
    "https://kursy.bitsnap.pl",
  ];
  if (getAllowedReturnOrigins().length === 0) {
    setAllowedReturnOrigins(Array.from(new Set(knownSiblings)));
  }
}

interface LoginUserPanelProps {
  reveal: () => void;
  email: string;
  setEmail: (input: string) => void;
  loginUser: () => void;
  isLoginLoading: boolean;
  errMsg: string;
}

interface VerifyCodePanelProps {
  email: string;
  reveal: () => void;
  setEmail: (input: string) => void;
  loginUser: () => void;
  isLoginLoading: boolean;
  loginUserResponse: {
    status: "error" | "ok";
    retryIn: number;
    message?: string | undefined;
  } | null;
  setLoginUserResponse: (
    response: {
      status: "error" | "ok";
      retryIn: number;
      message?: string | undefined;
    } | null,
  ) => void;
  responseStatus: LoginResponseStatus;
  setResponseStatus: (status: LoginResponseStatus) => void;
  errMsg: string;
}

const LoginUserPanel = ({
  reveal,
  email,
  setEmail,
  loginUser,
  isLoginLoading,
  errMsg,
}: LoginUserPanelProps) => {
  if (
    typeof window !== "undefined" &&
    localStorage.getItem("__access_token") != null
  ) {
    // @ts-ignore
    window.location.href = window.location.href.replaceAll("login", "");
    return null;
  }

  const [isValidEmail, setIsValidEmail] = useState<boolean>(false);

  const emailValidation = (input: string) => {
    const emailPattern =
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    if (emailPattern.test(input.trim())) {
      return setIsValidEmail(true);
    }

    return setIsValidEmail(false);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    emailValidation(value);
    setEmail(value);
  };

  function goToVerifyCode() {
    reveal();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    goToVerifyCode();
  }

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center space-y-12">
      <div className={cn("flex min-w-sm flex-col gap-6")}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Zaloguj się</CardTitle>
            <CardDescription>
              Wyślemy do Ciebie kod na maila, dzięki któremu się zalogujesz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    onChange={handleInputChange}
                    type="email"
                    placeholder="m@example.com"
                    required
                  />
                  <span
                    className={cn(
                      !isValidEmail && email.length > 0
                        ? "font-bold text-red-500"
                        : "text-neutral-700 dark:text-neutral-400",
                      "text-xs",
                    )}
                  >
                    {!isValidEmail && email.length > 0
                      ? "Nieprawidłowy adres email"
                      : "Wpisz swój adres email"}
                  </span>
                </div>

                <div>
                  <Button
                    type="button"
                    disabled={isLoginLoading}
                    className="relative w-full"
                    onClick={loginUser}
                  >
                    {isLoginLoading && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <LoadingIndicator />
                      </div>
                    )}
                    Zaloguj się
                  </Button>
                  {errMsg.length > 0 && (
                    <p className="text-xs font-medium text-red-500">{errMsg}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 text-center text-sm">
                Masz już kod?{" "}
                <button
                  type="button"
                  onClick={goToVerifyCode}
                  className="underline underline-offset-4"
                >
                  Mam już kod
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

const VerifyCodePanel = ({
  email,
  reveal,
  setEmail,
  isLoginLoading,
  loginUserResponse,
  setLoginUserResponse,
  setResponseStatus,
  errMsg,
}: VerifyCodePanelProps) => {
  const { mutateAsync: verifyCodeAsync, isPending: isVerifyLoading } =
    useMutation(rpcProvider.publicApi.userPanelLoginWithCode);

  const [code, setCode] = useState<string>("");
  const [isValidCode, setIsValidCode] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [retryIn, setRetryIn] = useState(0);

  const codeValidation = (input: string) => {
    const codePattern = /^\d+$/;

    if (codePattern.test(input.trim())) {
      return setIsValidCode(true);
    }

    return setIsValidCode(false);
  };

  const handleInputChange = (value: string) => {
    codeValidation(value);
    setCode(value);
  };

  async function login() {
    setIsSubmitted(true);
    if (code.length == 0) {
      setIsValidCode(false);
      return;
    }
    const codeValue = parseInt(code);

    const verifyCodeResult = await verifyCodeAsync({
      code: codeValue,
    });

    let status, message, accessToken;

    if (verifyCodeResult.result.case === "accessToken") {
      setIsValidCode(true);
      status = "ok";
      message = undefined;
      accessToken = verifyCodeResult.result.value;
    } else {
      setIsValidCode(false);
      status = "error";
      message = verifyCodeResult.result.value;
      accessToken = undefined;
    }

    if (status === "error") {
      setIsValidCode(false);
      console.warn("error:", `Kod błędu: ${message}`);
      console.warn("Nieprawidłowy kod, spróbuj ponownie.");
    }

    if (status === "ok") {
      if (accessToken) {
        localStorage.setItem("__access_token", accessToken);
        localStorage.setItem("__user-email", email);
      }
      const returnURL = typeof window !== "undefined"
        ? readPersistedReturnURL()
        : null;
      console.log("[bitsnap-react][panel-login] post-verify returnURL=", returnURL, "token?", Boolean(accessToken));
      setTimeout(() => {
        if (accessToken && returnURL) {
          const target = buildAccessTokenRedirect(returnURL, accessToken);
          console.log("[bitsnap-react][panel-login] redirecting to", target);
          window.location.href = target;
          return;
        }
        console.warn("[bitsnap-react][panel-login] no returnURL or no token; reloading instead");
        window.location.reload();
      }, 100);
    }
  }

  function handleRetryInTime() {
    const intervalId = setInterval(() => {
      setRetryIn((prevRetryIn) => {
        if (prevRetryIn > 0) {
          return prevRetryIn - 1;
        } else {
          clearInterval(intervalId);
          return 0;
        }
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }

  useEffect(() => {
    if (loginUserResponse?.status === "ok" && loginUserResponse?.retryIn > 0) {
      setRetryIn(loginUserResponse.retryIn);
      handleRetryInTime();
    }
  }, [loginUserResponse]);

  function backToLoginComponent() {
    setEmail("");
    setLoginUserResponse(null);
    setResponseStatus("default");
    reveal();
  }

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center space-y-8">
      <div className={cn("flex min-w-sm flex-col gap-6")}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Wpisz kod z maila</CardTitle>
            <CardDescription>
              Sprawdź czy przypadkiem nie wylądował w spamie.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <div className="my-5 flex w-full items-center justify-center">
                  <div className="flex flex-col gap-2">
                    <InputOTP
                      id="verify-code"
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS}
                      onChange={(newValue) => {
                        handleInputChange(newValue);
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                    <span
                      className={cn(
                        !isValidCode && isSubmitted
                          ? "text-red-500"
                          : "text-neutral-700 dark:text-neutral-400",
                        "text-xs",
                      )}
                    >
                      {!isValidCode && isSubmitted
                        ? code.length == 0
                          ? "Kod nie może być pusty"
                          : "Kod musi składać się z cyfr"
                        : "Wpisz kod z maila"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  disabled={isLoginLoading || isVerifyLoading}
                  className="relative w-full"
                  onClick={() => {
                    login();
                  }}
                >
                  {(isLoginLoading || isVerifyLoading) && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                      <LoadingIndicator />
                    </div>
                  )}
                  Zaloguj się
                </Button>
                {errMsg.length > 0 && (
                  <p className="text-xs font-medium text-red-500">{errMsg}</p>
                )}
              </div>
            </div>
            <div className="mt-4 text-center text-sm">
              Nie masz kodu?{" "}
              <button
                type="button"
                onClick={backToLoginComponent}
                className="underline underline-offset-4"
              >
                Wróć
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

const PanelLoginComponentWrapper = () => {
  const { theme, allowedReturnOrigins } = usePanelConfig();

  const styles = {
    "--button-background-color": theme?.colors?.brand ?? "#FFFFFF",
    "--button-background-color-dark": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color-dark": theme?.colors?.brand ?? "#FFFFFF",
  } as CSSProperties;

  type Screen = "login" | "verifyCode";

  const [activeScreen, setActiveScreen] = useState<Screen>("login");
  const [parent] = useAutoAnimate({
    duration: 300,
    easing: "ease-in-out",
    disrespectUserMotionPreference: false,
  });

  const reveal = () =>
    setActiveScreen((prevScreen) =>
      prevScreen === "login" ? "verifyCode" : "login",
    );

  const [email, setEmail] = useState<string>("");
  const [responseStatus, setResponseStatus] =
    useState<LoginResponseStatus>("default");
  const [loginUserResponse, setLoginUserResponse] = useState<{
    status: "error" | "ok";
    retryIn: number;
    message?: string | undefined;
  } | null>(null);
  const { mutateAsync: loginUserAsync, isPending: isLoginLoading } =
    useMutation(rpcProvider.publicApi.userPanelLogin);

  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent !== window) return;

    console.log("[bitsnap-react][panel-login] mounted; allowedOrigins=", getAllowedReturnOrigins());
    const queryReturnURL = getReturnURLFromSearch(window.location.search);
    console.log("[bitsnap-react][panel-login] queryReturnURL=", queryReturnURL);
    if (queryReturnURL) {
      persistReturnURL(queryReturnURL);
    }

    const returnURL = queryReturnURL ?? readPersistedReturnURL();
    console.log("[bitsnap-react][panel-login] effective returnURL=", returnURL);
    if (!returnURL) return;

    const existingToken = window.localStorage.getItem("__access_token");
    if (!existingToken) return;

    window.location.href = buildAccessTokenRedirect(returnURL, existingToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedReturnOrigins]);

  async function loginUser() {
    setErrMsg("");
    setResponseStatus("default");
    const loginUserResult = await loginUserAsync({
      email: email,
    });

    const status = loginUserResult.result.case === "success" ? "ok" : "error";
    let retryIn = 0;
    let message = undefined;

    if (loginUserResult.result.case === "success") {
      retryIn = loginUserResult.result.value.retryIn;
    }

    if (status === "error") {
      message = "Nieprawidłowy adres email, spróbuj ponownie.";
    }

    setLoginUserResponse({
      status: status,
      retryIn: retryIn,
      message: message,
    });

    if (status === "ok" && activeScreen === "login") {
      reveal();
    } else if (status === "ok" && activeScreen === "verifyCode") {
      setResponseStatus("success");
    } else if (status === "error") {
      setErrMsg(message ?? "Nieprawidłowy adres email, spróbuj ponownie.");
    }
  }

  return (
    <div className="bg-white text-black dark:bg-black dark:text-white">
      <div
        className="font-inter flex h-screen w-screen flex-col p-4"
        style={styles}
        ref={parent}
      >
        <header>
          {theme?.logoDarkURL && (
            <img
              src={theme?.logoDarkURL}
              className="hidden dark:inline"
              alt="Company Logo"
              draggable={false}
            />
          )}
          {theme?.logoURL && (
            <img
              src={theme?.logoURL}
              className="dark:hidden"
              alt="Company Logo"
              draggable={false}
            />
          )}
        </header>
        {activeScreen === "login" && (
          <LoginUserPanel
            reveal={reveal}
            email={email}
            setEmail={setEmail}
            loginUser={loginUser}
            isLoginLoading={isLoginLoading}
            errMsg={errMsg}
          />
        )}
        {activeScreen === "verifyCode" && (
          <VerifyCodePanel
            email={email}
            reveal={reveal}
            setEmail={setEmail}
            loginUser={loginUser}
            isLoginLoading={isLoginLoading}
            loginUserResponse={loginUserResponse}
            setLoginUserResponse={setLoginUserResponse}
            responseStatus={responseStatus}
            setResponseStatus={setResponseStatus}
            errMsg={errMsg}
          />
        )}
      </div>
    </div>
  );
};

export const PanelLogin = () => {
  return <PanelLoginComponentWrapper />;
};

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect, useMemo, type CSSProperties } from "react";
import {
  InstrumentProvider,
  useInstrument,
  useInstrumentContext,
  type AnalyticsOption,
} from "../../analytics/instrument";
import { getLocale } from "../../components/checkout/locale";
import { rpcProvider, useMutation } from "../../rpc-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { kindFromRpcError } from "../../ui/email-code-login/errors";
import {
  LoginBrandLogo,
  type LoginLogoOptions,
} from "../../ui/email-code-login/LoginBrandLogo";
import { EmailCodeLoginForm } from "../../ui/email-code-login/EmailCodeLoginForm";
import { pendingLoginKey } from "../../ui/email-code-login/pending";
import {
  useEmailCodeLogin,
  type EmailCodeAdapter,
} from "../../ui/email-code-login/useEmailCodeLogin";
import {
  getAllowedReturnOrigins,
  setAllowedReturnOrigins,
} from "../config";
import { panelFailureKind } from "../login-adapter";
import { resolvePanelLoginTexts, type PanelLoginTexts } from "../login-texts";
import { usePanelConfig } from "../PanelProvider";
import type { PanelLoginProps } from "../types";
import {
  buildAccessTokenRedirect,
  getReturnURLFromSearch,
  persistReturnURL,
  readPersistedReturnURL,
} from "../return-url";
import { getPanelSession, savePanelSession } from "../session-storage";

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


/** Props of {@link PanelLogin}; `PanelLoginProps` of the package is a superset. */
export type PanelLoginComponentProps = Pick<
  PanelLoginProps,
  "analytics" | "texts" | "locale" | "showLogo" | "logoUrl" | "logoDarkUrl"
>;

type PanelLoginResult = { accessToken: string };

const PanelLoginForm = ({
  texts,
  projectID,
  host,
  logo,
}: {
  texts: PanelLoginTexts;
  projectID?: string;
  host?: string;
  logo: LoginLogoOptions;
}) => {
  const instrument = useInstrumentContext();
  const { mutateAsync: loginUserAsync } = useMutation(
    rpcProvider.publicApi.userPanelLogin,
  );
  const { mutateAsync: verifyCodeAsync } = useMutation(
    rpcProvider.publicApi.userPanelLoginWithCode,
  );

  const adapter = useMemo<EmailCodeAdapter<PanelLoginResult>>(
    () => ({
      async send(email) {
        try {
          const response = await loginUserAsync({ email });
          if (response.result.case === "success") {
            return {
              ok: true,
              retryIn: response.result.value.retryIn || undefined,
              challengeId: response.result.value.challengeId || undefined,
            };
          }
          return {
            ok: false,
            kind: panelFailureKind(
              response.result.case === "failure" ? response.result.value : 0,
            ),
          };
        } catch (cause) {
          return { ok: false, kind: kindFromRpcError(cause), cause };
        }
      },
      async verify({ email, code, challengeId }) {
        try {
          const response = await verifyCodeAsync({
            code: parseInt(code, 10),
            email,
            challengeId,
          });
          if (response.result.case === "accessToken" && response.result.value) {
            return { ok: true, value: { accessToken: response.result.value } };
          }
          return {
            ok: false,
            kind: panelFailureKind(
              response.result.case === "failure" ? response.result.value : 0,
            ),
          };
        } catch (cause) {
          return { ok: false, kind: kindFromRpcError(cause), cause };
        }
      },
    }),
    [loginUserAsync, verifyCodeAsync],
  );

  const login = useEmailCodeLogin<PanelLoginResult>({
    adapter,
    texts,
    storageKey: pendingLoginKey("panel", projectID, host),
    onVerified: ({ accessToken }, email) => {
      instrument.track("panel_login", {});
      savePanelSession(projectID, accessToken, email, host);
      const returnURL =
        typeof window !== "undefined" ? readPersistedReturnURL() : null;
      setTimeout(() => {
        if (returnURL) {
          window.location.href = buildAccessTokenRedirect(returnURL, accessToken);
          return;
        }
        window.location.reload();
      }, 100);
    },
  });

  const onCodeStep = login.step === "code";
  const title = onCodeStep && !login.needsEmail ? texts.codeTitle : texts.title;
  const description =
    onCodeStep && !login.needsEmail ? texts.codeDescription : texts.description;

  return (
    // Top-aligned: a vertically centred card moved when the step changed height.
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-start pt-4 sm:pt-[12vh]">
      <Card>
        <LoginBrandLogo projectId={projectID} className="px-4 sm:px-6" {...logo} />
        <CardHeader className="px-4 sm:px-6">
          <CardTitle role="heading" aria-level={1} className="text-2xl">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <EmailCodeLoginForm
            login={login}
            texts={texts}
            emailInputId="email"
            codeInputId="verify-code"
          />
        </CardContent>
      </Card>
    </main>
  );
};

const PanelLoginComponentWrapper = ({
  analytics,
  texts: textOverrides,
  locale,
  showLogo,
  logoUrl,
  logoDarkUrl,
}: PanelLoginComponentProps) => {
  const { theme, allowedReturnOrigins, projectID, host } = usePanelConfig();
  const instrument = useInstrument(projectID, analytics, "panel");
  const texts = useMemo(
    () => resolvePanelLoginTexts(locale ?? getLocale(), textOverrides),
    [locale, textOverrides],
  );

  const styles = {
    "--button-background-color": theme?.colors?.brand ?? "#FFFFFF",
    "--button-background-color-dark": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color-dark": theme?.colors?.brand ?? "#FFFFFF",
  } as CSSProperties;

  const [parent] = useAutoAnimate({
    duration: 300,
    easing: "ease-in-out",
    disrespectUserMotionPreference: false,
  });

  // Already signed in: leave the login page. Declared before the return URL
  // effect below, so that one (a token redirect) wins when both apply.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getPanelSession(projectID, host) != null) {
      window.location.href = window.location.href.replaceAll("login", "");
    }
  }, [projectID, host]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent !== window) return;

    const queryReturnURL = getReturnURLFromSearch(window.location.search);
    if (queryReturnURL) {
      persistReturnURL(queryReturnURL);
    }

    const returnURL = queryReturnURL ?? readPersistedReturnURL();
    if (!returnURL) return;

    const existingToken = getPanelSession(projectID, host);
    if (!existingToken) return;

    window.location.href = buildAccessTokenRedirect(returnURL, existingToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedReturnOrigins, projectID, host]);

  return (
    <InstrumentProvider value={instrument}>
      <div className="bg-white text-black dark:bg-black dark:text-white">
        <div
          className="font-inter flex min-h-screen w-full flex-col p-4"
          style={styles}
          ref={parent}
        >
          <PanelLoginForm
            texts={texts}
            projectID={projectID}
            host={host}
            logo={{
              showLogo,
              logoUrl: logoUrl ?? theme?.logoURL,
              logoDarkUrl: logoDarkUrl ?? theme?.logoDarkURL,
            }}
          />
        </div>
      </div>
    </InstrumentProvider>
  );
};

export const PanelLogin = (props: PanelLoginComponentProps = {}) => {
  return <PanelLoginComponentWrapper {...props} />;
};

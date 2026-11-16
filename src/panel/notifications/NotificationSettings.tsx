import { useId, useRef, useState } from "react";
import { getLocale } from "../../components/checkout/locale";
import { NotificationMethod } from "../../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useMutation, useQuery } from "../../rpc-provider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { usePanelConfig } from "../PanelProvider";
import { getPanelSession } from "../session-storage";
import { getPanelNotificationSettingsTexts } from "./texts";

const CHANNELS = [
  { method: NotificationMethod.EMAIL, label: "channelEmail" },
  { method: NotificationMethod.SMS, label: "channelSms" },
  { method: NotificationMethod.PUSH, label: "channelPush" },
] as const;

/** Only an http(s) address becomes the "sign up again" link. */
function signupLink(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A switch with its own colours: the shared `ui/switch` thumb follows the
 * package tokens, which do not flip with a page-level `.dark` (docs/ideas.md).
 */
function Switch(props: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-neutral-900 data-[state=unchecked]:bg-neutral-300 dark:data-[state=checked]:bg-neutral-100 dark:data-[state=unchecked]:bg-neutral-600"
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5 dark:data-[state=checked]:bg-neutral-900 dark:data-[state=unchecked]:bg-neutral-300" />
    </SwitchPrimitive.Root>
  );
}

/**
 * The shop's notification settings of the logged-in customer
 * (`GetNotificationSettingsDetails` / `UpdateNotificationSettings`): the
 * channels the shop offers and, when the customer's address has a confirmed
 * newsletter subscription in the shop, the newsletter switch. A withdrawn
 * newsletter is off and cannot be switched back on here: signing up again
 * goes through the shop's own form (double opt-in). Switching e-mail from on
 * to off also unsubscribes from the newsletter (the server's rule).
 *
 * Renders nothing (or `fallback`) without a session, on a failure answer, or
 * when the server does not know the method.
 */
export function NotificationSettings({
  heading,
  fallback = null,
}: {
  /** Shown above the card. */
  heading?: React.ReactNode;
  /** Shown instead when there are no settings to show. */
  fallback?: React.ReactNode;
}) {
  const { projectID, host } = usePanelConfig();
  const accessToken = getPanelSession(projectID, host);
  const texts = getPanelNotificationSettingsTexts(getLocale());
  const ids = useId();
  const enabled = !!projectID && !!accessToken;

  const query = useQuery(
    rpcProvider.publicApi.getNotificationSettingsDetails,
    { projectId: projectID ?? "", accessToken: accessToken ?? "" },
    { enabled, retry: false, refetchOnWindowFocus: false },
  );
  const { mutateAsync: update, isPending: isSaving } = useMutation(
    rpcProvider.publicApi.updateNotificationSettings,
  );

  const details = query.data;
  // The switches follow the server's answer, except while the customer's own
  // saves are in flight: then they show what was sent. A read that started
  // before the latest save (the refetch of an earlier one) cannot flip a switch
  // back, and there is no all-off frame before the first answer is copied.
  const [sent, setSent] = useState<NotificationMethod[] | null>(null);
  const lastSave = useRef(0);
  const methods = sent ?? details?.enabledMethods ?? [];
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  if (!enabled || query.isError) return <>{fallback}</>;
  if (!details) {
    return query.isLoading ? (
      <section aria-busy="true">
        {heading}
        <div
          role="status"
          aria-label={texts.loading}
          className="h-32 w-full animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800"
        />
      </section>
    ) : (
      <>{fallback}</>
    );
  }

  const available = CHANNELS.filter((channel) => details.availableMethods.includes(channel.method));
  const newsletter = details.newsletterSubscribed;
  if (available.length === 0 && newsletter === undefined) return <>{fallback}</>;

  async function save(next: NotificationMethod[], newsletterSubscribed?: boolean) {
    const previous = methods;
    const saveNo = ++lastSave.current;
    setSent(next);
    setStatus("idle");
    try {
      await update({
        projectId: projectID ?? "",
        accessToken: accessToken ?? "",
        modifications: [],
        enabledMethods: next,
        newsletterSubscribed,
      });
      setStatus("saved");
    } catch (error) {
      console.warn("[bitsnap] cannot save the notification settings", error);
      setSent(previous);
      setStatus("error");
    }
    // The newsletter may have changed with the e-mail switch. The switches go
    // back to the server's answer only with the read of the latest save: an
    // earlier save's read (or one cancelled by a later refetch) changes nothing.
    try {
      const fresh = await query.refetch();
      if (saveNo === lastSave.current && fresh.isSuccess) setSent(null);
    } catch {
      // Keep what is shown; the next save reads again.
    }
  }

  function toggle(method: NotificationMethod, on: boolean) {
    const next = on ? [...methods.filter((m) => m !== method), method] : methods.filter((m) => m !== method);
    void save(next);
  }

  const link = signupLink(details.newsletterSignupUrl);
  const noteId = (name: string) => `${ids}-${name}-note`;

  return (
    <section data-bitsnap-notification-settings="" aria-busy={isSaving || undefined}>
      {heading}
      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        {available.length > 0 && (
          <fieldset className="p-4">
            <legend className="float-left w-full text-sm text-neutral-600 dark:text-neutral-400">
              {texts.description}
            </legend>
            <div className="clear-both flex flex-col gap-3 pt-3">
              {available.map((channel) => {
                const id = `${ids}-${channel.method}`;
                const showEmailNote = channel.method === NotificationMethod.EMAIL && newsletter === true;
                return (
                  <div key={channel.method} className="flex flex-col gap-1">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                      <label htmlFor={id} className="text-base">
                        {texts[channel.label]}
                      </label>
                      <Switch
                        id={id}
                        checked={methods.includes(channel.method)}
                        disabled={isSaving}
                        aria-describedby={showEmailNote ? noteId("email") : undefined}
                        onCheckedChange={(on) => toggle(channel.method, on)}
                      />
                    </div>
                    {showEmailNote && (
                      <p id={noteId("email")} className="text-xs text-neutral-600 dark:text-neutral-400">
                        {texts.emailOffNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}

        {newsletter !== undefined && (
          <div className="flex flex-col gap-1 p-4" data-bitsnap-newsletter-switch="">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <label htmlFor={`${ids}-newsletter`} className="text-base">
                {texts.newsletter}
              </label>
              <Switch
                id={`${ids}-newsletter`}
                checked={newsletter}
                disabled={!newsletter || isSaving}
                aria-describedby={noteId("newsletter")}
                onCheckedChange={(on) => {
                  if (!on) void save(methods, false);
                }}
              />
            </div>
            <div id={noteId("newsletter")} className="text-xs text-neutral-600 dark:text-neutral-400">
              {newsletter ? (
                <p>{texts.newsletterOnNote}</p>
              ) : (
                <p>
                  {texts.newsletterWithdrawn}{" "}
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-neutral-900 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-current dark:text-neutral-100"
                    >
                      {texts.newsletterResubscribe}
                    </a>
                  ) : (
                    texts.newsletterResubscribeNoLink
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm">
        {status === "saved" && <span className="text-green-700 dark:text-green-400">{texts.saved}</span>}
      </p>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {texts.saveError}
        </p>
      )}
    </section>
  );
}

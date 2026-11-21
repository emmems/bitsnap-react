/**
 * Storage scope for a panel session. An empty or missing `projectID` is the
 * global all-shops panel (`bitsnap.pl/panel`), stored under `"*"` (a character
 * hashids never contain). Sessions are per scope: a global login is separate
 * from every `/panel/<name>` shop login.
 */
const scopeOf = (projectID?: string) => {
  const id = projectID?.trim();
  return id ? encodeURIComponent(id) : "*";
};

export const panelSessionKey = (projectID?: string, host?: string) =>
  `bitsnap-panel-session:${encodeURIComponent(host ?? "https://bitsnap.pl")}:${scopeOf(projectID)}`;

export const panelEmailKey = (projectID?: string, host?: string) =>
  `bitsnap-panel-email:${encodeURIComponent(host ?? "https://bitsnap.pl")}:${scopeOf(projectID)}`;

export function getPanelSession(projectID?: string, host?: string) {
  if (typeof window === "undefined") return undefined;
  const token = window.localStorage.getItem(panelSessionKey(projectID, host));
  return token ?? undefined;
}

export function savePanelSession(projectID: string | undefined, token: string, email: string, host?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(panelSessionKey(projectID, host), token);
  window.localStorage.setItem(panelEmailKey(projectID, host), email);
}

export function getPanelEmail(projectID?: string, host?: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(panelEmailKey(projectID, host));
}

export function clearPanelSession(projectID?: string, host?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(panelSessionKey(projectID, host));
  window.localStorage.removeItem(panelEmailKey(projectID, host));
}

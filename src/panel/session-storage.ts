const panelSessionKey = (projectID: string, host?: string) =>
  `bitsnap-panel-session:${encodeURIComponent(host ?? "https://bitsnap.pl")}:${encodeURIComponent(projectID)}`;

const panelEmailKey = (projectID: string, host?: string) =>
  `bitsnap-panel-email:${encodeURIComponent(host ?? "https://bitsnap.pl")}:${encodeURIComponent(projectID)}`;

export function getPanelSession(projectID?: string, host?: string) {
  if (typeof window === "undefined" || !projectID) return undefined;
  const token = window.localStorage.getItem(panelSessionKey(projectID, host));
  return token ?? undefined;
}

export function savePanelSession(projectID: string | undefined, token: string, email: string, host?: string) {
  if (typeof window === "undefined" || !projectID) return;
  window.localStorage.setItem(panelSessionKey(projectID, host), token);
  window.localStorage.setItem(panelEmailKey(projectID, host), email);
}

export function getPanelEmail(projectID?: string, host?: string) {
  if (typeof window === "undefined" || !projectID) return null;
  return window.localStorage.getItem(panelEmailKey(projectID, host));
}

export function clearPanelSession(projectID?: string, host?: string) {
  if (typeof window === "undefined" || !projectID) return;
  window.localStorage.removeItem(panelSessionKey(projectID, host));
  window.localStorage.removeItem(panelEmailKey(projectID, host));
}

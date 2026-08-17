import type { GetThemeOutput } from "./types";

let config: PanelConfig = {
  projectID: undefined,
  loginURL: "/panel/login",
  theme: undefined,
  host: undefined,
  allowedReturnOrigins: [],
};

let allowedReturnOrigins: string[] = [];

export interface PanelConfig {
  projectID?: string;
  loginURL?: string;
  theme?: GetThemeOutput;
  host?: string;
  allowedReturnOrigins: string[];
}

export function setPanelConfig(newConfig: Partial<PanelConfig>): void {
  config = { ...config, ...newConfig };
}

export function getPanelConfig(): PanelConfig {
  return config;
}

export function setProjectID(projectID: string): void {
  config.projectID = projectID;
}

export function setTheme(theme: GetThemeOutput): void {
  config.theme = theme;
}

export function setLoginURL(loginURL: string): void {
  config.loginURL = loginURL;
}

export function setHost(host: string): void {
  config.host = host;
}

export function setAllowedReturnOrigins(origins: string[]): void {
  allowedReturnOrigins = origins;
  config = { ...config, allowedReturnOrigins: origins };
}

export function getAllowedReturnOrigins(): string[] {
  return allowedReturnOrigins;
}

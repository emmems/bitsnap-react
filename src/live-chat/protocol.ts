export const PROTOCOL = 1;

export type ChatConfig = {
  enabled: boolean;
  projectId: string;
  chatUrl: string;
  challengeOrigin: string;
  captchaContext: string;
  texts: { greeting: string; shopName?: string };
  look: { accent: string; position: "bottom-left" | "bottom-right"; theme: "light" | "dark" | "auto" };
  privacyUrl?: string | null;
  contactEmail?: string | null;
  origins: string[];
  limits: { messageMax: number };
};

export type VisitorSession = {
  token: string;
  expiresAt: number;
  email?: string;
  verified?: boolean;
  verifiedEmail?: string;
  skipEmail?: boolean;
};

export type PanelOptions = {
  protocol: number;
  root: ShadowRoot;
  target: HTMLElement;
  apiOrigin: string;
  projectKey: string;
  locale: "pl" | "en";
  config: ChatConfig;
  preview?: boolean;
  mode?: "page";
  session?: VisitorSession;
  shopUrl?: string;
  nonce?: string;
  close(): void;
  clearBadge(): void;
};

export type Panel = { open(): void; close(): void };
export type PanelModule = { protocol: number; mount(options: PanelOptions): Panel | undefined };

declare global {
  interface Window {
    BitsnapChat?: { open(): Promise<void>; close(): void; toggle(): Promise<void>; version: string };
    BitsnapChatPanel?: PanelModule;
  }
}

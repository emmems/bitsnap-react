import { Channel as LazyChannel, ChatThread as LazyChatThread, type ChatThreadProps as MainProps } from "bitsnap-react";
import {
  Channel,
  ChatError,
  ChatThread,
  createChatClient,
  getChatTexts,
  type ChannelProps,
  type ChatBuyRequest,
  type ChatClient,
  type ChatMe,
  type ChatTexts,
  type ChatThreadProps,
} from "bitsnap-react/chat";

/** Consumer fixture for the buyer chat of this package. */

const client: ChatClient = createChatClient({
  projectId: "18",
  token: "bcht_example",
  baseUrl: "https://chat.bitsnap.pl",
});

const texts: Partial<ChatTexts> = { buyPack: "Buy more replies" };

const threadProps: ChatThreadProps = {
  projectID: "project-id",
  productId: "prodv2_abc",
  token: "bcht_example",
  locale: "en",
  texts,
  onBuy: (request: ChatBuyRequest) => void request.productId,
};

const channelProps: ChannelProps = {
  projectID: "project-id",
  channelId: "channel-id",
  apiUrl: "https://chat.bitsnap.pl",
};

const mainProps: MainProps = { projectID: "project-id", threadId: "thread-id" };

export const view = (
  <>
    <ChatThread {...threadProps} />
    <Channel {...channelProps} client={client} />
    <LazyChatThread {...mainProps} />
    <LazyChannel projectID="project-id" channelId="channel-id" />
  </>
);

export const me: Promise<ChatMe> = client.me();
export const label: string = getChatTexts(texts, "pl").inboxHeading;
export const isChatError = (error: unknown): boolean => error instanceof ChatError;

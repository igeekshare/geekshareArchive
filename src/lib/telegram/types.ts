export type TelegramFetchOptions = {
  before?: string;
  after?: string;
  timeoutMs?: number;
  retries?: number;
};

export type TelegramMedia = {
  type: "photo" | "video" | "file";
  url: string;
  thumb?: string;
  width?: string;
  height?: string;
  title?: string;
  description?: string;
};

export type TelegramReaction = {
  emoji: string;
  count: string;
};

export type TelegramChannelProfile = {
  username: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  telegramUrl: string;
};

export type ParsedTelegramMessage = {
  telegramMessageId: string;
  sourceUrl: string;
  date: string;
  datetime: string | null;
  text: string;
  html: string;
  media: TelegramMedia | null;
  replyTo: string | null;
  reactions: TelegramReaction[];
  tags: string[];
};

export type TelegramParseResult = {
  messages: ParsedTelegramMessage[];
  skipped: Array<{
    reason: string;
    source?: string;
  }>;
};

export type TelegramSyncOptions = TelegramFetchOptions;

export type TelegramSyncResult = {
  channelId: string;
  channelUsername: string;
  source: string;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  parsedCount: number;
  syncLogId: string;
};

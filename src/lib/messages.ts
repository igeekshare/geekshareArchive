export type ArchiveStatus = "archived" | "external" | "pending" | "failed";

export type PublicReaction = {
  emoji: string;
  count: string;
};

export type PublicMedia = {
  type: "photo" | "video" | "file" | "link";
  url?: string;
  thumb?: string;
  mimeType?: string;
  size?: number;
  title?: string;
  description?: string;
  archiveStatus: ArchiveStatus;
};

export type PublicMessage = {
  id: string;
  channelId: string;
  telegramMessageId: number;
  sourceUrl: string;
  date: string;
  datetime?: string;
  from: string;
  text: string;
  plainText: string;
  title: string;
  titleHtml?: string;
  summary: string;
  tags: string[];
  media: PublicMedia | null;
  mediaItems: PublicMedia[];
  replyTo: string | null;
  reactions: PublicReaction[] | null;
  archiveStatus: ArchiveStatus | "none";
  isFeatured: boolean;
  featuredOrder: number;
  engagementScore: number;
  channel: {
    title: string;
    username: string;
    avatarUrl?: string;
  };
};

export type MessageListResponse = {
  items: PublicMessage[];
  page: number;
  total: number;
  totalPages: number;
  nextCursor: string | null;
};

export type ArchiveMeta = {
  tags: Array<{ tag: string; count: number }>;
  years: string[];
  monthsByYear: Record<string, string[]>;
};

export type MessageCategory = "all" | "visual" | "link" | "interactive" | "file";
export type MessageSort = "newest" | "oldest" | "featured" | "hot";

export type HomepageChannel = {
  id: string;
  title: string;
  username: string;
  description: string | null;
  avatarUrl?: string;
  telegramUrl: string;
  createdAt: string;
  messageCount: number;
  enabled: boolean;
};

export type HomepageStats = {
  messageCount: number;
  tagCount: number;
  channelCount: number;
};

export type HomepageActivity = {
  id: string;
  summary: string;
  datetime: string;
  sourceUrl: string;
};

export type HomepageData = {
  channels: HomepageChannel[];
  stats: HomepageStats;
  featuredMessages: PublicMessage[];
  trendingMessages: PublicMessage[];
  hotTopics: Array<{ tag: string; count: number }>;
  recentMedia: PublicMessage[];
};

export type MessageDiscoveryContext = {
  previous: PublicMessage | null;
  next: PublicMessage | null;
  related: PublicMessage[];
};

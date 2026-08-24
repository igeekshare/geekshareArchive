import type { TelegramFetchOptions } from "@/lib/telegram/types";
import { normalizeTelegramUsername } from "@/lib/telegram/username";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 GeekShareArchiveBot/1.0";

export function buildTelegramPublicUrl(
  channelUsername: string,
  options: Pick<TelegramFetchOptions, "before" | "after"> = {},
): string {
  const username = normalizeTelegramUsername(channelUsername);

  const url = new URL(`https://t.me/s/${encodeURIComponent(username)}`);
  if (options.before) url.searchParams.set("before", options.before);
  if (options.after) url.searchParams.set("after", options.after);

  return url.toString();
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTelegramChannelHtml(
  channelUsername: string,
  options: TelegramFetchOptions = {},
): Promise<{ html: string; url: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const url = buildTelegramPublicUrl(channelUsername, options);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(
          `Telegram request failed with HTTP ${response.status} ${response.statusText}`,
        );
        if (attempt < retries && isRetryableStatus(response.status)) {
          lastError = error;
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw error;
      }

      const html = await response.text();
      if (!html.trim()) {
        throw new Error("Telegram returned an empty HTML response.");
      }

      return { html, url };
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `Failed to fetch Telegram channel "${channelUsername}": ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

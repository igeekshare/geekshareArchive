export function normalizeTelegramUsername(input: string): string {
  let value = input.trim();

  if (/^(?:https?:\/\/)?(?:www\.)?t\.me\//i.test(value)) {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    const segments = url.pathname.split("/").filter(Boolean);
    value = segments[0]?.toLowerCase() === "s" ? segments[1] ?? "" : segments[0] ?? "";
  }

  const normalized = value.replace(/^@+/, "").replace(/\/+$/, "").trim().toLowerCase();

  if (!/^[a-z0-9_]{3,}$/.test(normalized)) {
    throw new Error("Invalid Telegram channel username.");
  }

  return normalized;
}

export function telegramChannelIdFor(username: string): string {
  const normalized = normalizeTelegramUsername(username);
  return normalized === "xgeekshare" ? "geekshare" : normalized;
}

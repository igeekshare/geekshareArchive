const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const siteUrl = process.env.SITE_URL;

const missing = [
  ["SITE_URL", siteUrl],
  ["TELEGRAM_BOT_TOKEN", token],
  ["TELEGRAM_WEBHOOK_SECRET", secret],
]
  .filter(([, value]) => !value?.trim())
  .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(`Set ${missing.join(", ")} explicitly before registering a webhook.`);
}

const baseUrl = new URL(siteUrl);
if (baseUrl.protocol !== "https:") throw new Error("SITE_URL must use HTTPS.");
const webhookUrl = new URL("/api/telegram/webhook", baseUrl).toString();

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: [
      "channel_post",
      "edited_channel_post",
      "message_reaction_count",
    ],
    drop_pending_updates: false,
  }),
});

const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.description ?? "setWebhook failed");
console.log(`Webhook registered: ${webhookUrl}`);

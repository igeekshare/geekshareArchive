const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const siteUrl = process.env.SITE_URL ?? "https://archive.example.com";

if (!token || !secret) {
  throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first.");
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${siteUrl.replace(/\/$/, "")}/api/telegram/webhook`,
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
console.log(`Webhook registered: ${siteUrl}/api/telegram/webhook`);

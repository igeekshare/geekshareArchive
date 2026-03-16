import fs from "fs";
import path from "path";

/**
 * 改进后的解析脚本
 * 修复了之前遗漏带有 "joined" 类名的消息块的问题
 * 这种类名通常出现在同一个发送者连续发送多条消息时
 */

const DATA_DIR = "./"; // 根目录，包含 messages.html 等
const OUTPUT_FILE = "./geekshare-web/src/data/messages.json";
const FILES = [
  "messages.html",
  "messages2.html",
  "messages3.html",
  "messages4.html",
];

function parseTelegramHtml() {
  const allMessages = [];

  for (const fileName of FILES) {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`跳过文件: ${filePath} (未找到)`);
      continue;
    }

    console.log(`正在读取并解析: ${fileName}...`);
    const html = fs.readFileSync(filePath, "utf8");

    // 匹配 Telegram 消息容器的通用正则
    // 匹配 <div class="message default clearfix ..."> 或 <div class="message default clearfix joined ...">
    // 使用 split 切分更可靠
    const blocks = html.split(/<div class="message default clearfix[^"]*"/);
    // 第一个块是 HTML 头部，跳过
    blocks.shift();

    let count = 0;
    let lastFromName = "极客分享"; // 默认发送者

    for (const block of blocks) {
      // 提取 ID
      const idMatch = block.match(/id="(message\d+)"/);
      if (!idMatch) continue;
      const messageId = idMatch[1];

      // 提取日期: title="09.05.2022 16:36:05..."
      const dateMatch = block.match(
        /class="pull_right date details" title="([^"]+)"/,
      );
      const date = dateMatch ? dateMatch[1] : "";

      // 提取发送者
      // 如果是 joined 类型的消息，可能没有 from_name，沿用上一个发送者
      const fromNameMatch = block.match(/class="from_name">([\s\S]*?)<\/div>/);
      let fromName = fromNameMatch ? fromNameMatch[1].trim() : lastFromName;
      lastFromName = fromName;

      // 提取文本内容
      const textMatch = block.match(/<div class="text">([\s\S]*?)<\/div>/);
      let textHtml = textMatch ? textMatch[1].trim() : "";

      // 清理文本
      textHtml = textHtml.replace(/onclick="return ShowHashtag\([^)]+\)"/g, "");

      // 媒体提取
      let media = null;

      // 1. 照片解析
      const photoMatch = block.match(/class="photo_wrap[^"]*" href="([^"]+)"/);
      if (photoMatch) {
        const thumbMatch = block.match(
          /<img class="photo" src="([^"]+)" style="width: ([^;]+); height: ([^"]+)"/,
        );
        media = {
          type: "photo",
          url: photoMatch[1],
          thumb: thumbMatch ? thumbMatch[1] : photoMatch[1],
          width: thumbMatch ? thumbMatch[2] : "auto",
          height: thumbMatch ? thumbMatch[3] : "auto",
        };
      }
      // 2. 视频或文件解析
      else {
        const fileMatch = block.match(/class="media[^"]*" href="([^"]+)"/);
        if (fileMatch) {
          const titleMatch = block.match(/class="title bold">([^<]+)<\/div>/);
          const descMatch = block.match(/class="description">([^<]*)<\/div>/);
          media = {
            type: fileMatch[1].includes("video_files") ? "video" : "file",
            url: fileMatch[1],
            title: titleMatch ? titleMatch[1].trim() : "",
            description: descMatch ? descMatch[1].trim() : "",
          };
        }
      }

      // 提取回复 ID
      const replyMatch = block.match(/href="#(message\d+)"/);
      const replyTo =
        replyMatch && block.includes('class="reply_to details"')
          ? replyMatch[1]
          : null;

      // 提取反应 (Reactions)
      const reactions = [];
      const reactionRegex =
        /<span class="reaction">[\s\S]*?<span class="emoji">([\s\S]*?)<\/span>[\s\S]*?<span class="count">(\d+)<\/span>/g;
      let rMatch;
      while ((rMatch = reactionRegex.exec(block)) !== null) {
        reactions.push({
          emoji: rMatch[1].trim(),
          count: rMatch[2],
        });
      }

      allMessages.push({
        id: messageId,
        date,
        from: fromName,
        text: textHtml,
        media,
        replyTo,
        reactions: reactions.length > 0 ? reactions : null,
      });

      count++;
    }
    console.log(`从 ${fileName} 中成功解析了 ${count} 条消息。`);
  }

  // 确保输出目录存在
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 写入 JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allMessages, null, 2));
  console.log(`\n完成! 共处理 ${allMessages.length} 条有效消息。`);
  console.log(`数据已保存至: ${OUTPUT_FILE}`);
}

try {
  parseTelegramHtml();
} catch (error) {
  console.error("解析过程中出错:", error);
}

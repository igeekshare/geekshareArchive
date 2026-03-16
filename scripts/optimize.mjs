import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the messages.json file
const FILE_PATH = path.join(__dirname, "../src/data/messages.json");

function optimizeData() {
  console.log(`读取文件: ${FILE_PATH}...`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error("找不到 messages.json 文件，请先运行解析脚本。");
    return;
  }

  const rawData = fs.readFileSync(FILE_PATH, "utf8");
  const messages = JSON.parse(rawData);
  const initialLength = rawData.length;

  const optimizedMessages = messages.map((msg) => {
    // 1. 压缩和清理 text (HTML 内容)
    if (msg.text) {
      let t = msg.text;

      // 移除无用的空 href 标签，通常是 Telegram 导出时包裹 "#标签" 的 <a> 标签
      // <a href="">#标签</a>  ->  #标签
      t = t.replace(/<a[^>]*href=""[^>]*>(#[^<]+)<\/a>/gi, "$1");

      // 移除多余的 class, style, onclick, rel, target 等耗费 token 的属性
      t = t.replace(/ (class|style|onclick|rel|target)="[^"]*"/gi, "");

      // 压缩冗余空格和换行符
      t = t.replace(/\s{2,}/g, " ");

      // 统一规范化 <br /> 为最短形式 <br>
      t = t.replace(/<br\s*\/?>/gi, "<br>");

      msg.text = t.trim();
    }

    // 2. 移除值为 null 的字段，减少 JSON 的键值对数量以节省 Token
    if (msg.media === null) delete msg.media;
    if (msg.replyTo === null) delete msg.replyTo;
    if (
      msg.reactions === null ||
      (Array.isArray(msg.reactions) && msg.reactions.length === 0)
    ) {
      delete msg.reactions;
    }

    return msg;
  });

  // 3. 将 JSON 彻底压缩（去除格式化缩进和换行），这能省下极大的空间
  const optimizedJson = JSON.stringify(optimizedMessages);

  // 写回文件
  fs.writeFileSync(FILE_PATH, optimizedJson);

  // 计算优化结果
  const finalLength = optimizedJson.length;
  const savedBytes = initialLength - finalLength;
  const savedRatio = ((savedBytes / initialLength) * 100).toFixed(2);

  console.log("--- 重新优化与压缩完成 ---");
  console.log(
    `原始字符数: ${initialLength} (${(initialLength / 1024).toFixed(2)} KB)`,
  );
  console.log(
    `压缩后字符数: ${finalLength} (${(finalLength / 1024).toFixed(2)} KB)`,
  );
  console.log(`总计减少: ${savedBytes} 字符 (缩小了 ${savedRatio}%)`);
  console.log("这将在后续传递给 AI 或进行全文本检索时大幅减少 Token 消耗！");
}

try {
  optimizeData();
} catch (error) {
  console.error("优化脚本执行失败:", error);
}

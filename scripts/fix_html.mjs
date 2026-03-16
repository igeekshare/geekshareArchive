import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target the messages.json file
const FILE_PATH = path.join(__dirname, "../src/data/messages.json");

function fixHtml() {
  console.log(`读取文件: ${FILE_PATH}...`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error("找不到 messages.json 文件，请先运行解析脚本。");
    return;
  }

  const rawData = fs.readFileSync(FILE_PATH, "utf8");
  const messages = JSON.parse(rawData);

  let fixedCount = 0;

  const fixedMessages = messages.map((msg) => {
    if (msg.text) {
      let t = msg.text;

      // 修复常见的未闭合或多余的闭合标签，特别是在之前用 node script 截断字符时遗留的
      // 1. 修复孤立的 </strong> 或者 </a> (如果前面没有对应的开标签)
      const strongOpenCount = (t.match(/<strong>/gi) || []).length;
      const strongCloseCount = (t.match(/<\/strong>/gi) || []).length;

      if (strongOpenCount > strongCloseCount) {
        t += "</strong>".repeat(strongOpenCount - strongCloseCount);
        fixedCount++;
      } else if (strongCloseCount > strongOpenCount) {
        // 如果多出了闭合标签，将开头的几个闭合标签直接删掉
        let diff = strongCloseCount - strongOpenCount;
        while (diff > 0) {
          t = t.replace(/<\/strong>/i, "");
          diff--;
        }
        fixedCount++;
      }

      const aOpenCount = (t.match(/<a[^>]*>/gi) || []).length;
      const aCloseCount = (t.match(/<\/a>/gi) || []).length;

      if (aOpenCount > aCloseCount) {
        t += "</a>".repeat(aOpenCount - aCloseCount);
        fixedCount++;
      } else if (aCloseCount > aOpenCount) {
        let diff = aCloseCount - aOpenCount;
        while (diff > 0) {
          t = t.replace(/<\/a>/i, "");
          diff--;
        }
        fixedCount++;
      }

      // 2. 清理悬空的标签，例如文本最后仅剩一个 '<br>' 或者 '<strong>'
      t = t.replace(/(<br>|<strong>|<a[^>]*>|\s)+$/i, "");

      // 3. 将任何残缺的标签完全抹除 (例如 "<a hre" 这种被暴力切断的)
      t = t.replace(/<[a-z]+[^>]*$/i, "");

      msg.text = t;
    }
    return msg;
  });

  // 写回文件
  fs.writeFileSync(FILE_PATH, JSON.stringify(fixedMessages));

  console.log(`--- 修复完成 ---`);
  console.log(`成功修复了 ${fixedCount} 处存在潜在 HTML 标签闭合错误的消息。`);
  console.log(`请重新运行 'npm run dev' 检查报错是否消失。`);
}

try {
  fixHtml();
} catch (error) {
  console.error("修复脚本执行失败:", error);
}

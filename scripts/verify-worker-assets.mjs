import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = new URL("../out/", import.meta.url);
const ignoredDirectories = new Set(["photos", "video_files", "stickers"]);
const maxFiles = 20_000;
const maxFileSize = 25 * 1024 * 1024;
const files = [];

async function walk(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!relative && ignoredDirectories.has(entry.name)) continue;
    if (!relative && entry.name === ".assetsignore") continue;
    const nextRelative = relative ? path.posix.join(relative, entry.name) : entry.name;
    const nextUrl = new URL(`${nextRelative.replaceAll("\\", "/")}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) await walk(nextUrl, nextRelative);
    else if (entry.isFile()) files.push({ key: nextRelative, size: (await stat(nextUrl)).size });
  }
}

await walk(root);
const oversized = files.filter((file) => file.size > maxFileSize);
if (files.length > maxFiles) throw new Error(`Workers Assets count ${files.length} exceeds ${maxFiles}`);
if (oversized.length) {
  throw new Error(`Workers Assets exceed 25 MiB: ${oversized.map((file) => file.key).join(", ")}`);
}

const adminEntryUrl = new URL("admin/index.html", root);
const adminDashboardUrl = new URL("admin/dashboard/index.html", root);
await Promise.all([access(adminEntryUrl), access(adminDashboardUrl)]);
const [adminEntry, adminDashboard] = await Promise.all([
  readFile(adminEntryUrl, "utf8"),
  readFile(adminDashboardUrl, "utf8"),
]);
if (!adminEntry.includes("管理入口，留给维护归档的人。")) {
  throw new Error("Admin entry asset does not contain the branded login surface");
}
if (adminEntry.includes("后台导航") || adminEntry.includes("正在汇总归档状态")) {
  throw new Error("Admin entry asset unexpectedly contains the protected admin shell");
}
if (!adminDashboard.includes("后台导航") || !adminDashboard.includes("正在汇总归档状态")) {
  throw new Error("Admin dashboard asset is missing the protected admin shell");
}
console.log(`Workers Assets verified: ${files.length} files; historical media excluded.`);

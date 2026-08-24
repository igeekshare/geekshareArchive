import { writeFile } from "node:fs/promises";

await writeFile(
  new URL("../out/.assetsignore", import.meta.url),
  "/photos/**\n/video_files/**\n/stickers/**\n",
);

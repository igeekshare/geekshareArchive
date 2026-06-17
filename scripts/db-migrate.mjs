import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["prisma", "migrate", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    RUST_LOG: process.env.RUST_LOG ?? "trace",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`prisma migrate dev exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

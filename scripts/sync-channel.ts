import { prisma } from "@/lib/prisma";
import { syncTelegramChannel } from "@/lib/telegram/sync";
import type { TelegramSyncOptions } from "@/lib/telegram/types";

type ParsedArgs = {
  username: string;
  options: TelegramSyncOptions;
};

function usage(): string {
  return [
    "Usage: npm run sync:channel -- <channelUsername> [options]",
    "",
    "Options:",
    "  --before <id>     Fetch messages before a Telegram message id",
    "  --after <id>      Fetch messages after a Telegram message id",
    "  --timeout <ms>    Request timeout in milliseconds",
    "  --retries <n>     Retry count for transient request failures",
  ].join("\n");
}

function readOptionValue(
  args: string[],
  index: number,
  optionName: string,
): { value: string; nextIndex: number } {
  const current = args[index];
  const inlineValue = current.slice(optionName.length + 1);
  if (current.startsWith(`${optionName}=`)) {
    if (!inlineValue) throw new Error(`${optionName} requires a value.`);
    return { value: inlineValue, nextIndex: index };
  }

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return { value: next, nextIndex: index + 1 };
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

function parseArgs(args: string[]): ParsedArgs {
  const options: TelegramSyncOptions = {};
  let username: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    }

    if (arg.startsWith("--before")) {
      const parsed = readOptionValue(args, index, "--before");
      options.before = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg.startsWith("--after")) {
      const parsed = readOptionValue(args, index, "--after");
      options.after = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg.startsWith("--timeout")) {
      const parsed = readOptionValue(args, index, "--timeout");
      options.timeoutMs = parsePositiveInteger(parsed.value, "--timeout");
      index = parsed.nextIndex;
      continue;
    }

    if (arg.startsWith("--retries")) {
      const parsed = readOptionValue(args, index, "--retries");
      options.retries = parseNonNegativeInteger(parsed.value, "--retries");
      index = parsed.nextIndex;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }

    if (username) {
      throw new Error(`Unexpected extra argument: ${arg}\n\n${usage()}`);
    }

    username = arg;
  }

  if (!username) {
    throw new Error(`Telegram channel username is required.\n\n${usage()}`);
  }

  return { username, options };
}

async function main() {
  const { username, options } = parseArgs(process.argv.slice(2));
  const result = await syncTelegramChannel(username, options);

  console.log(
    [
      `Synced Telegram channel @${result.channelUsername}`,
      `Source: ${result.source}`,
      `Channel ID: ${result.channelId}`,
      `Parsed: ${result.parsedCount}`,
      `Imported: ${result.importedCount}`,
      `Updated: ${result.updatedCount}`,
      `Skipped: ${result.skippedCount}`,
      `SyncLog ID: ${result.syncLogId}`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

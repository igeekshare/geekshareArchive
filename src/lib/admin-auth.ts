import {
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

function constantTimeTextEqual(actual: string, expected: string) {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(actualDigest, expectedDigest);
}

async function verifyScryptPassword(password: string, encodedHash: string) {
  const [algorithm, salt, hash, extra] = encodedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !hash || extra) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");

  if (expected.length === 0 || expected.toString("hex") !== hash.toLowerCase()) {
    return false;
  }

  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return timingSafeEqual(actual, expected);
}

export async function validateAdminCredentials(
  username: string,
  password: string,
) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const plainPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || (!passwordHash && !plainPassword)) {
    return false;
  }

  const isUsernameValid = constantTimeTextEqual(username, expectedUsername);
  const isPasswordValid = passwordHash
    ? await verifyScryptPassword(password, passwordHash)
    : constantTimeTextEqual(password, plainPassword ?? "");

  return isUsernameValid && isPasswordValid;
}

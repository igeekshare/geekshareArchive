"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateAdminCredentials } from "@/lib/admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
} from "@/lib/admin-session";

export type LoginState = {
  error: string;
};

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isValid = await validateAdminCredentials(username, password);

  if (!isValid) {
    return { error: "用户名或密码错误，请重试。" };
  }

  const token = await createAdminSessionToken(username);

  if (!token) {
    return { error: "登录失败，请稍后重试。" };
  }

  cookies().set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  redirect("/admin");
}

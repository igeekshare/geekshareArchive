"use client";

type AdminErrorBody = {
  error?: string;
};

let reauthenticationStarted = false;

function reauthenticate(): void {
  if (typeof window === "undefined" || reauthenticationStarted) return;
  reauthenticationStarted = true;
  window.location.reload();
}

export async function adminRequestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => null)) as (T & AdminErrorBody) | null;

  if (response.status === 401) {
    reauthenticate();
    throw new Error("管理员登录状态已过期，正在重新验证身份…");
  }
  if (!response.ok) throw new Error(body?.error ?? `请求失败 (${response.status})`);
  return (response.status === 204 ? null : body) as T;
}

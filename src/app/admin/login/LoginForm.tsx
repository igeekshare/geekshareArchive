"use client";

import { useFormState, useFormStatus } from "react-dom";
import { LockKeyhole, LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogIn className="h-4 w-4" aria-hidden="true" />
      {pending ? "正在登录..." : "登录"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="username" className="text-sm font-medium text-zinc-700">
          用户名
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

export function LoginMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-900 text-white">
      <LockKeyhole className="h-5 w-5" aria-hidden="true" />
    </div>
  );
}

import LoginForm, { LoginMark } from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <LoginMark />
        <h1 className="mt-6 text-2xl font-semibold text-zinc-950">登录管理后台</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          使用后台账号继续访问 GeekShare 管理页面。
        </p>
        <LoginForm />
      </section>
    </main>
  );
}

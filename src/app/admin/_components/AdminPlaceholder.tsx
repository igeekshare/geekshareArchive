export default function AdminPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section aria-labelledby="page-title">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">{title}</h1>
        <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600">规划中</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
        {description}
      </p>
    </section>
  );
}

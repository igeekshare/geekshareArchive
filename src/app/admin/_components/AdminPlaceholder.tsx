export default function AdminPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section aria-labelledby="page-title">
      <p className="text-sm font-medium text-zinc-500">管理后台</p>
      <h1 id="page-title" className="mt-2 text-3xl font-semibold text-zinc-950">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
        {description}
      </p>
    </section>
  );
}

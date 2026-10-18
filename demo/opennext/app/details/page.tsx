import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Details({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <>
      <h1>Details</h1>
      <p>Another server-rendered page.</p>
      {q && <p id="query">{q}</p>}
      <Link href="/">Home</Link>
    </>
  );
}

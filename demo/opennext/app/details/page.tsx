import Link from "next/link";
export const dynamic = "force-dynamic";
export default function Details() {
  return (
    <>
      <h1>Details</h1>
      <p>Another server-rendered page.</p>
      <Link href="/">Home</Link>
    </>
  );
}

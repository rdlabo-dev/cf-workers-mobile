import Link from "next/link";
import Image from "next/image";
import Counter from "./counter";
import ClientMessage from "./client-message";
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <>
      <h1>OpenNext in Capacitor</h1>
      <nav>
        <Link href="/details">Details</Link>
        <Link href="/account" prefetch={false}>
          Account
        </Link>
      </nav>
      <p id="server-rendered">Rendered by Next.js</p>
      <Image src="/mark.svg" alt="Sample mark" width={80} height={40} />
      <Counter />
      <ClientMessage />
    </>
  );
}

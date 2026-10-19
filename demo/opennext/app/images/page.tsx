import Image from "next/image";
export default function Images() {
  return (
    <main>
      <h1>Optimized image</h1>
      <Image src="/image.png" alt="Optimized sample" width={64} height={32} />
    </main>
  );
}

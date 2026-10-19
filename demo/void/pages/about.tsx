import { useState } from "react";

export default function AboutPage() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>A public Void page</h1>
      <p>This page renders without a database.</p>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
export default function Message() {
  const [message, setMessage] = useState("Loading message…");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/message", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Message request failed");
        return response.json();
      })
      .then((value) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("message" in value) ||
          typeof value.message !== "string"
        )
          throw new Error("Invalid message response");
        setMessage(value.message);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Message unavailable");
      });
    return () => controller.abort();
  }, []);
  return <p id="client-only">{message}</p>;
}

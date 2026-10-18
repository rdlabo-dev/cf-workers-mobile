"use client";
import dynamic from "next/dynamic";
export default dynamic(() => import("./message"), {
  ssr: false,
  loading: () => <p id="client-loading">Loading message…</p>,
});

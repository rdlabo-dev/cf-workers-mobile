export const documentConfig = (
  globalThis as typeof globalThis & {
    __workersCapacitorDocuments: { baseURL: string; assets: string[] };
  }
).__workersCapacitorDocuments;
export function isDocumentURL(url: URL) {
  return (
    !documentConfig.assets.includes(url.pathname) &&
    !url.pathname.startsWith("/_capacitor_")
  );
}

export const DEFAULT_BACKEND_URL =
  "https://rag-api-851836889082.us-central1.run.app";

export function backendEndpoint(baseUrl: string, queryPath: string): string {
  if (!baseUrl.trim() || baseUrl.length > 500)
    throw new Error("Enter your backend server URL.");
  let base: URL;
  try {
    base = new URL(baseUrl.trim());
  } catch {
    throw new Error(
      "Enter a full backend URL, such as https://my-rag.example.com.",
    );
  }
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error(
      "Use an HTTP or HTTPS server URL without passwords, query parameters, or fragments.",
    );
  const path = queryPath.trim();
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.length > 500 ||
    /[\\?#]/.test(path) ||
    path.split("/").some((p) => p === "." || p === "..") ||
    /%2e|%2f|%5c/i.test(path)
  )
    throw new Error("Enter a question path such as /query or /chat.");
  return base.toString().replace(/\/+$/, "") + path;
}

import { proxyRagRequest } from "@/lib/rag-proxy";

export const runtime = "nodejs";
export const maxDuration = 120;

export function POST(request: Request) {
  return proxyRagRequest(request, {
    baseUrl: process.env.BACKEND_URL,
    queryPath: process.env.BACKEND_QUERY_PATH,
    apiKey: process.env.BACKEND_API_KEY,
  });
}

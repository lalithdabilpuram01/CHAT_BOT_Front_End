import { connectBackend } from "@/lib/connect-backend";
export const runtime = "nodejs";
export const maxDuration = 120;
export function POST(request: Request) {
  return connectBackend(request);
}

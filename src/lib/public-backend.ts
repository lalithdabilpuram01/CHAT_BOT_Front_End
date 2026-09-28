import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return (
    family === 6 &&
    globalV6.check(address, "ipv6") &&
    !blocked.check(address, "ipv6")
  );
}

export class BackendAddressError extends Error {}

export async function resolvePublicAddress(hostname: string, resolve = lookup) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolve(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new BackendAddressError(
      "Use a publicly reachable backend URL. Local and private network addresses are not supported by this connection.",
    );
  return addresses.find((a) => a.family === 4) ?? addresses[0];
}

// Resolve once, validate every result, and connect to the validated IP. The original
// hostname is retained for Host and TLS certificate validation; no second DNS lookup
// or automatic redirect can turn a public destination into an internal one.
export async function postPublicBackend(
  url: URL,
  body: string,
  accept: string,
  signal: AbortSignal,
): Promise<Response> {
  const address = await resolvePublicAddress(url.hostname);
  const tlsHost = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? https.request : http.request;
    const outgoing = send(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        path: url.pathname + url.search,
        ...(url.protocol === "https:"
          ? { servername: isIP(tlsHost) ? undefined : tlsHost }
          : {}),
        method: "POST",
        agent: false,
        signal,
        headers: {
          Host: url.host,
          "Content-Type": "application/json",
          Accept: accept,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (incoming) => {
        const status = incoming.statusCode ?? 502;
        if (status < 200 || status >= 300 || status === 204 || status === 205) {
          incoming.destroy();
          resolve(
            Response.json(
              {
                error:
                  status >= 300 && status < 400
                    ? "The backend redirected the request. Enter its final server URL and question path."
                    : `The backend returned HTTP ${status}. Check its address and request settings.`,
              },
              { status: status >= 400 ? status : 502 },
            ),
          );
          return;
        }
        resolve(
          new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
            status,
            headers: {
              "Content-Type":
                incoming.headers["content-type"] || "application/json",
              "Cache-Control": "no-store",
            },
          }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

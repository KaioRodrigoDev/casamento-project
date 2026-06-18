import type { NextRequest } from "next/server";
import { getStorageTargets } from "@/lib/storage";

export const runtime = "nodejs";

// Hosts permitidos: apenas os VPS configurados em PUBLIC_UPLOAD_BASE_URL /
// CONTABO_PUBLIC_UPLOAD_BASE_URL. Evita que o proxy vire um open proxy/SSRF.
function getAllowedHosts() {
  const hosts = new Set<string>();
  for (const target of getStorageTargets()) {
    if (!target.publicBaseUrl) continue;
    try {
      hosts.add(new URL(target.publicBaseUrl).host);
    } catch {
      // base url invalida no env, ignora
    }
  }
  return hosts;
}

// Faz proxy de uma imagem do VPS (servida em HTTP) atraves do app (HTTPS),
// resolvendo o erro de Mixed Content no painel admin.
export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");

  if (!src) {
    return new Response("Parametro 'src' ausente.", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response("URL invalida.", { status: 400 });
  }

  if (!getAllowedHosts().has(target.host)) {
    return new Response("Host nao permitido.", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { cache: "no-store" });
  } catch {
    return new Response("Falha ao buscar a imagem no VPS.", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Imagem indisponivel.", { status: upstream.status || 502 });
  }

  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ?? "application/octet-stream",
  );
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("cache-control", "public, max-age=86400, immutable");

  return new Response(upstream.body, { status: 200, headers });
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function cleanEnv(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim().replace(/^['"]+|['"]+$/g, "").trim();
  return t || undefined;
}

function envBySuffix(suffix: string): { key: string; value: string } | undefined {
  const target = suffix.toLowerCase();
  for (const [k, v] of Object.entries(process.env)) {
    if (k.toLowerCase().endsWith(target)) {
      const val = cleanEnv(v);
      if (val) return { key: k, value: val };
    }
  }
  return undefined;
}

function fromConnString(v: string | undefined) {
  const s = cleanEnv(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    const token = decodeURIComponent(u.password || "");
    if (!token || !u.hostname) return undefined;
    return { url: `https://${u.hostname}`, token };
  } catch {
    return undefined;
  }
}

// Diagnostics only — never returns secret values, only variable NAMES and
// a redis reachability check.
export async function GET() {
  const relatedKeys = Object.keys(process.env).filter((k) =>
    /(KV_REST_API_URL|KV_REST_API_TOKEN|KV_URL|REDIS_URL|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)$/i.test(
      k
    )
  );

  const urlHit =
    envBySuffix("KV_REST_API_URL") || envBySuffix("UPSTASH_REDIS_REST_URL");
  const tokenHit =
    envBySuffix("KV_REST_API_TOKEN") || envBySuffix("UPSTASH_REDIS_REST_TOKEN");
  const connHit = envBySuffix("KV_URL") || envBySuffix("REDIS_URL");
  const conn = fromConnString(connHit?.value);

  const url = urlHit?.value || conn?.url;
  const token = tokenHit?.value || conn?.token;
  const useRedis = !!(url && token);

  let ping: string | null = null;
  let pingError: string | null = null;
  if (useRedis) {
    try {
      const { Redis } = await import("@upstash/redis");
      const r = new Redis({ url: url!, token: token! });
      ping = String(await r.ping());
    } catch (e) {
      pingError = (e as Error).message;
    }
  }

  return NextResponse.json({
    useRedis,
    resolvedUrlHost: url ? new URL(url).host : null,
    urlFromKey: urlHit?.key ?? (conn ? connHit?.key : null) ?? null,
    tokenFromKey: tokenHit?.key ?? (conn ? connHit?.key : null) ?? null,
    relatedEnvKeys: relatedKeys,
    ping,
    pingError,
  });
}

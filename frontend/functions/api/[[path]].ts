/**
 * Cloudflare Pages Function — same-origin API proxy.
 *
 * Every browser request to `/api/*` is forwarded server-side to the backend
 * exposed by the Cloudflare Tunnel, so the browser only ever talks to the Pages
 * origin. No CORS is involved. Unlike a `_redirects` 200-rewrite, a Function
 * reliably forwards the method, the Authorization header, and POST/multipart
 * bodies (needed for login and receipt upload), and streams the response back
 * (needed for receipt/PDF downloads).
 *
 * Configure the tunnel hostname as the Pages environment variable `API_ORIGIN`,
 * e.g. API_ORIGIN = https://api.example.com
 *
 * This file lives outside `src/`, so it is built by Cloudflare Pages (not Vite).
 */
interface Env {
  API_ORIGIN?: string;
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  // TEMP DEBUG (login trace) — remove after diagnosis. If this line never shows
  // up in `wrangler pages deployment tail`, the Function is NOT deployed and
  // /api/* is being served by the SPA fallback instead.
  console.log("[pages-fn-debug] invoked", {
    url: request.url,
    method: request.method,
    hasApiOrigin: Boolean(env.API_ORIGIN),
  });

  const origin = (env.API_ORIGIN ?? "").replace(/\/+$/, "");
  if (!origin) {
    return new Response(
      JSON.stringify({ error: "API_ORIGIN is not configured on Pages" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const incoming = new URL(request.url);
  // Strip the leading "/api" prefix; the backend mounts routes at the root.
  const path = incoming.pathname.replace(/^\/api/, "");
  const target = `${origin}${path}${incoming.search}`;

  // Re-issue the request to the backend, preserving method, headers, and body.
  const proxied = new Request(target, request);
  return fetch(proxied);
};

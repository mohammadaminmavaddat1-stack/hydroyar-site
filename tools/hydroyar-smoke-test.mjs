import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SITE = "https://aminmvt.ir/";
const PROGRESS = new URL("progress.html", SITE).href;
const WORKER = "https://hydroyar-chat.mohammadaminmavaddat1.workers.dev";
const ORIGIN = "https://aminmvt.ir";
const LEGACY_ORIGIN = "https://mohammadaminmavaddat1-stack.github.io";
const CURL = process.platform === "win32" ? "curl.exe" : "curl";
const results = [];

function trackedHtmlPages() {
  const listed = spawnSync("git", ["ls-files", "--", "*.html"], {
    cwd: process.cwd(), encoding: "utf8", windowsHide: true
  });
  if (listed.error || listed.status !== 0) throw new Error("Run from the HydroYar repository root.");
  return listed.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
const SECURITY_HEADERS = [
  "strict-transport-security", "content-security-policy", "x-frame-options",
  "x-content-type-options", "referrer-policy", "permissions-policy",
  "x-permitted-cross-domain-policies", "x-dns-prefetch-control", "x-download-options"
];
const productionPageBodies = new Map();
function assertProductionSecurityHeaders(response, label) {
  for (const header of SECURITY_HEADERS) {
    assert.ok(response.headers.get(header), label + ": missing " + header);
  }
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000", label + ": HSTS policy mismatch");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/i, label + ": strict CSP missing");
  assert.ok(response.headers.get("cf-ray"), label + ": response did not traverse Cloudflare");
}
function extractSameOriginRefs(html, pageUrl) {
  // Parse navigation/resource attributes in markup, not arbitrary JavaScript text.
  const source = String(html)
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1")
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, "$1")
    .replace(/<!--[\s\S]*?-->/g, "");
  const refs = new Set();
  const tags = source.match(/<(?:a|link|script|img|iframe|form|source|video|audio|area|use|input|track|embed|object)\b[^>]*>/gi) || [];
  const attr = /(?:^|\s)(?:href|src|action|poster)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const tag of tags) {
    attr.lastIndex = 0;
    let match;
    while ((match = attr.exec(tag))) {
      const value = String(match[1] || match[2] || match[3] || "").trim();
      if (!value || /^(?:#|mailto:|tel:|sms:|javascript:|data:|blob:)/i.test(value)) continue;
      try {
        const u = new URL(value, pageUrl);
        if (!["http:", "https:"].includes(u.protocol) || !["aminmvt.ir", "www.aminmvt.ir"].includes(u.hostname.toLowerCase())) continue;
        u.hash = "";
        refs.add(u.href);
      } catch {}
    }
  }
  return refs;
}
function q(value) {
  return '"' + String(value).replaceAll("\\", "/").replaceAll('"', '\\"').replaceAll("\r", "").replaceAll("\n", "") + '"';
}
async function request(url, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydroyar-smoke-"));
  const configPath = path.join(dir, "curl.conf");
  const headersPath = path.join(dir, "response.headers");
  const bodyPath = path.join(dir, "request.json");
  try {
    const method = options.method || "GET";
    const timeoutSec = Math.ceil((options.timeoutMs || 15000) / 1000);
    const config = [
      "url = " + q(url),
      ...(method === "HEAD" ? ["head"] : ["request = " + q(method)]),
      "dump-header = " + q(headersPath),
      'write-out = "\\n__HTTP_STATUS__:%{http_code}"',
      "max-time = " + timeoutSec,
      "silent",
      "show-error",
      ...Object.entries(options.headers || {}).map(([key, value]) => "header = " + q(key + ": " + value)),
      ...(options.body === undefined ? [] : (() => {
        fs.writeFileSync(bodyPath, options.body, { encoding: "utf8", mode: 0o600 });
        return ["data-binary = " + q("@" + bodyPath)];
      })())
    ].join("\n");
    fs.writeFileSync(configPath, config, { encoding: "utf8", mode: 0o600 });
    const result = spawnSync(CURL, ["--config", configPath], {
      encoding: "utf8", timeout: (timeoutSec + 5) * 1000, windowsHide: true
    });
    if (result.error) throw result.error;
    const output = String(result.stdout || "");
    const marker = /(?:^|\r?\n)__HTTP_STATUS__:(\d+)\r?\n?$/;
    const match = marker.exec(output);
    if (!match || result.status !== 0) {
      throw new Error("HTTPS request failed: " + String(result.stderr || output).trim().slice(0, 500));
    }
    const rawHeaders = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, "utf8") : "";
    let responseHeaders = {};
    for (const line of rawHeaders.split(/\r?\n/)) {
      if (/^HTTP\//i.test(line)) responseHeaders = {};
      else {
        const ix = line.indexOf(":");
        if (ix > 0) responseHeaders[line.slice(0, ix).trim().toLowerCase()] = line.slice(ix + 1).trim();
      }
    }
    const body = output.slice(0, match.index);
    const status = Number(match[1]);
    return {
      status,
      headers: { get(name) { return responseHeaders[String(name).toLowerCase()] || null; } },
      text: async () => body,
      json: async () => JSON.parse(body)
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("PASS", name); }
  catch (e) { results.push({ name, ok: false }); console.error("FAIL", name + ":", e.message); }
}

await check("main site returns HTTP 200 and includes chat endpoint", async () => {
  const r = await request(SITE, { timeoutMs: 30000 });
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes("hydroyar-chat.mohammadaminmavaddat1.workers.dev"), "chat endpoint missing");
});
await check("progress page returns HTTP 200", async () => {
  const r = await request(PROGRESS, { timeoutMs: 15000 });
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes("<title"));
});
await check("site form exposes the request tracking code and privacy page explains ticket retention", async () => {
  const site = await request(SITE, { timeoutMs: 30000 });
  assert.equal(site.status, 200);
  const siteHtml = await site.text();
  assert.ok(siteHtml.includes("ticketCode"), "request ticket code is not wired into the form");
  assert.ok(siteHtml.includes("کد پیگیری"), "request tracking label missing");
  const privacy = await request(new URL("privacy.html", SITE).href, { timeoutMs: 15000 });
  assert.equal(privacy.status, 200);
  const privacyHtml = await privacy.text();
  assert.ok(privacyHtml.includes("۹۰ روز"), "ticket retention period missing from privacy notice");
  assert.ok(!/Cloudflare KV|Supabase|OpenAI/i.test(privacyHtml), "privacy notice should not name vendors");
});
await check("all tracked HTML pages serve 200 with production security headers", async () => {
  const files = trackedHtmlPages();
  assert.ok(files.length >= 30, "Expected at least 30 tracked HTML pages; found " + files.length);
  const items = files.map(file => ({ file, url: new URL(file.replaceAll("\\", "/"), SITE).href }));
  const failures = [];
  for (let i = 0; i < items.length; i += 8) {
    await Promise.all(items.slice(i, i + 8).map(async item => {
      try {
        const r = await request(item.url, { timeoutMs: 25000 });
        assert.equal(r.status, 200, item.file + ": HTTP status");
        assertProductionSecurityHeaders(r, item.file);
        const body = await r.text();
        assert.ok(body.length > 100, item.file + ": empty/short response");
        productionPageBodies.set(item.url, body);
      } catch (error) { failures.push(item.file + ": " + error.message); }
    }));
  }
  assert.equal(productionPageBodies.size, files.length, "Some tracked HTML pages were not loaded");
  assert.deepEqual(failures, [], failures.slice(0, 10).join("\n"));
});

await check("all same-origin HTML links and referenced assets resolve", async () => {
  assert.ok(productionPageBodies.size >= 30, "HTML page-header test must run first");
  const refs = new Set();
  for (const [url, html] of productionPageBodies) {
    for (const ref of extractSameOriginRefs(html, url)) refs.add(ref);
  }
  assert.ok(refs.size >= 20, "Too few same-origin references found: " + refs.size);
  const failures = [];
  const urls = [...refs];
  for (let i = 0; i < urls.length; i += 8) {
    await Promise.all(urls.slice(i, i + 8).map(async url => {
      try {
        const parsed = new URL(url);
        if (productionPageBodies.has(parsed.href)) return;
        const r = await request(url, { method: "HEAD", timeoutMs: 20000 });
        assert.ok([200, 301, 302, 307, 308].includes(r.status), url + ": HTTP " + r.status);
      } catch (error) { failures.push(error.message); }
    }));
  }
  assert.deepEqual(failures, [], failures.slice(0, 15).join("\n"));
});

await check("canonical HTTP and www redirects are correct", async () => {
  const cases = [
    ["http://aminmvt.ir/", "https://aminmvt.ir/"],
    ["https://www.aminmvt.ir/", "https://aminmvt.ir/"]
  ];
  for (const [url, target] of cases) {
    const r = await request(url, { method: "HEAD", timeoutMs: 20000 });
    assert.equal(r.status, 301, url + ": expected 301");
    assert.equal(r.headers.get("location"), target, url + ": unexpected Location");
    if (url.startsWith("https://")) assertProductionSecurityHeaders(r, url);
    else assert.ok(r.headers.get("cf-ray"), url + ": redirect did not traverse Cloudflare");
  }
  const httpWww = await request("http://www.aminmvt.ir/", { method: "HEAD", timeoutMs: 20000 });
  assert.equal(httpWww.status, 301);
  assert.equal(httpWww.headers.get("location"), "https://www.aminmvt.ir/");
});

await check("unknown routes return a safe, non-cacheable 404 page", async () => {
  const r = await request(new URL("__hydroyar_qa_missing_7f43c9.html", SITE).href, { timeoutMs: 20000 });
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assertProductionSecurityHeaders(r, "404 response");
  const body = await r.text();
  assert.ok(body.length > 20, "404 body is empty");
  assert.ok(!/HYDROYAR-CHANGE-PLAN|wrangler\.toml|TELEGRAM_BOT_TOKEN/i.test(body), "404 body leaks internal/config text");
});

await check("successful email confirmation returns to the canonical site root", async () => {
  const r = await request(new URL("auth/confirm/index.html", SITE).href, { timeoutMs: 20000 });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes("href=\"../../?auth=confirmed\""), "initial confirmation link should return to root");
  assert.ok(html.includes("document.getElementById('continue').href='/?auth=confirmed'"), "successful confirmation must redirect to root, not /auth/");
  assert.ok(html.includes("location.href='../../?auth=login'"), "login action should return to root");
  assert.ok(!html.includes("document.getElementById('continue').href='../?auth=confirmed'"), "nested relative redirect would be broken");
});
await check("repository metadata and internal tools are not exposed publicly", async () => {
  for (const route of ["/.gitignore", "/.nojekyll", "/_headers", "/HYDROYAR-CHANGE-PLAN.md", "/tools/hydroyar-smoke-test.mjs", "/hydroyar-chat-worker/wrangler.toml"]) {
    const r = await request(new URL(route, SITE).href, { method: "HEAD", timeoutMs: 20000 });
    assert.equal(r.status, 404, route + ": expected 404");
    assert.equal(r.headers.get("cache-control"), "no-store", route + ": expected no-store");
    assertProductionSecurityHeaders(r, route);
  }
});

await check("worker health confirms the private ticket store and Telegram agent", async () => {
  const r = await request(WORKER, { timeoutMs: 15000 });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, "HydroYar chat API");
  assert.equal(data.projectNotifications?.ticketStoreConfigured, true, "private ticket KV binding missing");
  assert.equal(data.projectNotifications?.privateTelegramAgentConfigured, true, "Telegram webhook secret missing");
});
await check("worker CORS preflight permits custom domain", async () => {
  const r = await request(WORKER, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    timeoutMs: 15000
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
});

await check("worker CORS preflight preserves legacy GitHub Pages origin", async () => {
  const r = await request(WORKER, {
    method: "OPTIONS",
    headers: { Origin: LEGACY_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    timeoutMs: 15000
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), LEGACY_ORIGIN);
});
await check("worker returns a live AI answer using the current public API contract", async () => {
  const r = await request(WORKER, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Reply briefly with the words HYDROYAR_TEST_OK." }] }),
    timeoutMs: 90000
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(typeof data.answer, "string");
  assert.ok(data.answer.trim().length > 0, "AI answer is empty");
  assert.equal(typeof data.webSearchUsed, "boolean", "webSearchUsed response metadata missing");
});
await check("service catalogue stays within verified HydroYar capabilities", async () => {
  const r = await request(WORKER, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "چه خدماتی ارائه می‌کنید؟" }] }),
    timeoutMs: 90000
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(data.answer.includes("اتوماسیون"), "automation service missing");
  assert.ok(data.answer.includes("پایتون"), "custom Python/software service missing");
  assert.ok(data.answer.includes("پرداخت آنلاین"), "live-feature limitations missing");
  assert.equal(typeof data.webSearchUsed, "boolean", "webSearchUsed response metadata missing");
});
await check("payment-policy guard prevents unsupported checkout claims", async () => {
  const r = await request(WORKER, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "آیا پرداخت آنلاین هیدرویار فعال است؟" }] }),
    timeoutMs: 90000
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(data.answer.includes("فعال نیست"), "payment inactivity must be explicit");
  assert.ok(data.answer.includes("تلگرام"), "manual Telegram order flow must be explained");
  assert.ok(!/سیستم پرداخت امن|درگاه پرداخت امن/.test(data.answer), "unsupported live checkout claim detected");
  assert.equal(typeof data.webSearchUsed, "boolean", "webSearchUsed response metadata missing");
});
await check("pricing answers use only verified starting-price guidance", async () => {
  const r = await request(WORKER, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "قیمت سایت فروشگاهی چقدر است؟" }] }),
    timeoutMs: 90000
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(data.answer.includes("۱۲ میلیون تومان"), "verified professional starting price missing");
  assert.ok(data.answer.includes("فعلاً فعال نیست"), "current payment limitation must be disclosed");
  assert.ok(data.answer.includes("قیمت نهایی"), "answer must explain that the final store price depends on scope");
  assert.equal(typeof data.webSearchUsed, "boolean", "webSearchUsed response metadata missing");
});
console.log("\nResult: " + results.filter(x => x.ok).length + "/" + results.length + " checks passed.");
if (results.some(x => !x.ok)) process.exitCode = 1;

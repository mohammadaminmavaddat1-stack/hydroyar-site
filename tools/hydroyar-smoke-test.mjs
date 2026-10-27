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
      "request = " + q(method),
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
  assert.ok(privacyHtml.includes("Cloudflare KV"), "ticket storage provider not disclosed");
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
await check("worker returns a live AI answer from the ten-agent team", async () => {
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
  assert.equal(data.team?.agentCount, 10, "ten-agent coordinator metadata missing");
  assert.equal(data.team?.agents?.length, 9, "nine specialist roster missing");
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
  assert.equal(data.team?.agentCount, 10);
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
  assert.equal(data.team?.agentCount, 10);
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
  assert.equal(data.team?.agentCount, 10);
});
console.log("\nResult: " + results.filter(x => x.ok).length + "/" + results.length + " checks passed.");
if (results.some(x => !x.ok)) process.exitCode = 1;

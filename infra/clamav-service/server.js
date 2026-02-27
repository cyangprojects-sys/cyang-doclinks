const http = require("http");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8080);
const SCAN_TOKEN = String(process.env.CLAMAV_SCAN_TOKEN || "");
const MAX_BYTES = Math.max(1_000_000, Number(process.env.CLAMAV_MAX_BYTES || 26_214_400));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function unauthorized(res) {
  json(res, 401, { ok: false, error: "UNAUTHORIZED" });
}

function hashSha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function requireAuth(req, res) {
  if (!SCAN_TOKEN) return true;
  const auth = String(req.headers["authorization"] || "");
  if (auth !== `Bearer ${SCAN_TOKEN}`) {
    unauthorized(res);
    return false;
  }
  return true;
}

function scanFile(tmpPath) {
  // clamdscan --fdpass exits 0 when clean, 1 when infected, >1 on error
  const out = spawnSync("clamdscan", ["--no-summary", "--fdpass", tmpPath], {
    encoding: "utf8",
    timeout: Number(process.env.CLAMAV_TIMEOUT_MS || 30_000),
  });

  const stdout = String(out.stdout || "").trim();
  const stderr = String(out.stderr || "").trim();
  const combined = `${stdout}\n${stderr}`.trim();

  if (out.status === 0) {
    return { verdict: "clean", infected: false, signature: null, detail: combined };
  }
  if (out.status === 1) {
    // Typical format: "/tmp/file: Win.Test.EICAR_HDB-1 FOUND"
    const m = combined.match(/:\s*(.+?)\s+FOUND/i);
    const sig = m ? m[1] : null;
    return { verdict: "infected", infected: true, signature: sig, detail: combined };
  }
  return { verdict: "unknown", infected: false, signature: null, detail: combined || "clamdscan_error" };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, service: "clamav-scan" });
  }

  if (req.method !== "POST" || req.url !== "/scan") {
    return json(res, 404, { ok: false, error: "NOT_FOUND" });
  }

  if (!requireAuth(req, res)) return;

  const chunks = [];
  let total = 0;
  req.on("data", (chunk) => {
    total += chunk.length;
    if (total > MAX_BYTES) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("error", () => {
    json(res, 400, { ok: false, error: "BAD_REQUEST" });
  });

  req.on("end", () => {
    if (total <= 0 || total > MAX_BYTES) {
      return json(res, 413, { ok: false, error: "FILE_TOO_LARGE_OR_EMPTY" });
    }
    const bytes = Buffer.concat(chunks);
    const sha256 = hashSha256(bytes);
    const tmpPath = path.join(os.tmpdir(), `scan-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);

    try {
      fs.writeFileSync(tmpPath, bytes);
      const result = scanFile(tmpPath);
      return json(res, 200, {
        ok: true,
        verdict: result.verdict,
        infected: result.infected,
        signature: result.signature,
        sha256,
        engine: "clamav",
        detail: result.detail,
      });
    } catch (e) {
      return json(res, 500, {
        ok: false,
        error: "SCAN_FAILED",
        message: String(e && e.message ? e.message : e),
      });
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`clamav scan service listening on :${PORT}`);
});


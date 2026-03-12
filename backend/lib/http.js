const fs = require("fs/promises");
const path = require("path");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

async function serveStatic(urlPath, res, frontendDir) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const target = path.normalize(path.join(frontendDir, cleanPath));
  if (!target.startsWith(frontendDir)) {
    sendFile(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return true;
  }

  try {
    const file = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const mimeByExt = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico": "image/x-icon",
    };
    sendFile(res, 200, file, mimeByExt[ext] || "application/octet-stream");
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

function isStaticRequest(req, url) {
  if (req.method !== "GET") return false;
  if (url.pathname === "/") return true;
  const ext = path.extname(url.pathname).toLowerCase();
  return [".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".ico"].includes(ext);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = {
  sendJson,
  serveStatic,
  isStaticRequest,
  parseBody,
};

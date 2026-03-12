const http = require("http");
const { handler } = require("./router");
const { loadState, STORE_FILE } = require("./lib/state");
const { sendJson } = require("./lib/http");

const PORT = process.env.PORT || 4000;

async function start() {
  await loadState();

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      sendJson(res, 500, { error: err.message || "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    console.log(`BudgetBeacon API listening on http://localhost:${PORT}`);
    console.log(`Data file: ${STORE_FILE}`);
  });
}

module.exports = { start };

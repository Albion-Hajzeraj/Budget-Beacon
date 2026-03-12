const { start } = require("./server");

start().catch((err) => {
  console.error("Failed to start BudgetBeacon API:", err);
  process.exit(1);
});

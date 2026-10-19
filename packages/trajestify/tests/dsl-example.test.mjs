import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("canonical DSL example declares intent, ordered domain path and full trace", async () => {
  const source = await readFile(new URL("../../../examples/buy-product.traj", import.meta.url), "utf8");
  for (const keyword of ["Trajestify:", "Version: 1", "Intent: buy_product", "Trajectory: purchase_product", "Given:", "When:", "Then:", "Invariant:", "Trace: full", "OnDivergence: continue", "Evidence:"]) {
    assert.ok(source.includes(keyword), `missing reserved keyword/value: ${keyword}`);
  }
  assert.ok(source.indexOf("Sales.order.status") < source.indexOf("Financial.transaction.status"));
  assert.ok(source.indexOf("Financial.transaction.status") < source.indexOf("Stock.quantity"));
  assert.ok(source.indexOf("Stock.quantity") < source.indexOf("Delivery.status"));
});

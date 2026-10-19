import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, And, expectValue, runTrajectory } from "../dist/index.js";

test("records a complete successful trajectory", async () => {
  const context = { stock: 10, sale: false, financial: false, delivery: false };
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sale", "Create Sales order", c => { c.sale = true; return c.sale; }),
    And("when", "financial", "Record Financial transaction", c => { c.financial = true; return c.financial; }),
    Then("stock", "Stock is 8", c => { c.stock = 8; return c.stock === 8; }),
    And("then", "delivery", "Delivery is scheduled", c => { c.delivery = true; return c.delivery; }),
  ]);
  const artifact = await runTrajectory(intent, context, { runId: "buy-ok" });
  assert.equal(artifact.intent.status, "passed");
  assert.equal(artifact.steps.length, 5);
  assert.equal(artifact.firstDivergence, null);
  assert.equal(artifact.steps[4].clauseId, "delivery");
});

test("stock divergence is pinpointed and downstream trajectory is retained", async () => {
  const context = { stock: 10, sale: false, financial: false, delivery: false };
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", c => { c.sale = true; return true; }),
    And("when", "financial", "Record transaction", c => { c.financial = true; return true; }),
    Then("stock", "Stock is 8", c => { c.stock = 9; return expectValue(8, c.stock); }),
    And("then", "delivery", "Schedule delivery", c => { c.delivery = true; return true; }),
  ]);
  const artifact = await runTrajectory(intent, context, { runId: "buy-stock-divergence" });
  assert.equal(artifact.intent.status, "diverged");
  assert.equal(artifact.firstDivergence?.sequence, 4);
  assert.match(artifact.firstDivergence?.message ?? "", /Stock is 8/);
  assert.equal(artifact.steps.length, 5);
  assert.equal(artifact.steps[3].status, "diverged");
  assert.equal(artifact.steps[3].expected, 8);
  assert.equal(artifact.steps[3].observed, 9);
  assert.equal(artifact.firstDivergence?.expected, 8);
  assert.equal(artifact.firstDivergence?.observed, 9);
  assert.equal(artifact.steps[4].clauseId, "delivery");
  assert.equal(artifact.summary.diverged, 1);
});

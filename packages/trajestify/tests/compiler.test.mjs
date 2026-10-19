import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseTrajestify } from "../dist/parser.js";
import { bindTrajectory, compileToIR, TrajestifyBindingError } from "../dist/compiler.js";
import { expectValue, runTrajectory } from "../dist/index.js";

test("compiles the .traj document into IR and executes registered step bindings", async () => {
  const source = await readFile("../../examples/buy-product.traj", "utf8");
  const document = parseTrajestify(source, "examples/buy-product.traj");
  const ir = compileToIR(document);
  assert.equal(ir.intentId, "buy_product");
  assert.equal(ir.trajectoryId, "purchase_product");
  assert.deepEqual(ir.clauses.map(step => step.kind), ["given", "given", "when", "then", "then", "then", "then"]);
  assert.equal(ir.invariants.length, 1);

  const context = { stock: 10, delivery: false, sale: false, financial: false };
  const intent = bindTrajectory(ir, {
    "clause-1": () => true,
    "clause-2": () => true,
    "clause-3": () => { context.sale = true; return true; },
    "clause-4": () => true,
    "clause-5": () => { context.financial = true; return true; },
    "clause-6": () => expectValue(8, (context.stock = 9)),
    "clause-7": () => { context.delivery = true; return true; },
    "invariant-1": () => expectValue(8, context.stock),
  });
  const artifact = await runTrajectory(intent, context, { runId: "dsl-integration-stock-divergence" });
  assert.equal(artifact.intent.status, "diverged");
  assert.equal(artifact.firstDivergence?.sequence, 6);
  assert.equal(artifact.firstDivergence?.expected, 8);
  assert.equal(artifact.firstDivergence?.observed, 9);
  assert.equal(artifact.steps.length, 8);
  assert.equal(artifact.steps[6]?.clauseId, "clause-7");
  assert.equal(context.delivery, true);
});

test("fails closed when a DSL step has no registered adapter binding", async () => {
  const source = await readFile("../../examples/buy-product.traj", "utf8");
  const ir = compileToIR(parseTrajestify(source));
  assert.throws(() => bindTrajectory(ir, {}), TrajestifyBindingError);
});

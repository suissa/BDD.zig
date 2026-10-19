import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseTrajestify, TrajestifyParseError } from "../dist/index.js";

test("parses canonical DSL and normalizes And to prior clause kind", async () => {
  const source = await readFile(new URL("../../../examples/buy-product.traj", import.meta.url), "utf8");
  const doc = parseTrajestify(source, "buy-product.traj");
  assert.equal(doc.intent.id, "buy_product");
  assert.equal(doc.trajectory.id, "purchase_product");
  assert.equal(doc.clauses.length, 7);
  assert.equal(doc.clauses[1].kind, "given");
  assert.equal(doc.clauses[0].id, "customer-active");
  assert.equal(doc.clauses[2].id, "purchase-requested");
  assert.equal(doc.clauses[3].kind, "then");
  assert.equal(doc.trace, "full");
  assert.equal(doc.onDivergence, "continue");
  assert.deepEqual(doc.evidence, ["inputs", "outputs", "state", "errors", "causal_links"]);
});

test("rejects unknown reserved keywords with source position", () => {
  assert.throws(() => parseTrajestify("Trajestify: Bad\nBogus: value"), error =>
    error instanceof TrajestifyParseError && /<input>:2:1: Unknown reserved keyword/.test(error.message));
});

test("rejects duplicate explicit step IDs", () => {
  const source = "Trajestify: X\\nVersion: 1\\nIntent: x\\nTrajectory: t\\nGiven [same]: active\\nWhen [same]: act\\nThen: done";
  assert.throws(() => parseTrajestify(source), /Duplicate clause id: same/);
});

test("rejects unsupported grammar versions", () => {
  assert.throws(() => parseTrajestify("Trajestify: X\nVersion: 2"), /Only Version: 1 is supported/);
});

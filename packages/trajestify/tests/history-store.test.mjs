import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineIntent, Given, When, Then, expectValue, runTrajectory, JsonlTrajectoryHistoryStore } from "../dist/index.js";

async function fixture(runId, stock = 8) {
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    Then("stock", "Stock is 8", () => expectValue(8, stock)),
  ]);
  return runTrajectory(intent, {}, { runId });
}

async function withStore(callback) {
  const dir = await mkdtemp(join(tmpdir(), "trajestify-history-"));
  try {
    await callback(new JsonlTrajectoryHistoryStore(join(dir, "history", "runs.jsonl")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("persists and filters historical trajectory artifacts", async () => {
  await withStore(async store => {
    const older = await fixture("history-older", 9);
    older.startedAt = "2026-10-17T10:00:00.000Z";
    older.finishedAt = "2026-10-17T10:00:01.000Z";
    const newer = await fixture("history-newer", 9);
    newer.startedAt = "2026-10-19T10:00:00.000Z";
    newer.finishedAt = "2026-10-19T10:00:01.000Z";
    const unrelated = structuredClone(older);
    unrelated.runId = "history-other";
    unrelated.trajectory.id = "other-trajectory";
    await store.append(older);
    await store.append(newer);
    await store.append(unrelated);

    const selected = await store.list({ trajectoryId: "buy_product", before: "2026-10-19T12:00:00.000Z" });
    assert.deepEqual(selected.map(item => item.runId), ["history-older", "history-newer"]);
    assert.deepEqual((await store.list({ trajectoryId: "buy_product", limit: 1 })).map(item => item.runId), ["history-newer"]);
    assert.equal((await store.list()).length, 3);
  });
});

test("rejects duplicate run IDs and malformed history records", async () => {
  await withStore(async store => {
    const artifact = await fixture("history-duplicate");
    await store.append(artifact);
    await assert.rejects(() => store.append(artifact), /already contains runId/);
    const contents = await readFile(store.filePath, "utf8");
    await writeFile(store.filePath, contents + "{not-json}\n", "utf8");
    await assert.rejects(() => store.list(), /Invalid trajectory history JSON at line 2/);
  });
});

test("returns an empty history when the file does not exist", async () => {
  await withStore(async store => {
    assert.deepEqual(await store.list(), []);
  });
});

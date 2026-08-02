import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ApprovalStore } from "../lib/approval-store.js";

test("creates and reviews an approval", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aira-"));
  try {
    const store = new ApprovalStore(path.join(dir, "approvals.json"));
    const created = await store.create({ type: "quotation", summary: "Quote request" });
    assert.equal(created.status, "pending");
    const reviewed = await store.update(created.id, "approved", "Verified");
    assert.equal(reviewed.status, "approved");
    assert.equal((await store.read())[0].reviewerNote, "Verified");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

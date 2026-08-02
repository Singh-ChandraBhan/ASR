import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { QuotationStore } from "../lib/quotation-store.js";

test("creates, approves, and records delivery for a quotation request", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aira-quotes-"));
  try {
    const store = new QuotationStore(path.join(dir, "requests.json"));
    const created = await store.create({
      customer: { name: "Test Buyer", email: "buyer@example.com" },
      intent: "buy",
      requirement: { product: "Safety helmets", quantity: "100" }
    });
    assert.equal(created.status, "pending");
    assert.equal(created.stage, "submitted");
    assert.match(created.id, /^REQ-/);

    const sourcing = await store.update(created.id, { stage: "sourcing" });
    assert.equal(sourcing.stage, "sourcing");

    const approved = await store.update(created.id, {
      status: "approved",
      stage: "confirmed",
      quotation: { amount: "25000", currency: "INR", details: "Delivered in 10 days" }
    });
    assert.equal(approved.status, "approved");
    assert.deepEqual(approved.stageHistory.map((entry) => entry.stage), ["submitted", "sourcing", "confirmed"]);

    const delivered = await store.setNotification(created.id, "customer", "sent");
    assert.equal(delivered.notification.customer, "sent");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

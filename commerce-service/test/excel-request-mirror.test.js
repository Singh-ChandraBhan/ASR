import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { ExcelRequestMirror } from "../lib/excel-request-mirror.js";

test("writes customer requests to a readable Excel register", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aira-excel-"));
  const filePath = path.join(dir, "customer-requests.xlsx");
  try {
    const mirror = new ExcelRequestMirror(filePath);
    await mirror.sync([{
      id: "REQ-12345678", createdAt: "2026-07-31T10:00:00.000Z", updatedAt: "2026-07-31T11:00:00.000Z",
      status: "approved", stage: "confirmed", intent: "buy",
      customer: { name: "Test Buyer", email: "buyer@example.com", company: "Example Ltd" },
      requirement: { product: "Safety helmets", quantity: "100", location: "Noida" },
      quotation: { currency: "INR", amount: "25000", details: "Delivery in 10 days" },
      notification: { admin: "sent", customer: "sent", error: "" }
    }]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet("Customer Requests");
    assert.equal(sheet.getCell("A2").value, "REQ-12345678");
    assert.equal(sheet.getCell("F2").value, "Test Buyer");
    assert.equal(sheet.getCell("K2").value, "Safety helmets");
    assert.equal(sheet.getCell("S2").value, 25000);
    assert.ok(sheet.autoFilter);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

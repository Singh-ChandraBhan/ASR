import ExcelJS from "exceljs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const columns = [
  ["Request ID", "id", 16], ["Submitted At", "createdAt", 22], ["Updated At", "updatedAt", 22],
  ["Status", "status", 14], ["Workflow Stage", "stage", 16], ["Customer Name", "customerName", 22],
  ["Email", "email", 30], ["Phone", "phone", 18], ["Company", "company", 24], ["Intent", "intent", 12],
  ["Product", "product", 26], ["Specification", "specification", 34], ["Quantity", "quantity", 16],
  ["Budget", "budget", 18], ["Delivery Location", "location", 24], ["Required Date", "requiredDate", 16],
  ["Requirement Details", "requirementDetails", 42], ["Quotation Currency", "quoteCurrency", 14],
  ["Quotation Amount", "quoteAmount", 18], ["Quotation Valid Until", "quoteValidUntil", 18],
  ["Quotation Details", "quoteDetails", 42], ["Reviewer Note", "reviewerNote", 32],
  ["Admin Notification", "adminNotification", 20], ["Customer Email", "customerNotification", 18],
  ["Email Error", "emailError", 36]
];

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date : null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : String(value);
}

export class ExcelRequestMirror {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
    this.lastError = "";
  }

  sync(items) {
    const operation = this.queue.then(() => this.write(items));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async write(items) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ASR AI Commerce";
    workbook.modified = new Date();
    const sheet = workbook.addWorksheet("Customer Requests", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = columns.map(([header, key, width]) => ({ header, key, width }));
    sheet.autoFilter = { from: "A1", to: "Y1" };
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A6B50" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    for (const item of items) {
      const requirement = item.requirement || {};
      const quotation = item.quotation || {};
      const row = sheet.addRow({
        id: item.id, createdAt: asDate(item.createdAt), updatedAt: asDate(item.updatedAt || item.reviewedAt),
        status: item.status, stage: item.stage || (item.status === "approved" ? "confirmed" : "submitted"),
        customerName: item.customer?.name, email: item.customer?.email, phone: item.customer?.phone,
        company: item.customer?.company, intent: item.intent, product: requirement.product,
        specification: requirement.specification, quantity: requirement.quantity, budget: requirement.budget,
        location: requirement.location, requiredDate: requirement.date, requirementDetails: requirement.details,
        quoteCurrency: quotation.currency, quoteAmount: asNumber(quotation.amount), quoteValidUntil: quotation.validUntil,
        quoteDetails: quotation.details, reviewerNote: item.reviewerNote,
        adminNotification: item.notification?.admin, customerNotification: item.notification?.customer,
        emailError: item.notification?.error
      });
      row.alignment = { vertical: "top", wrapText: true };
    }
    sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm";
    sheet.getColumn("updatedAt").numFmt = "yyyy-mm-dd hh:mm";
    sheet.getColumn("quoteAmount").numFmt = "#,##0.00";
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.height = 34;
      if (rowNumber > 1 && rowNumber % 2 === 1) {
        row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F7F5" } }; });
      }
    });

    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp.xlsx`;
    await workbook.xlsx.writeFile(tempPath);
    try {
      await rm(this.filePath, { force: true });
      await rename(tempPath, this.filePath);
      this.lastError = "";
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      this.lastError = error.message;
      throw error;
    }
    return this.filePath;
  }
}

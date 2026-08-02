import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { ApprovalStore } from "./lib/approval-store.js";
import { QuotationStore } from "./lib/quotation-store.js";
import { notifyAdminOfRequest, sendQuotation } from "./lib/mailer.js";
import { ExcelRequestMirror } from "./lib/excel-request-mirror.js";
import { AIRA_INSTRUCTIONS, buildInput } from "./lib/prompt.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const store = new ApprovalStore(path.join(root, "data", "approvals.json"));
const quotationStore = new QuotationStore(path.join(root, "data", "quotation-requests.json"));
const excelMirror = new ExcelRequestMirror(path.join(root, "data", "customer-requests.xlsx"));
const asrRoot = path.join(root, "asr-integration");
const asrApiUrl = (process.env.ASR_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const ChatResult = z.object({
  reply: z.string(),
  intent: z.enum(["buy", "sell", "quote", "general", "unknown"]),
  requiresApproval: z.boolean(),
  approvalType: z.enum(["quotation", "negotiation", "payment", "contract", "availability", "delivery", "none"]),
  approvalSummary: z.string(),
  leadPriority: z.enum(["High", "Medium", "Low", "Unknown"])
});

const RequirementRequest = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(6).max(40),
    company: z.string().trim().min(2).max(160)
  }),
  intent: z.enum(["buy", "sell"]),
  requirement: z.object({
    product: z.string().trim().min(2).max(200),
    specification: z.string().trim().min(2).max(1000),
    quantity: z.string().trim().min(1).max(120),
    budget: z.string().trim().min(1).max(120),
    location: z.string().trim().min(2).max(240),
    date: z.string().trim().min(1).max(40),
    details: z.string().trim().min(2).max(4000)
  })
});

const RequirementReview = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("approved"),
    reviewerNote: z.string().trim().max(2000).optional().default(""),
    quotation: z.object({
      amount: z.string().trim().min(1).max(80),
      currency: z.string().trim().min(1).max(12),
      validUntil: z.string().trim().max(40).optional().default(""),
      details: z.string().trim().min(1).max(8000)
    })
  }),
  z.object({
    status: z.literal("rejected"),
    reviewerNote: z.string().trim().min(1).max(2000)
  })
]);

const RequirementTracking = z.object({
  id: z.string().trim().regex(/^REQ-[A-Z0-9]{8}$/),
  email: z.string().trim().email().max(200)
});

const RequirementStage = z.object({ stage: z.enum(["sourcing", "delivery", "completed"]) });
const stageTransitions = { submitted: "sourcing", confirmed: "delivery", delivery: "completed" };

async function syncQuotationWorkbook() {
  try {
    await excelMirror.sync(await quotationStore.read());
    return { status: "saved", error: "" };
  } catch (error) {
    console.error("Could not update customer-requests.xlsx:", error.message);
    return { status: "failed", error: error.message };
  }
}

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(root, "public")));
app.use("/asr/assets", express.static(path.join(asrRoot, "assets")));

app.get(["/asr", "/asr/"], (_req, res) => res.sendFile(path.join(asrRoot, "index.html")));
app.get("/asr/admin", (_req, res) => res.sendFile(path.join(asrRoot, "admin.html")));

async function proxyAsr(req, res, targetPath) {
  try {
    const headers = { accept: req.get("accept") || "application/json" };
    if (req.get("authorization")) headers.authorization = req.get("authorization");
    const options = { method: req.method, headers, signal: AbortSignal.timeout(8000) };
    if (!["GET", "HEAD"].includes(req.method)) {
      headers["content-type"] = "application/json";
      options.body = JSON.stringify(req.body ?? {});
    }
    const response = await fetch(`${asrApiUrl}${targetPath}`, options);
    const body = Buffer.from(await response.arrayBuffer());
    res.status(response.status);
    res.type(response.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (error) {
    console.error("ASR integration is unavailable:", error.message);
    res.status(502).json({ error: "ASR integration is unavailable. Start the ASR backend and try again." });
  }
}

app.get("/asr-api/health", (req, res) => proxyAsr(req, res, "/health"));
app.post("/asr-api/api/chat", (req, res) => proxyAsr(req, res, "/api/chat"));
app.post("/asr-api/api/customers", (req, res) => proxyAsr(req, res, "/api/customers"));
app.get("/asr-api/api/approvals", (req, res) => proxyAsr(req, res, "/api/approvals"));
app.patch("/asr-api/api/approvals/:id", (req, res) => proxyAsr(req, res, `/api/approvals/${encodeURIComponent(req.params.id)}`));

function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || supplied !== configured) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true, model, approval: "manual", excelMirror: excelMirror.lastError ? "error" : "ready" }));

// Buyer quotation orchestration: validate -> save -> notify -> mirror -> respond.
async function createRequirement(req, res) {
  // Step 1: Reject malformed customer or requirement fields.
  const body = RequirementRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter valid customer and requirement details." });

  // Step 2: Persist first so a request reference exists even if email fails.
  const request = await quotationStore.create(body.data);

  // Step 3: Notify asynchronously; notification failure must not lose the lead.
  notifyAdminOfRequest(request)
    .then((result) => quotationStore.setNotification(request.id, "admin", result.status, result.error))
    .then(() => syncQuotationWorkbook())
    .catch(async (error) => {
      await quotationStore.setNotification(request.id, "admin", "failed", error.message);
      await syncQuotationWorkbook();
    });
  // Step 4: Mirror the saved request for the operations team.
  const excel = await syncQuotationWorkbook();

  // Step 5: Return the durable reference to the customer.
  res.status(201).json({ id: request.id, status: request.status, excel, message: "Your request is awaiting ASR approval." });
}

app.post("/api/requirements", createRequirement);

app.get("/api/requirements", requireAdmin, async (_req, res) => res.json(await quotationStore.read()));

// Public tracking orchestration: validate identity -> find request -> expose safe fields.
async function trackRequirement(req, res) {
  const body = RequirementTracking.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter a valid reference and email." });
  const request = (await quotationStore.read()).find((item) => item.id === body.data.id && item.customer.email.toLowerCase() === body.data.email.toLowerCase());
  if (!request) return res.status(404).json({ error: "No request matches that reference and email." });
  res.json({
    id: request.id,
    status: request.status,
    stage: request.stage || (request.status === "approved" ? "confirmed" : "submitted"),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt || request.reviewedAt || request.createdAt,
    stageHistory: request.stageHistory || [{ stage: "submitted", at: request.createdAt }],
    product: request.requirement.product,
    quotation: request.status === "approved" ? request.quotation : null
  });
}

app.post("/api/requirements/track", trackRequirement);

// Admin workflow orchestration: validate -> enforce next stage -> save -> mirror.
async function advanceRequirementStage(req, res) {
  const body = RequirementStage.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid workflow stage." });
  const current = (await quotationStore.read()).find((item) => item.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Request not found." });
  const currentStage = current.stage || (current.status === "approved" ? "confirmed" : "submitted");
  if (stageTransitions[currentStage] !== body.data.stage) return res.status(409).json({ error: `Request must advance from ${currentStage} to ${stageTransitions[currentStage] || "no further stage"}.` });
  if (["delivery", "completed"].includes(body.data.stage) && current.status !== "approved") return res.status(409).json({ error: "Approve the quotation before delivery." });
  const updated = await quotationStore.update(current.id, { stage: body.data.stage });
  const excel = await syncQuotationWorkbook();
  res.json({ ...updated, excel });
}

app.patch("/api/requirements/:id/stage", requireAdmin, advanceRequirementStage);

// Admin review orchestration: validate -> approve/reject -> notify -> mirror.
async function reviewRequirement(req, res) {
  const body = RequirementReview.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter valid review and quotation details." });
  const current = (await quotationStore.read()).find((item) => item.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Request not found." });
  const currentStage = current.stage || (current.status === "approved" ? "confirmed" : "submitted");
  if (body.data.status === "approved" && currentStage !== "sourcing") return res.status(409).json({ error: "Move the request to sourcing before approving its quotation." });
  const changes = body.data.status === "approved"
    ? { status: "approved", stage: "confirmed", reviewerNote: body.data.reviewerNote, quotation: { ...body.data.quotation, approvedAt: new Date().toISOString() } }
    : { status: "rejected", reviewerNote: body.data.reviewerNote };
  let request = await quotationStore.update(req.params.id, changes);
  if (body.data.status === "approved") {
    const delivery = await sendQuotation(request);
    request = await quotationStore.setNotification(request.id, "customer", delivery.status, delivery.error);
  }
  const excel = await syncQuotationWorkbook();
  res.json({ ...request, excel });
}

app.patch("/api/requirements/:id", requireAdmin, reviewRequirement);

// AI chat orchestration: validate -> load context -> call model -> gate approvals.
async function processChat(req, res) {
  try {
    // Step 1: Fail clearly before attempting an external model call.
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured." });

    // Step 2: Validate the conversation and load only verified catalog data.
    const messages = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(50).parse(req.body.messages);
    const catalog = JSON.parse(await readFile(path.join(root, "data", "catalog.json"), "utf8"));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Step 3: Request schema-validated output from the model.
    const response = await client.responses.parse({
      model,
      instructions: AIRA_INSTRUCTIONS,
      input: buildInput({ messages, catalog }),
      reasoning: { effort: "medium" },
      text: { format: zodTextFormat(ChatResult, "aira_response"), verbosity: "low" },
      safety_identifier: `session_${String(req.body.sessionId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)}`
    });
    const result = response.output_parsed;
    if (!result) throw new Error("The model returned no structured response.");

    // Step 4: Commercial commitments always stop at manual approval.
    if (result.requiresApproval) {
      const approval = await store.create({
        sessionId: String(req.body.sessionId || "anonymous").slice(0, 100),
        type: result.approvalType,
        summary: result.approvalSummary,
        intent: result.intent,
        leadPriority: result.leadPriority,
        conversation: messages.slice(-10)
      });
      return res.json({
        reply: `${result.reply}\n\nThis request has been sent to the ASR team for manual review. Reference: ${approval.id}`,
        approval: { id: approval.id, status: approval.status }
      });
    }
    res.json({ reply: result.reply, approval: null });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid conversation payload." });
    console.error(error);
    res.status(500).json({ error: "Aira could not process the request. Please try again." });
  }
}

app.post("/api/chat", processChat);

app.get("/api/approvals", requireAdmin, async (_req, res) => res.json(await store.read()));
app.patch("/api/approvals/:id", requireAdmin, async (req, res) => {
  const body = z.object({ status: z.enum(["approved", "rejected"]), reviewerNote: z.string().max(2000).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid review." });
  const item = await store.update(req.params.id, body.data.status, body.data.reviewerNote);
  if (!item) return res.status(404).json({ error: "Approval not found." });
  res.json(item);
});

syncQuotationWorkbook().finally(() => {
  app.listen(port, () => console.log(`Aira is running at http://localhost:${port}`));
});

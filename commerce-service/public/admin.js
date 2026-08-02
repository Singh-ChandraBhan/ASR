const login = document.querySelector("#login");
const requestsPanel = document.querySelector("#requests-panel");
const approvalsPanel = document.querySelector("#approvals-panel");
const tabs = document.querySelector("#admin-tabs");
const errorEl = document.querySelector("#admin-error");
let token = "";

function authorizedFetch(url, options = {}) {
  return fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
}

function field(label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value || "-"));
  return row;
}

async function apiAction(url, body) {
  const response = await authorizedFetch(url, { method: "PATCH", body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not update request.");
  await loadRequests();
}

function actionButton(label, action, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", async () => {
    errorEl.textContent = "";
    button.disabled = true;
    try { await action(); }
    catch (error) { errorEl.textContent = error.message; button.disabled = false; }
  });
  return button;
}

function renderRequest(item) {
  const stage = item.stage || (item.status === "approved" ? "confirmed" : "submitted");
  const card = document.createElement("article");
  card.className = "approval request-card";
  const title = document.createElement("h2");
  title.textContent = `${item.requirement.product || "Product request"} · ${stage}`;
  card.append(
    title,
    field("Customer", `${item.customer.name} (${item.customer.email})`),
    field("Company", item.customer.company),
    field("Phone", item.customer.phone),
    field("Quantity", item.requirement.quantity),
    field("Specification", item.requirement.specification),
    field("Budget", item.requirement.budget),
    field("Delivery", `${item.requirement.location || "-"} · ${item.requirement.date || "Date not specified"}`),
    field("Details", item.requirement.details),
    field("Reference", item.id),
    field("Workflow", `${stage} (${item.status})`)
  );
  const notice = document.createElement("small");
  notice.textContent = `Submitted ${new Date(item.createdAt).toLocaleString()} · Admin notification: ${item.notification?.admin || "pending"} · Customer quotation: ${item.notification?.customer || "not sent"}`;
  card.append(notice);
  if (item.notification?.error) card.append(field("Email status", item.notification.error));

  if (item.status === "pending" && stage === "submitted") {
    const rejectionNote = Object.assign(document.createElement("textarea"), { placeholder: "Reason if rejecting this request" });
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      actionButton("Start sourcing", () => apiAction(`/api/requirements/${item.id}/stage`, { stage: "sourcing" })),
      actionButton("Reject", () => apiAction(`/api/requirements/${item.id}`, { status: "rejected", reviewerNote: rejectionNote.value.trim() }), "rejected")
    );
    card.append(rejectionNote, actions);
  } else if (item.status === "pending" && stage === "sourcing") {
    const amount = Object.assign(document.createElement("input"), { placeholder: "Quotation amount", required: true });
    const currency = Object.assign(document.createElement("input"), { placeholder: "Currency", value: "INR", required: true });
    const validUntil = Object.assign(document.createElement("input"), { type: "date" });
    const details = Object.assign(document.createElement("textarea"), { placeholder: "Quotation details, taxes, delivery terms and conditions", required: true });
    const note = Object.assign(document.createElement("textarea"), { placeholder: "Internal reviewer note or rejection reason" });
    const quoteFields = document.createElement("div");
    quoteFields.className = "quote-fields";
    quoteFields.append(amount, currency, validUntil, details, note);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      actionButton("Approve and send quotation", () => apiAction(`/api/requirements/${item.id}`, { status: "approved", reviewerNote: note.value.trim(), quotation: { amount: amount.value.trim(), currency: currency.value.trim(), validUntil: validUntil.value, details: details.value.trim() } }), "approved"),
      actionButton("Reject", () => apiAction(`/api/requirements/${item.id}`, { status: "rejected", reviewerNote: note.value.trim() }), "rejected")
    );
    card.append(quoteFields, actions);
  } else if (item.status === "approved") {
    card.append(field("Reviewer note", item.reviewerNote));
    if (item.quotation) card.append(field("Quotation", `${item.quotation.currency} ${item.quotation.amount} · ${item.quotation.details}`));
    if (stage === "confirmed") card.append(actionButton("Start delivery", () => apiAction(`/api/requirements/${item.id}/stage`, { stage: "delivery" })));
    if (stage === "delivery") card.append(actionButton("Mark completed", () => apiAction(`/api/requirements/${item.id}/stage`, { stage: "completed" })));
  } else {
    card.append(field("Rejection reason", item.reviewerNote));
  }
  return card;
}

async function loadRequests() {
  const response = await authorizedFetch("/api/requirements");
  if (!response.ok) throw new Error("Could not load customer requests. Check the admin token.");
  const items = await response.json();
  requestsPanel.replaceChildren(...items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(renderRequest));
  if (!items.length) requestsPanel.textContent = "No customer requests yet.";
}

async function loadApprovals() {
  const response = await authorizedFetch("/api/approvals");
  if (!response.ok) throw new Error("Could not load AI approvals.");
  const items = await response.json();
  approvalsPanel.replaceChildren();
  for (const item of items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const card = document.createElement("article");
    card.className = "approval";
    const title = document.createElement("h2");
    title.textContent = `${item.type} · ${item.status}`;
    card.append(title, field("Summary", item.summary), field("Reference", item.id));
    approvalsPanel.append(card);
  }
  if (!items.length) approvalsPanel.textContent = "No AI approvals yet.";
}

document.querySelectorAll("[data-admin-panel]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-admin-panel]").forEach((item) => item.classList.toggle("active", item === button));
  requestsPanel.hidden = button.dataset.adminPanel !== "requests-panel";
  approvalsPanel.hidden = button.dataset.adminPanel !== "approvals-panel";
}));

login.addEventListener("submit", async (event) => {
  event.preventDefault();
  token = document.querySelector("#token").value;
  try {
    errorEl.textContent = "";
    await Promise.all([loadRequests(), loadApprovals()]);
    tabs.hidden = false;
  } catch (error) { errorEl.textContent = error.message; }
});

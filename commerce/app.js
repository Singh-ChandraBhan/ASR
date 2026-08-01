const form = document.querySelector("#chat-form");
const input = document.querySelector("#input");
const messagesEl = document.querySelector("#messages");
const sessionId = crypto.randomUUID();
const messages = [];

document.querySelectorAll(".intent").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".intent").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".intake-panel, .chat-panel, .tracking-panel").forEach((panel) => { panel.hidden = panel.id !== button.dataset.panel; });
  });
});

function addMessage(content, kind) {
  const article = document.createElement("article");
  article.className = `message ${kind}`;
  article.textContent = content;
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return article;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  addMessage(content, "user");
  messages.push({ role: "user", content });
  const waiting = addMessage("Aira is reviewing your requirement…", "bot muted");
  form.querySelector("button").disabled = true;
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, messages }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    waiting.remove();
    addMessage(data.reply, "bot");
    messages.push({ role: "assistant", content: data.reply });
  } catch (error) {
    waiting.textContent = error.message;
    waiting.classList.add("error");
  } finally { form.querySelector("button").disabled = false; input.focus(); }
});

document.querySelectorAll(".intake-form").forEach((intakeForm) => {
  intakeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(intakeForm));
    const labels = intakeForm.dataset.intent === "buy"
      ? { product: "Product", specification: "Specification", quantity: "Quantity", budget: "Budget", location: "Delivery location", date: "Required date", details: "Additional details" }
      : { product: "Product", brand: "Brand", specification: "Specification", quantity: "Available quantity", moq: "Minimum order quantity", price: "Price range", location: "Service locations", delivery: "Delivery capability", details: "Additional details" };
    const heading = intakeForm.dataset.intent === "buy" ? "I want to buy. Here is my buyer requirement:" : "I want to sell. Here is my product offer:";
    const content = [heading, ...Object.entries(labels).filter(([key]) => values[key]?.trim()).map(([key, label]) => `${label}: ${values[key].trim()}`)].join("\n");
    if (intakeForm.dataset.intent === "buy") {
      const submitButton = intakeForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        const response = await fetch("/api/requirements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: { name: values.customerName, email: values.customerEmail, company: values.customerCompany, phone: values.customerPhone },
            intent: "buy",
            requirement: Object.fromEntries(Object.keys(labels).filter((key) => values[key]?.trim()).map((key) => [key, values[key].trim()]))
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not submit requirement");
        document.querySelector('[data-panel="chat-panel"]').click();
        addMessage(content, "user");
        addMessage(`Your requirement has been sent to the ASR admin for review. Reference: ${result.id}. You will receive the quotation at ${values.customerEmail} after approval.`, "bot");
        intakeForm.reset();
      } catch (error) {
        document.querySelector('[data-panel="chat-panel"]').click();
        addMessage(error.message, "bot error");
      } finally {
        submitButton.disabled = false;
      }
      return;
    }
    document.querySelector('[data-panel="chat-panel"]').click();
    input.value = content;
    form.requestSubmit();
    intakeForm.reset();
  });
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});

const requestedIntent = new URLSearchParams(window.location.search).get("intent");
const requestedPanel = { buy: "buyer-panel", sell: "seller-panel", chat: "chat-panel", track: "tracking-panel" }[requestedIntent];
if (requestedPanel) {
  document.querySelector(`[data-panel="${requestedPanel}"]`)?.click();
  document.querySelector(`#${requestedPanel} input, #${requestedPanel} textarea`)?.focus();
}

const trackingForm = document.querySelector("#tracking-form");
const trackingResult = document.querySelector("#tracking-result");
const workflowStages = ["submitted", "sourcing", "confirmed", "delivery", "completed"];

trackingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  trackingResult.textContent = "Checking request...";
  try {
    const response = await fetch("/api/requirements/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: document.querySelector("#tracking-id").value.trim().toUpperCase(), email: document.querySelector("#tracking-email").value.trim() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not track request");
    const currentIndex = workflowStages.indexOf(result.stage);
    const timeline = document.createElement("ol");
    timeline.className = "status-timeline";
    workflowStages.forEach((stage, index) => {
      const item = document.createElement("li");
      item.className = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
      item.textContent = stage[0].toUpperCase() + stage.slice(1);
      timeline.append(item);
    });
    const heading = document.createElement("h3");
    heading.textContent = `${result.id} · ${result.product}`;
    const status = document.createElement("p");
    status.textContent = result.status === "rejected" ? "This request was not approved." : `Current stage: ${result.stage}`;
    trackingResult.replaceChildren(heading, status, timeline);
    if (result.quotation) {
      const quote = document.createElement("p");
      quote.textContent = `Approved quotation: ${result.quotation.currency} ${result.quotation.amount}. ${result.quotation.details}`;
      trackingResult.append(quote);
    }
  } catch (error) {
    trackingResult.textContent = error.message;
    trackingResult.className = "error";
  }
});

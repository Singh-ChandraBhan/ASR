import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user, pass }
  });
}

export async function notifyAdminOfRequest(request) {
  const transport = getTransport();
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!transport || !to) return { status: "not_configured", error: "SMTP or admin email is not configured." };
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USERNAME,
      to,
      subject: `New quotation request ${request.id}`,
      text: `Customer: ${request.customer.name}\nEmail: ${request.customer.email}\nCompany: ${request.customer.company || "-"}\nProduct: ${request.requirement.product}\nQuantity: ${request.requirement.quantity}\nReference: ${request.id}`
    });
    return { status: "sent", error: "" };
  } catch (error) {
    return { status: "failed", error: error.message };
  }
}

export async function sendQuotation(request) {
  const transport = getTransport();
  if (!transport) return { status: "not_configured", error: "SMTP is not configured." };
  const quote = request.quotation;
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USERNAME,
      to: request.customer.email,
      subject: `ASR quotation ${request.id}`,
      text: `Hello ${request.customer.name},\n\nYour quotation for ${request.requirement.product} has been approved.\n\nAmount: ${quote.currency} ${quote.amount}\nValid until: ${quote.validUntil || "As specified below"}\nDetails: ${quote.details}\n\nReference: ${request.id}\n\nASR Global Solutions`
    });
    return { status: "sent", error: "" };
  } catch (error) {
    return { status: "failed", error: error.message };
  }
}

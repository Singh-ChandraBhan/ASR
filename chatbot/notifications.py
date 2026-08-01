import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def notify_new_customer(customer_id: str, customer: dict) -> dict[str, str]:
    """Email the ASR team after a lead is safely stored.

    REMARK: Notifications are deliberately best-effort. A temporary SMTP issue
    must never undo or reject an enquiry that has already been saved.
    """
    if os.getenv("NOTIFICATIONS_ENABLED", "false").lower() != "true":
        return {"status": "not_configured", "error": "Email notifications are disabled."}

    host = os.getenv("SMTP_HOST", "")
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    recipient = os.getenv("NOTIFY_TO_EMAIL", "")
    sender = os.getenv("NOTIFY_FROM_EMAIL", username)
    if not all([host, username, password, recipient, sender]):
        logger.warning("Email notification skipped: SMTP configuration is incomplete.")
        return {"status": "not_configured", "error": "SMTP configuration is incomplete."}

    message = EmailMessage()
    message["Subject"] = f"New ASR enquiry: {customer_id}"
    message["From"] = sender
    message["To"] = recipient
    # Replying to the notification opens a response to the customer.
    message["Reply-To"] = customer["email"]
    message.set_content(
        f"""A new customer enquiry has been saved.

Customer ID: {customer_id}
Name: {customer['name']}
Company: {customer.get('company') or '-'}
Email: {customer['email']}
Phone: {customer.get('phone') or '-'}
Source: {customer.get('source', 'Website')}

Requirement:
{customer['requirement']}
"""
    )

    try:
        port = int(os.getenv("SMTP_PORT", "587"))
        use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_class(host, port, timeout=15) as server:
            if not use_ssl:
                server.starttls()
            server.login(username, password)
            server.send_message(message)
        return {"status": "sent", "error": ""}
    except Exception as exc:
        logger.exception("Customer %s was stored, but its email notification failed.", customer_id)
        return {"status": "failed", "error": str(exc)}

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field

from customer_store import get_customer_repository
from notifications import notify_new_customer

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


# ---------------------------------------------------------------------------
# API contracts: browser input and model output are validated at the boundary.
# ---------------------------------------------------------------------------
class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[Message] = Field(default_factory=list, max_length=16)
    session_id: str = Field(default="anonymous", max_length=100)


class ChatResponse(BaseModel):
    answer: str
    approval_id: str | None = None
    approval_status: str | None = None


class AiraDecision(BaseModel):
    reply: str
    intent: str = Field(pattern="^(buy|sell|quote|general|unknown)$")
    requires_approval: bool
    approval_type: str = Field(pattern="^(quotation|negotiation|payment|contract|availability|delivery|none)$")
    approval_summary: str
    lead_priority: str = Field(pattern="^(High|Medium|Low|Unknown)$")


class CustomerRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    company: str = Field(default="", max_length=150)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    phone: str = Field(default="", max_length=30)
    requirement: str = Field(min_length=5, max_length=3000)
    source: str = Field(default="Website", max_length=50)


class ApprovalReview(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")
    reviewer_note: str = Field(default="", max_length=2000)


app = FastAPI(title="Aira — ASR Commerce Engagement API", version="2.0.0")
origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["POST", "GET", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

APPROVAL_FILE = BASE_DIR / "data" / "approvals.json"
approval_lock = Lock()

AIRA_INSTRUCTIONS = """You are Aira, the AI Commerce Engagement Assistant for ASR Global Solutions.

Identify whether the visitor wants to buy, sell, request a quote, or ask a general question. Ask only one or two relevant questions at a time.

For buyers, collect product name, specifications, quantity, budget, delivery location, and required date. For sellers, collect product details, brand, specifications, available quantity, minimum order quantity, price range, service locations, and delivery capability. Help sellers improve their offer with a concise professional description.

Use only VERIFIED ASR BUSINESS DATA supplied below for products, suppliers, prices, stock, and opportunities. Recommend no more than three matches and explain each match. If there is no verified match, say so. Never invent a price, stock level, supplier, delivery promise, or transaction guarantee. Clearly label unverified information. Construction services are coming soon and unavailable.

Do not request passwords, payment-card details, government IDs, or confidential business secrets. Quotations, negotiations, payments, contracts, discounts, binding availability, and delivery commitments require manual ASR approval. If one is requested, set requires_approval=true and do not provide the restricted commercial content in reply.

When sufficient information is collected, include: Intent, Product, Specification, Quantity, Budget or Price Range, Location, Required Date, Recommended Action, Missing Information, and Lead Priority. End with exactly one applicable action: “Request a quotation”, “Submit your product offer”, or “Speak with the ASR team”. Be professional, friendly, and concise."""


# ---------------------------------------------------------------------------
# Configuration and persistence helpers.
# ---------------------------------------------------------------------------
def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def read_knowledge() -> str:
    path = BASE_DIR / "knowledge.md"
    return path.read_text(encoding="utf-8") if path.exists() else "No verified business data is configured."


def read_approvals() -> list[dict]:
    if not APPROVAL_FILE.exists():
        return []
    return json.loads(APPROVAL_FILE.read_text(encoding="utf-8"))


def write_approvals(items: list[dict]) -> None:
    APPROVAL_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = APPROVAL_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(items, indent=2), encoding="utf-8")
    temporary.replace(APPROVAL_FILE)


def create_approval(request: ChatRequest, decision: AiraDecision) -> dict:
    with approval_lock:
        items = read_approvals()
        item = {
            "id": str(uuid4()),
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_at": None,
            "reviewer_note": "",
            "session_id": request.session_id,
            "type": decision.approval_type,
            "summary": decision.approval_summary,
            "intent": decision.intent,
            "lead_priority": decision.lead_priority,
            "conversation": [item.model_dump() for item in request.history[-8:]] + [{"role": "user", "content": request.message}],
        }
        items.append(item)
        write_approvals(items)
        return item


def require_admin(authorization: str | None = Header(default=None)) -> None:
    configured = os.getenv("ADMIN_TOKEN")
    supplied = re.sub(r"^Bearer\s+", "", authorization or "", flags=re.IGNORECASE)
    if not configured or supplied != configured:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/", include_in_schema=False)
def website():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/health")
def health():
    configured = bool(os.getenv("OPENAI_API_KEY") and os.getenv("ADMIN_TOKEN"))
    return {"status": "ok" if configured else "configuration_required", "configured": configured, "model": os.getenv("OPENAI_MODEL", "gpt-5.6-sol")}


@app.get("/admin", include_in_schema=False)
def admin_page():
    return FileResponse(BASE_DIR / "admin.html")


@app.post("/api/customers", status_code=201)
def create_customer(request: CustomerRequest):
    """Enquiry flow: validate (Pydantic) -> save -> notify -> return ID."""
    try:
        # Step 1: Convert the already validated API contract to storage data.
        customer = request.model_dump()
        # Step 2: Save before notifying so email failure cannot lose the lead.
        customer_id = get_customer_repository().create(customer)
        # Step 3: Report notification status separately from storage status.
        email = notify_new_customer(customer_id, customer)
        return {"saved": True, "customer_id": customer_id, "excel": "saved", "email": email}
    except PermissionError as exc:
        raise HTTPException(status_code=503, detail="Customer storage is busy. Close the Excel workbook and retry.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not save the enquiry.") from exc


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Chat flow: build context -> call model -> gate approval -> reply."""
    try:
        # Step 1: Keep only the bounded conversation window accepted by the API.
        conversation = [item.model_dump() for item in request.history[-16:]] + [{"role": "user", "content": request.message}]
        # Step 2: Load credentials and request schema-validated model output.
        client = OpenAI(api_key=require_env("OPENAI_API_KEY"))
        response = client.responses.parse(
            model=os.getenv("OPENAI_MODEL", "gpt-5.6-sol"),
            instructions=AIRA_INSTRUCTIONS,
            input=f"VERIFIED ASR BUSINESS DATA:\n{read_knowledge()}\n\nCONVERSATION:\n{json.dumps(conversation)}",
            reasoning={"effort": "medium"},
            text_format=AiraDecision,
            safety_identifier=f"session_{re.sub(r'[^a-zA-Z0-9_-]', '', request.session_id)[:64] or 'anonymous'}",
        )
        decision = response.output_parsed
        if not decision:
            raise RuntimeError("The model returned no structured response.")
        # Step 3: Never return restricted commercial commitments directly.
        if decision.requires_approval:
            approval = create_approval(request, decision)
            return ChatResponse(
                answer=f"{decision.reply}\n\nThis request has been sent to the ASR team for manual review. Reference: {approval['id']}",
                approval_id=approval["id"],
                approval_status="pending",
            )
        return ChatResponse(answer=decision.reply)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="The assistant is temporarily unavailable. Please try again shortly.") from exc


@app.get("/api/approvals", dependencies=[Depends(require_admin)])
def list_approvals():
    with approval_lock:
        return read_approvals()


@app.patch("/api/approvals/{approval_id}", dependencies=[Depends(require_admin)])
def review_approval(approval_id: str, review: ApprovalReview):
    """Admin flow: authenticate dependency -> find -> review -> persist."""
    with approval_lock:
        items = read_approvals()
        item = next((entry for entry in items if entry["id"] == approval_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Approval not found")
        item["status"] = review.status
        item["reviewer_note"] = review.reviewer_note
        item["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        write_approvals(items)
        return item

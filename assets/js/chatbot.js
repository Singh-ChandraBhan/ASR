(() => {
  const API_URL = document.querySelector('meta[name="chatbot-api"]')?.content || 'http://localhost:8000/api/chat';
  const panel = document.querySelector('#chatPanel');
  const launcher = document.querySelector('#chatLauncher');
  const close = document.querySelector('#chatClose');
  const form = document.querySelector('#chatForm');
  const input = document.querySelector('#chatInput');
  const messages = document.querySelector('#chatMessages');
  const history = [];

  function toggle(force) {
    const open = force ?? !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    launcher.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    if (open) input.focus();
  }

  function addMessage(content, role, extra = '') {
    const node = document.createElement('div');
    node.className = `chat-message ${role} ${extra}`;
    node.textContent = content;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  // Keep essential customer support available when the hosted AI API is offline.
  // This is a deterministic FAQ fallback, not an AI-generated response.
  function offlineAnswer(question) {
    const text = question.toLowerCase();
    if (/service|offer|supply|product|procurement|source/.test(text)) {
      return 'ASR Global Solutions offers product sourcing, vendor coordination, bulk procurement and delivery support for businesses across industries.';
    }
    if (/quote|price|cost|enquiry|inquiry|buy|order/.test(text)) {
      return 'To request a quote, please share the product name, specification, quantity, delivery location and required timeline through the enquiry form below.';
    }
    if (/address|location|located|visit|office/.test(text)) {
      return 'We are located at C5-802, Amrapali Golf Homes, Greater Noida, Uttar Pradesh 201318, India.';
    }
    if (/construction|building|contractor/.test(text)) {
      return 'Construction solutions are planned for the future and are not currently offered. Our present focus is B2B sourcing and supply-chain support.';
    }
    if (/email|contact|phone|call/.test(text)) {
      return 'You can contact ASR Global Solutions at info@asrglobalsolutions.com or submit the website enquiry form. A public phone number has not yet been confirmed.';
    }
    if (/hello|hi|hey|good morning|good evening/.test(text)) {
      return 'Hello! I can help with ASR services, quote requests, construction plans, contact details and our location. What would you like to know?';
    }
    return 'The AI service is currently offline, but I can still help with ASR services, quotes, construction plans, contact details or location. You can also email info@asrglobalsolutions.com.';
  }

  async function ask(question) {
    addMessage(question, 'user');
    const requestHistory = history.slice(-8);
    history.push({ role: 'user', content: question });
    const typing = addMessage('Thinking…', 'bot', 'typing');
    input.disabled = true;
    try {
      const response = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history: requestHistory }),
        // Avoid leaving the customer waiting when the AI backend is stopped.
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) throw new Error('Service unavailable');
      const data = await response.json();
      typing.remove();
      addMessage(data.answer, 'bot');
      history.push({ role: 'assistant', content: data.answer });
    } catch {
      typing.remove();
      const answer = offlineAnswer(question);
      addMessage(answer, 'bot');
      history.push({ role: 'assistant', content: answer });
    } finally {
      input.disabled = false; input.focus();
    }
  }

  launcher.addEventListener('click', () => toggle());
  close.addEventListener('click', () => toggle(false));
  form.addEventListener('submit', event => { event.preventDefault(); const value = input.value.trim(); if (value) { input.value = ''; ask(value); } });
  document.querySelectorAll('[data-chat-question]').forEach(button => button.addEventListener('click', () => ask(button.dataset.chatQuestion)));
})();

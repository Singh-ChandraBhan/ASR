const nav = document.querySelector('#mainNav');
const menu = document.querySelector('#navbarMenu');
const links = document.querySelectorAll('.nav-link');

function updateNav() {
  nav.classList.toggle('scrolled', window.scrollY > 40);
  const sections = [...document.querySelectorAll('main section[id]')];
  const current = sections.reverse().find(section => window.scrollY >= section.offsetTop - 180);
  links.forEach(link => link.classList.toggle('active', current && link.getAttribute('href') === `#${current.id}`));
}

window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

links.forEach(link => link.addEventListener('click', () => {
  const instance = bootstrap.Collapse.getInstance(menu);
  if (instance) instance.hide();
}));

document.querySelector('#enquiryForm').addEventListener('submit', async event => {
  event.preventDefault();
  // Submit to one stable API endpoint; the backend decides between Excel and SQL.
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const notice = form.querySelector('.form-success');
  const apiBase = document.querySelector('meta[name="chatbot-api"]')?.content?.replace(/\/api\/chat$/, '') || 'http://localhost:8000';
  button.disabled = true;
  notice.style.display = 'none';
  try {
    const response = await fetch(`${apiBase}/api/customers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.querySelector('#name').value.trim(), company: form.querySelector('#company').value.trim(),
        email: form.querySelector('#email').value.trim(), phone: form.querySelector('#phone').value.trim(),
        requirement: form.querySelector('#message').value.trim(), source: 'Website enquiry form'
      })
    });
    if (!response.ok) throw new Error('Save failed');
    const result = await response.json();
    // Show the generated ID so the customer can reference this enquiry later.
    const emailMessage = result.email?.status === 'sent'
      ? 'The ASR team has also been notified by email.'
      : 'The enquiry is saved for the ASR team; email notification is not currently available.';
    notice.textContent = `Thank you! Your enquiry ${result.customer_id} has been saved in Excel. ${emailMessage}`;
    notice.style.cssText = 'display:block';
    form.reset();
  } catch {
    // Never claim success when storage or network access fails.
    notice.textContent = 'We could not save your enquiry right now. Please email info@asrglobalsolutions.com.';
    notice.style.cssText = 'display:block;color:#9a3412;background:#fff1e8';
  } finally { button.disabled = false; }
});

document.querySelector('#year').textContent = new Date().getFullYear();

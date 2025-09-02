// public/login.js — full drop-in
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');

  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    submitBtn.classList.toggle('btn-loading', !!on);
  }

  function clearFieldStates() {
    form.querySelectorAll('.form-row').forEach(el => el.classList.remove('error', 'success'));
  }

  function markErrorFields() {
    form.querySelector('[name="username"]')?.closest('.form-row')?.classList.add('error');
    form.querySelector('[name="password"]')?.closest('.form-row')?.classList.add('error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.classList.remove('error');
    clearFieldStates();
    setLoading(true);

    const fd = new FormData(form);
    const body = {
      username: String(fd.get('username') || '').trim(),
      password: String(fd.get('password') || '')
    };

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });

      if (r.ok) {
        // Optional success hint (brief) before redirect
        try { msg.textContent = 'Signed in. Redirecting…'; } catch {}
        window.location.href = '/dashboard';
        return;
      }

      let err = {};
      try { err = await r.json(); } catch {}

      if (r.status === 401 && err?.error === 'invalid_credentials') {
        msg.textContent = 'Invalid username or password';
        msg.classList.add('error');
        markErrorFields();
      } else if (r.status === 429) {
        msg.textContent = 'Too many attempts. Please try again later.';
        msg.classList.add('error');
      } else if (r.status === 400 && err?.error === 'validation_error') {
        msg.textContent = 'Please check inputs and try again.';
        msg.classList.add('error');
        markErrorFields();
      } else {
        msg.textContent = 'Login failed';
        msg.classList.add('error');
      }
    } catch {
      msg.textContent = 'Network error. Check connection and try again.';
      msg.classList.add('error');
    } finally {
      setLoading(false);
    }
  });
});

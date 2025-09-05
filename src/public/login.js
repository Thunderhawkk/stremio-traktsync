// Enhanced login.js with better UX and loading states
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');

  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const btnText = submitBtn?.querySelector('.btn-text');

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    submitBtn.classList.toggle('loading', !!on);
    if (btnText) {
      btnText.textContent = on ? 'Signing in...' : 'Sign in';
    }
  }

  function showMessage(text, type = 'error') {
    if (!msg) return;
    msg.textContent = text;
    msg.className = `form-message ${type}`;
    msg.style.display = text ? 'block' : 'none';
  }

  function clearFieldStates() {
    form.querySelectorAll('.form-group').forEach(el => {
      el.classList.remove('invalid', 'valid');
    });
  }

  function markErrorFields() {
    const usernameGroup = form.querySelector('[name="username"]')?.closest('.form-group');
    const passwordGroup = form.querySelector('[name="password"]')?.closest('.form-group');
    usernameGroup?.classList.add('invalid');
    passwordGroup?.classList.add('invalid');
  }

  function validateForm() {
    const username = form.querySelector('[name="username"]')?.value?.trim();
    const password = form.querySelector('[name="password"]')?.value;
    
    if (!username) {
      showMessage('Please enter your username');
      return false;
    }
    
    if (!password) {
      showMessage('Please enter your password');
      return false;
    }
    
    return true;
  }

  // Enhanced form submission with better error handling
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    showMessage('');
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
        showMessage('Success! Redirecting to dashboard...', 'success');
        
        // Small delay for better UX
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
        return;
      }

      let err = {};
      try {
        err = await r.json();
      } catch (parseError) {
        console.warn('Failed to parse error response:', parseError);
      }

      // Enhanced error handling
      if (r.status === 401) {
        showMessage('Invalid username or password. Please try again.');
        markErrorFields();
      } else if (r.status === 429) {
        showMessage('Too many login attempts. Please wait a moment and try again.');
      } else if (r.status === 400) {
        showMessage('Please check your input and try again.');
        markErrorFields();
      } else if (r.status >= 500) {
        showMessage('Server error. Please try again later.');
      } else {
        showMessage(err?.error || 'Login failed. Please try again.');
      }
    } catch (networkError) {
      console.error('Network error:', networkError);
      showMessage('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });

  // Real-time validation feedback
  const inputs = form.querySelectorAll('.form-input');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const group = input.closest('.form-group');
      group?.classList.remove('invalid', 'valid');
      
      // Clear message when user starts typing
      if (msg && msg.classList.contains('error')) {
        showMessage('');
      }
    });
    
    input.addEventListener('blur', () => {
      const group = input.closest('.form-group');
      if (input.value.trim() && input.checkValidity()) {
        group?.classList.add('valid');
      }
    });
  });

  // Focus management
  const firstInput = form.querySelector('.form-input');
  if (firstInput && !firstInput.value) {
    firstInput.focus();
  }
});

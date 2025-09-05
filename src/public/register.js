// Enhanced register.js with validation and better UX
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('regForm');
  const msg = document.getElementById('msg');

  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const btnText = submitBtn?.querySelector('.btn-text');

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    submitBtn.classList.toggle('loading', !!on);
    if (btnText) {
      btnText.textContent = on ? 'Creating account...' : 'Create account';
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

  function validateUsername(username) {
    if (!username || username.length < 3) {
      return 'Username must be at least 3 characters long';
    }
    if (username.length > 30) {
      return 'Username must be less than 30 characters';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Username can only contain letters, numbers, and underscores';
    }
    return null;
  }

  function validateEmail(email) {
    if (!email) return null; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return null;
  }

  function validatePassword(password) {
    if (!password || password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    return null;
  }

  function validateForm() {
    const username = form.querySelector('[name="username"]')?.value?.trim();
    const email = form.querySelector('[name="email"]')?.value?.trim();
    const password = form.querySelector('[name="password"]')?.value;
    const termsAccepted = form.querySelector('#terms')?.checked;
    
    clearFieldStates();
    
    let hasError = false;
    
    const usernameError = validateUsername(username);
    if (usernameError) {
      showMessage(usernameError);
      form.querySelector('[name="username"]')?.closest('.form-group')?.classList.add('invalid');
      hasError = true;
    }
    
    const emailError = validateEmail(email);
    if (emailError) {
      showMessage(emailError);
      form.querySelector('[name="email"]')?.closest('.form-group')?.classList.add('invalid');
      hasError = true;
    }
    
    const passwordError = validatePassword(password);
    if (passwordError) {
      showMessage(passwordError);
      form.querySelector('[name="password"]')?.closest('.form-group')?.classList.add('invalid');
      hasError = true;
    }
    
    if (termsAccepted === false) {
      showMessage('Please accept the Terms of Service and Privacy Policy');
      hasError = true;
    }
    
    return !hasError;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    showMessage('');
    setLoading(true);

    const fd = new FormData(form);
    const body = {
      username: String(fd.get('username') || '').trim(),
      email: String(fd.get('email') || '').trim() || undefined,
      password: String(fd.get('password') || '')
    };

    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });

      if (r.ok) {
        showMessage('Account created successfully! Redirecting to dashboard...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
        return;
      }

      let err = {};
      try {
        err = await r.json();
      } catch (parseError) {
        console.warn('Failed to parse error response:', parseError);
      }

      if (r.status === 400) {
        if (err?.error === 'username_taken') {
          showMessage('Username is already taken. Please choose a different one.');
          form.querySelector('[name="username"]')?.closest('.form-group')?.classList.add('invalid');
        } else if (err?.error === 'email_taken') {
          showMessage('Email is already registered. Please use a different email.');
          form.querySelector('[name="email"]')?.closest('.form-group')?.classList.add('invalid');
        } else {
          showMessage(err?.error || 'Registration failed. Please try again.');
        }
      } else if (r.status === 429) {
        showMessage('Too many registration attempts. Please wait and try again.');
      } else {
        showMessage('Registration failed. Please try again.');
      }
    } catch (networkError) {
      console.error('Network error:', networkError);
      showMessage('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  });

  // Real-time validation
  const inputs = form.querySelectorAll('.form-input');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const group = input.closest('.form-group');
      group?.classList.remove('invalid', 'valid');
      if (msg && msg.classList.contains('error')) {
        showMessage('');
      }
    });
    
    input.addEventListener('blur', () => {
      const group = input.closest('.form-group');
      const name = input.name;
      const value = input.value.trim();
      
      if (!value && input.required) {
        group?.classList.add('invalid');
        return;
      }
      
      let isValid = true;
      
      if (name === 'username' && value) {
        isValid = !validateUsername(value);
      } else if (name === 'email' && value) {
        isValid = !validateEmail(value);
      } else if (name === 'password' && value) {
        isValid = !validatePassword(value);
      }
      
      if (isValid && value) {
        group?.classList.add('valid');
      } else if (value) {
        group?.classList.add('invalid');
      }
    });
  });
});

/**
 * auth.js — Handsfree Auth Controller
 * Handles: Loading screen animation → Login page → Main app reveal
 * Also manages cursor center-reset when Handsfree tracking starts.
 */

/* ─── Loading Screen ───────────────────────────────────────────────────────── */

const LOAD_STEPS = [
  { pct: 12,  msg: 'Initializing core modules...' },
  { pct: 28,  msg: 'Loading MediaPipe vision pipeline...' },
  { pct: 45,  msg: 'Configuring speech recognition engine...' },
  { pct: 62,  msg: 'Warming up dwell selection system...' },
  { pct: 78,  msg: 'Preparing browser sandbox...' },
  { pct: 92,  msg: 'Finalizing accessibility layer...' },
  { pct: 100, msg: 'Ready. Welcome to Handsfree!' },
];

function runLoadingSequence() {
  const fill   = document.getElementById('load-prog-fill');
  const status = document.getElementById('load-status-text');
  const screen = document.getElementById('loading-screen');
  const login  = document.getElementById('login-page');

  if (!fill || !screen) return;

  let stepIndex = 0;

  const advance = () => {
    if (stepIndex >= LOAD_STEPS.length) {
      // Loading done → hide loading screen & show login
      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        screen.classList.add('hidden');
        screen.style.display = 'none';
        if (login) {
          login.classList.remove('hidden');
          login.style.opacity = '1';
          const emailField = document.getElementById('login-email');
          if (emailField) emailField.focus();
        }
      }, 300);
      return;
    }

    const step = LOAD_STEPS[stepIndex++];
    fill.style.width   = step.pct + '%';
    status.textContent = step.msg;

    const delay = stepIndex === LOAD_STEPS.length ? 100 : 80 + Math.random() * 40;
    setTimeout(advance, delay);
  };

  // Start sequence almost immediately
  setTimeout(advance, 50);
}

/* ─── Login Page Logic ─────────────────────────────────────────────────────── */

// Initialize skip login button handler
function initSkipLogin() {
  const skipBtn = document.getElementById('skip-login-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      // Directly reveal the app without validation
      revealApp();
    });
  }
}

// Modify revealApp to clean up auth mode
function revealApp() {
  const loginPage    = document.getElementById('login-page');
  const appContainer = document.querySelector('.app-container');

  if (loginPage) loginPage.classList.add('hidden');

  if (appContainer) {
    appContainer.style.opacity = '0';
    appContainer.style.display = 'grid';
    appContainer.style.transform = 'translateY(16px)';
    appContainer.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    // Force reflow
    appContainer.offsetHeight;
    appContainer.style.opacity   = '1';
    appContainer.style.transform = 'translateY(0)';
  }

  // Remove auth-mode class to re‑show the virtual cursor
  document.body.classList.remove('auth-mode');

  showAuthToast('Signed in successfully! Welcome to Handsfree 🎉', '#10b981');
}

function initLoginPage() {
  initSkipLogin();

  const form        = document.getElementById('login-form');
  const submitBtn   = document.getElementById('login-submit-btn');
  const emailInput  = document.getElementById('login-email');
  const pwInput     = document.getElementById('login-password');
  const pwToggle    = document.getElementById('pw-toggle-btn');
  const pwIcon      = document.getElementById('pw-toggle-icon');
  const emailErr    = document.getElementById('email-error');
  const pwErr       = document.getElementById('password-error');

  // ── Password show/hide toggle
  if (pwToggle && pwInput) {
    pwToggle.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type  = isHidden ? 'text' : 'password';
      pwIcon.className = isHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      pwToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  }

  // ── Social login buttons (demo — show toast)
  const googleBtn = document.getElementById('login-google-btn');
  const githubBtn = document.getElementById('login-github-btn');
  if (googleBtn) googleBtn.addEventListener('click', () => simulateSocialLogin('Google'));
  if (githubBtn) githubBtn.addEventListener('click', () => simulateSocialLogin('GitHub'));

  // ── Forgot password
  const forgotLink = document.getElementById('forgot-pw-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthToast('Password reset link sent to your email!', '#06b6d4');
    });
  }

  // ── Sign up link
  const signupLink = document.getElementById('signup-link');
  if (signupLink) {
    signupLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthToast('Sign-up coming soon! Use any credentials to demo.', '#8b5cf6');
    });
  }

  // ── Clear errors on input
  if (emailInput) emailInput.addEventListener('input', () => hideError(emailErr));
  if (pwInput)    pwInput.addEventListener('input',    () => hideError(pwErr));

  // ── Form submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput ? emailInput.value.trim() : '';
      const pw    = pwInput    ? pwInput.value           : '';

      let valid = true;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError(emailErr, 'Please enter a valid email address.');
        valid = false;
      }

      if (!pw || pw.length < 3) {
        showError(pwErr, 'Password must be at least 3 characters.');
        valid = false;
      }

      if (!valid) return;

      // Show loading state on button
      if (submitBtn) submitBtn.classList.add('loading-state');

      // Simulate async auth (1.4s)
      await new Promise(r => setTimeout(r, 1400));

      if (submitBtn) submitBtn.classList.remove('loading-state');

      // ── Success: hide login → reveal app
      revealApp();
    });
  }
}

function showError(el, msg) {
  if (!el) return;
  const span = el.querySelector('span');
  if (span) span.textContent = msg;
  el.classList.add('visible');
}

function hideError(el) {
  if (!el) return;
  el.classList.remove('visible');
}

function simulateSocialLogin(provider) {
  showAuthToast(`Connecting to ${provider}...`, '#10b981');
  setTimeout(revealApp, 1200);
}

function showAuthToast(msg, color = '#10b981') {
  const t = document.createElement('div');
  t.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: rgba(15,23,42,0.95); border: 1px solid ${color};
    border-radius: 10px; padding: 0.75rem 1.5rem; color: #e2e8f0;
    font-size: 0.88rem; font-weight: 600; z-index: 9999999;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 12px ${color}55;
    animation: fadeSlideUp 0.3s ease both;
    display: flex; align-items: center; gap: 0.5rem;
  `;
  t.innerHTML = `<i class="fa-solid fa-circle-check" style="color:${color}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.4s';
    setTimeout(() => t.remove(), 400);
  }, 3000);
}

/* ─── Cursor Center-Reset on Handsfree Start ──────────────────────────────── */

export function initCursorCenterReset() {
  const startBtn = document.getElementById('toggle-tracking-btn');
  const pointer  = document.getElementById('handsfree-virtual-pointer');

  if (!startBtn || !pointer) return;

  startBtn.addEventListener('click', () => {
    // Small delay to let tracking state update first
    setTimeout(() => {
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;

      // Add the snap class for a smooth spring transition
      pointer.classList.add('center-snap');

      // Reset the virtual pointer position to screen center
      pointer.style.transform = `translate3d(${Math.round(cx - 18)}px, ${Math.round(cy - 18)}px, 0)`;

      // Sync the filter's internal coords if available
      if (window.handsfreeApp && window.handsfreeApp.cursorFilter) {
        window.handsfreeApp.cursorFilter.currentX = cx;
        window.handsfreeApp.cursorFilter.currentY = cy;
        // Reset the EMA to center so head tilt is relative to current position
        window.handsfreeApp.cursorFilter.smoothX = cx;
        window.handsfreeApp.cursorFilter.smoothY = cy;
        window.handsfreeApp.cursorFilter.reset(cx, cy);
      }

      // Remove the snap class after transition so real-time tracking is lag-free
      setTimeout(() => pointer.classList.remove('center-snap'), 350);
    }, 80);
  });
}

/* ─── Bootstrap ────────────────────────────────────────────────────────────── */

// Hide app container until logged in
document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.querySelector('.app-container');
  if (appContainer) appContainer.style.display = 'none';

  // Add auth-mode class to hide virtual cursor during auth screens
  document.body.classList.add('auth-mode');

  runLoadingSequence();
  initLoginPage();
});

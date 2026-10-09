const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const year = document.getElementById('year');

if (year) {
  year.textContent = new Date().getFullYear();
}

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('visible'));
}

/* Admin image upload and password-protected panel (client-side) */
const adminBtn = document.querySelector('.admin-btn');
const adminModal = document.getElementById('adminModal');
const closeAdmin = document.getElementById('closeAdmin');
const setPasswordBtn = document.getElementById('setPasswordBtn');
const newPasswordInput = document.getElementById('newPassword');
const loginBtn = document.getElementById('loginBtn');
const adminPasswordInput = document.getElementById('adminPassword');
const heroUpload = document.getElementById('heroUpload');
const saveHeroBtn = document.getElementById('saveHeroBtn');
const clearHeroBtn = document.getElementById('clearHeroBtn');
const adminMsg = document.getElementById('adminMsg');

const HERO_KEY = 'jm_hero_image';
const PASS_KEY = 'jm_admin_pass';

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(hash);
}

function setHeroBackgroundFromDataUrl(dataUrl) {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  hero.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url('${dataUrl}')`;
}

// Load saved hero image (if any)
const savedHero = localStorage.getItem(HERO_KEY);
if (savedHero) {
  setHeroBackgroundFromDataUrl(savedHero);
}

// Modal controls
if (adminBtn && adminModal) {
  adminBtn.addEventListener('click', () => {
    adminModal.setAttribute('aria-hidden', 'false');
  });
}

if (closeAdmin) {
  closeAdmin.addEventListener('click', () => {
    adminModal.setAttribute('aria-hidden', 'true');
  });
}

if (setPasswordBtn) {
  setPasswordBtn.addEventListener('click', async () => {
    const pw = newPasswordInput.value.trim();
    if (!pw) { alert('Enter a password'); return; }
    const hash = await hashPassword(pw);
    localStorage.setItem(PASS_KEY, hash);
    newPasswordInput.value = '';
    adminMsg.textContent = 'Password set. Use the login to continue.';
  });
}

let authenticated = false;

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const pw = adminPasswordInput.value.trim();
    const stored = localStorage.getItem(PASS_KEY);
    if (!stored) { alert('No admin password set. Please set one first.'); return; }
    const hash = await hashPassword(pw);
    if (hash === stored) {
      authenticated = true;
      adminMsg.textContent = 'Authenticated. You can upload an image now.';
      saveHeroBtn.disabled = false;
      adminPasswordInput.value = '';
    } else {
      alert('Incorrect password');
    }
  });
}

if (heroUpload) {
  heroUpload.addEventListener('change', () => {
    if (heroUpload.files && heroUpload.files[0]) {
      saveHeroBtn.disabled = false;
    }
  });
}

if (saveHeroBtn) {
  saveHeroBtn.addEventListener('click', () => {
    if (!authenticated) { alert('Please login first'); return; }
    const file = heroUpload.files && heroUpload.files[0];
    if (!file) { alert('Select an image file first'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      try {
        localStorage.setItem(HERO_KEY, dataUrl);
        setHeroBackgroundFromDataUrl(dataUrl);
        adminMsg.textContent = 'Hero image updated and saved in browser.';
      } catch (err) {
        alert('Failed to save image: ' + err.message);
      }
    };
    reader.readAsDataURL(file);
  });
}

if (clearHeroBtn) {
  clearHeroBtn.addEventListener('click', () => {
    if (!confirm('Clear saved hero image? This will reset to default.')) return;
    localStorage.removeItem(HERO_KEY);
    location.reload();
  });
}

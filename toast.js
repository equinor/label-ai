// Copyright 2026 Matt Hall, Equinor // MIT license
// Subtle, self-dismissing confirmation toast shared by both pages.
let copyToastEl;
let copyToastTimer;

function showToast(message = 'Copied to clipboard') {
  if (!copyToastEl) {
    copyToastEl = document.createElement('div');
    copyToastEl.className = 'copy-toast';
    document.body.appendChild(copyToastEl);
  }
  copyToastEl.textContent = message;

  // Force a reflow so repeated copies restart the fade-in animation.
  void copyToastEl.offsetWidth;

  copyToastEl.classList.add('show');
  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => copyToastEl.classList.remove('show'), 1800);
}

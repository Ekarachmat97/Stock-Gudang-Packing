if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/js/sw.js').then(reg => {
    console.log('ServiceWorker registered', reg.scope);
  }).catch(err => {
    console.warn('ServiceWorker registration failed', err);
  });
}

// Capture beforeinstallprompt so UI can trigger install later if desired
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  console.log('beforeinstallprompt fired. Call deferredInstallPrompt.prompt() to show.');
  // optional: expose a helper to trigger the prompt from console or custom UI
  window.showInstallPrompt = async () => {
    if (!deferredInstallPrompt) return null;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return choice;
  };
});

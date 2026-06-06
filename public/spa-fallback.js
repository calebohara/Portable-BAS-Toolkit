// SPA navigation fallback for the Tauri static export.
//
// This script is injected into the main webview at startup (see
// `src-tauri/src/lib.rs`, loaded via `include_str!`). When the webview hard-
// refreshes on a dynamic route like /projects/{uuid} or /reports/{uuid}[/edit],
// the static file for that exact path doesn't exist in the embedded assets. We
// detect the missing App Router shell and redirect to the catch-all `_`
// fallback route, preserving the dynamic id and any query params.
(function () {
  function checkSpaFallback() {
    const path = window.location.pathname;
    const parts = path.replace(/\/$/, '').split('/');

    // Check if this is a dynamic route (projects/{id} or reports/{id}[/edit])
    const isDynamic = (
      (parts[1] === 'projects' && parts.length === 3 && parts[2] !== '_') ||
      (parts[1] === 'reports' && parts.length >= 3 && parts[2] !== '_' && parts[2] !== 'new')
    );

    if (!isDynamic) return;

    // Detect if the page failed to load. The App Router shell renders
    // <main id="main-content">; if that's absent the static file for this
    // dynamic route didn't load. (The old '#__next' check never matched in the
    // App Router, so the fallback fired on every nav.)
    const hasAppShell = document.querySelector('main#main-content');
    const bodyEmpty = document.body && document.body.innerHTML.trim() === '';
    const isErrorPage = document.title === '' || document.title === '404';

    if (bodyEmpty || !hasAppShell || isErrorPage) {
      const id = parts[2];
      const isEdit = parts[3] === 'edit';
      // Preserve existing query params (e.g. ?tab=notes) through the fallback redirect
      const existingParams = new URLSearchParams(window.location.search);
      existingParams.set('_id', id);
      let fallbackUrl;
      if (parts[1] === 'projects') {
        fallbackUrl = '/projects/_/?' + existingParams.toString();
      } else if (isEdit) {
        fallbackUrl = '/reports/_/edit/?' + existingParams.toString();
      } else {
        fallbackUrl = '/reports/_/?' + existingParams.toString();
      }
      window.location.replace(fallbackUrl);
    }
  }

  // Wait for the page to fully load before checking
  if (document.readyState === 'complete') {
    checkSpaFallback();
  } else {
    window.addEventListener('load', checkSpaFallback);
  }
})();

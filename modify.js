const fs = require('fs');
let code = fs.readFileSync('src/dashboard.ts', 'utf8');

// 1. Change export
code = code.replace('export const dashboard = `<!doctype html>', 'export const renderDashboard = (config: { domain: string, clientId: string, audience: string }) => `<!doctype html>');

// 2. Add Auth0 SPA script to head
code = code.replace('<head>', '<head>\\n<script src="https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js"></script>');

// 3. Add CSS for auth-required elements
code = code.replace('</style>', '  .auth-required { display: none !important; }\\n  body.is-authenticated .auth-required { display: flex !important; }\\n  body.is-authenticated section.stats-grid.auth-required { display: grid !important; }\\n  body.is-authenticated .btn-resend.auth-required { display: inline-flex !important; }\\n</style>');

// 4. Add Login button to nav-actions and class auth-required to protected elements
code = code.replace('<div class="nav-actions">', '<div class="nav-actions">\\n      <button class="btn btn-ghost" id="btn-login">\\n        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>\\n        <span id="btn-login-text">Login</span>\\n      </button>');

code = code.replace('id="btn-settings"', 'id="btn-settings" class="btn btn-ghost btn-icon auth-required"');
code = code.replace('id="btn-scan"', 'id="btn-scan" class="btn btn-primary auth-required"');
code = code.replace('<section class="stats-grid">', '<section class="stats-grid auth-required">');

// 5. In renderChallenges, add auth-required to btn-resend
code = code.replace('class="btn-resend"', 'class="btn-resend auth-required"');

// 6. In script, add Auth0 logic and add authToken to headers
const authScript = `
let auth0Client = null;
let authToken = null;
const authConfig = {
  domain: "\\\${config.domain || ''}",
  clientId: "\\\${config.clientId || ''}",
  audience: "\\\${config.audience || ''}"
};

async function initAuth() {
  if (!authConfig.domain || !authConfig.clientId) return;
  
  auth0Client = await auth0.createAuth0Client({
    domain: authConfig.domain,
    clientId: authConfig.clientId,
    authorizationParams: {
      audience: authConfig.audience,
      redirect_uri: window.location.origin
    }
  });

  if (location.search.includes("state=") && (location.search.includes("code=") || location.search.includes("error="))) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, "/");
  }

  const isAuthenticated = await auth0Client.isAuthenticated();
  if (isAuthenticated) {
    authToken = await auth0Client.getTokenSilently();
    document.body.classList.add('is-authenticated');
    document.getElementById('btn-login-text').textContent = 'Logout';
  }
}

document.getElementById('btn-login').addEventListener('click', async () => {
  if (!auth0Client) {
    alert('Auth0 is not configured on the server.');
    return;
  }
  const isAuthenticated = await auth0Client.isAuthenticated();
  if (isAuthenticated) {
    auth0Client.logout({ logoutParams: { returnTo: window.location.origin } });
  } else {
    auth0Client.loginWithRedirect();
  }
});
`;

code = code.replace('<script>\\nlet allChallenges', '<script>\\n' + authScript + '\\nlet allChallenges');

// 7. Add headers to fetch calls
code = code.replace(/await fetch\('\\/api\\/scan', \{ method: 'POST' \}\)/g, "await fetch('/api/scan', { method: 'POST', headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {} })");
code = code.replace(/await fetch\('\/api\/settings'\)/g, "await fetch('/api/settings', { headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {} })");
code = code.replace(/await fetch\('\/api\/settings', \{/g, "await fetch('/api/settings', {");
code = code.replace(/headers: \{ 'Content-Type': 'application\/json' \}/g, "headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {}) }");
code = code.replace(/await fetch\(btn\.dataset\.url, \{ method: 'POST' \}\)/g, "await fetch(btn.dataset.url, { method: 'POST', headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {} })");

// Make sure load() is called after initAuth()
code = code.replace('load();\\n</script>', 'initAuth().then(load);\\n</script>');

fs.writeFileSync('src/dashboard.ts', code);
console.log('Done rewriting dashboard.ts');

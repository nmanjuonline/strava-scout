export const subscribePage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscribe to Strava Scout</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #090d16;
            --bg-gradient: radial-gradient(circle at 85% 0%, rgba(252, 82, 0, 0.14) 0%, transparent 45%),
                           radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                           #090d16;
            --nav-bg: rgba(9, 13, 22, 0.85);
            --card-bg: rgba(17, 24, 39, 0.72);
            --card-border: rgba(255, 255, 255, 0.08);
            --card-hover-border: rgba(252, 82, 0, 0.35);
            --card-hover-glow: 0 12px 32px -8px rgba(252, 82, 0, 0.2);
            --fg: #f8fafc;
            --fg-muted: #94a3b8;
            --fg-subtle: #64748b;
            --accent: #fc5200;
            --accent-light: #ff7a3d;
            --accent-glow: rgba(252, 82, 0, 0.3);
            --accent-gradient: linear-gradient(135deg, #fc5200 0%, #ff7a3d 100%);
            --cyan: #38bdf8;
            --emerald: #10b981;
            --amber: #f59e0b;
            --ghost-bg: rgba(255, 255, 255, 0.05);
            --ghost-hover-bg: rgba(255, 255, 255, 0.08);
            --ghost-border: rgba(255, 255, 255, 0.08);
            --ghost-hover-border: rgba(255, 255, 255, 0.15);
            --pill-bg: rgba(255, 255, 255, 0.07);
            --pill-bg-light: rgba(255, 255, 255, 0.04);
            --text-gradient: linear-gradient(135deg, #ffffff 40%, #fc5200 100%);
            --success: #10b981;
            --error: #ef4444;
        }

        :root[data-theme="light"] {
            --bg: #f7f7f9;
            --bg-gradient: #f7f7f9;
            --nav-bg: rgba(255, 255, 255, 0.85);
            --card-bg: #ffffff;
            --card-border: #e6e6e6;
            --card-hover-border: rgba(252, 82, 0, 0.4);
            --card-hover-glow: 0 4px 12px rgba(0, 0, 0, 0.08);
            --fg: #242428;
            --fg-muted: #6b6b75;
            --fg-subtle: #898993;
            --accent: #fc5200;
            --accent-light: #fc5200;
            --accent-glow: rgba(252, 82, 0, 0.2);
            --accent-gradient: #fc5200;
            --cyan: #0284c7;
            --emerald: #059669;
            --amber: #d97706;
            --ghost-bg: rgba(0, 0, 0, 0.04);
            --ghost-hover-bg: rgba(0, 0, 0, 0.08);
            --ghost-border: rgba(0, 0, 0, 0.08);
            --ghost-hover-border: rgba(0, 0, 0, 0.15);
            --pill-bg: rgba(0, 0, 0, 0.06);
            --pill-bg-light: rgba(0, 0, 0, 0.04);
            --text-gradient: #242428;
        }

        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-gradient);
            background-attachment: fixed;
            color: var(--fg);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            -webkit-font-smoothing: antialiased;
            padding: 40px 0;
        }
        .container {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--card-border);
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            max-width: 420px;
            width: 90%;
            box-sizing: border-box;
            text-align: center;
            margin: auto;
        }
        h1 {
            background: var(--text-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-top: 0;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.02em;
        }
        p.subtitle {
            color: var(--fg-muted);
            line-height: 1.6;
            margin-bottom: 28px;
            font-size: 15px;
        }

        .options-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin-bottom: 28px;
        }
        .option-card {
            background: var(--ghost-bg);
            border: 1px solid var(--ghost-border);
            border-radius: 12px;
            padding: 24px;
            text-align: left;
            transition: all 0.2s;
        }
        .option-card:hover {
            border-color: var(--card-hover-border);
            background: var(--ghost-hover-bg);
        }
        .option-card h3 {
            margin-top: 0;
            margin-bottom: 8px;
            font-size: 18px;
            color: var(--fg);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .option-desc {
            margin-top: 0;
            margin-bottom: 16px;
            font-size: 14px;
            color: var(--fg-muted);
            line-height: 1.5;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        input[type="email"] {
            padding: 12px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--card-border);
            border-radius: 8px;
            font-size: 14px;
            color: var(--fg);
            outline: none;
            transition: all 0.2s;
            font-family: inherit;
        }
        :root[data-theme="light"] input[type="email"] {
            background: rgba(0,0,0,0.02);
        }
        input[type="email"]:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(252, 82, 0, 0.15);
        }
        button {
            background: var(--accent-gradient);
            color: #ffffff;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: inherit;
        }
        button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 14px var(--accent-glow);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .btn {
            display: inline-block;
            width: 100%;
            text-align: center;
            text-decoration: none;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-sizing: border-box;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .telegram-btn {
            background: #229ED9;
            color: #fff;
            border: none;
        }
        .telegram-btn:hover {
            background: #1c88ba;
            box-shadow: 0 4px 14px rgba(34, 158, 217, 0.3);
        }
        .app-btn {
            background: var(--emerald);
            color: #fff;
            border: none;
        }
        .app-btn:hover {
            background: #0d9668;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
        }

        .message {
            margin-top: 12px;
            padding: 10px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            display: none;
            text-align: center;
        }
        .message.success {
            display: block;
            background: rgba(16, 185, 129, 0.1);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .message.error {
            display: block;
            background: rgba(239, 68, 68, 0.1);
            color: var(--error);
            border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .back-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            color: var(--fg-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: color 0.2s;
        }
        .back-link:hover {
            color: var(--fg);
        }

        @media (max-width: 480px) {
            .container {
                padding: 24px 20px;
                width: 95%;
            }
            .option-card {
                padding: 20px 16px;
            }
            h1 {
                font-size: 24px;
            }
        }
    </style>
    <script>
        const savedTheme = localStorage.getItem('strava-scout-theme');
        if (savedTheme) { document.documentElement.setAttribute('data-theme', savedTheme); }
    </script>
</head>
<body>
    <div class="container">
        <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px;">
            <img src="/logo-v2.png" width="40" height="40" alt="Strava Scout" style="object-fit: contain; border-radius: 8px;" />
            <h1 style="margin-bottom: 0;">Strava Scout</h1>
        </div>
        <p class="subtitle">Choose how you want to be notified when new Strava challenges are discovered.</p>
        
        <div class="options-container">
            <!-- Telegram Option -->
            <div class="option-card">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Telegram
                </h3>
                <p class="option-desc">Get instant updates directly to your Telegram app via our official bot.</p>
                <a href="https://t.me/strava_scout" target="_blank" class="btn telegram-btn">Open Telegram Channel</a>
            </div>

            <!-- Mobile App Option -->
            <div class="option-card">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                        <line x1="12" y1="18" x2="12.01" y2="18"></line>
                    </svg>
                    Mobile App (Android)
                </h3>
                <p class="option-desc">Download our native Android app for rich push notifications.</p>
                <a href="https://nightly.link/nmanjuonline/strava-scout/workflows/build-android.yml/main/Strava%20Scout.zip" class="btn app-btn">Download Latest APK</a>
            </div>

            <!-- Email Option -->
            <div class="option-card">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    Email
                </h3>
                <p class="option-desc">Receive instant emails directly to your inbox.</p>
                <form id="subscribeForm">
                    <div class="form-group">
                        <input type="email" id="email" placeholder="Enter your email address" required autocomplete="email" />
                        <button type="submit" id="submitBtn">Subscribe via Email</button>
                    </div>
                </form>
                <div style="text-align: center; margin-top: 12px;">
                    <a href="#" id="toggleActionBtn" style="color: var(--fg-muted); font-size: 13px; text-decoration: underline;">Want to unsubscribe instead?</a>
                </div>
                <div id="message" class="message"></div>
            </div>
        </div>
        
        <a href="/" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Dashboard
        </a>
    </div>

    <footer style="text-align: center; margin-top: 48px; padding-bottom: 24px; color: var(--fg-muted); font-size: 13px;">
      Built with ❤️ by Manju Narasimha
    </footer>

    <script>
        let isUnsubscribe = false;
        
        document.getElementById('toggleActionBtn').addEventListener('click', (e) => {
            e.preventDefault();
            isUnsubscribe = !isUnsubscribe;
            const btn = document.getElementById('submitBtn');
            const toggleBtn = document.getElementById('toggleActionBtn');
            const messageEl = document.getElementById('message');
            messageEl.className = 'message';
            messageEl.textContent = '';
            
            if (isUnsubscribe) {
                btn.textContent = 'Unsubscribe';
                btn.style.background = 'var(--error)';
                toggleBtn.textContent = 'Want to subscribe instead?';
            } else {
                btn.textContent = 'Subscribe via Email';
                btn.style.background = 'var(--accent-gradient)';
                toggleBtn.textContent = 'Want to unsubscribe instead?';
            }
        });

        document.getElementById('subscribeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email');
            const submitBtn = document.getElementById('submitBtn');
            const messageEl = document.getElementById('message');
            
            const email = emailInput.value.trim();
            if (!email) return;

            // Reset state
            submitBtn.disabled = true;
            submitBtn.textContent = isUnsubscribe ? 'Unsubscribing...' : 'Subscribing...';
            messageEl.className = 'message';
            messageEl.textContent = '';

            try {
                const endpoint = isUnsubscribe ? '/api/unsubscribe' : '/api/subscribe';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email }),
                });

                const data = await response.json();

                if (response.ok) {
                    messageEl.className = 'message success';
                    messageEl.textContent = isUnsubscribe ? 'Successfully unsubscribed.' : 'Successfully subscribed!';
                    emailInput.value = '';
                } else {
                    messageEl.className = 'message error';
                    messageEl.textContent = data.error || (isUnsubscribe ? 'Failed to unsubscribe.' : 'Failed to subscribe.');
                }
            } catch (error) {
                messageEl.className = 'message error';
                messageEl.textContent = 'A network error occurred. Please try again later.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = isUnsubscribe ? 'Unsubscribe' : 'Subscribe via Email';
            }
        });
    </script>
</body>
</html>
`;

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
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            -webkit-font-smoothing: antialiased;
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
            text-align: center;
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
        p {
            color: var(--fg-muted);
            line-height: 1.6;
            margin-bottom: 28px;
            font-size: 15px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        input[type="email"] {
            padding: 14px;
            background: var(--ghost-bg);
            border: 1px solid var(--card-border);
            border-radius: 10px;
            font-size: 15px;
            color: var(--fg);
            outline: none;
            transition: all 0.2s;
            font-family: inherit;
        }
        input[type="email"]:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(252, 82, 0, 0.15);
        }
        button {
            background: var(--accent-gradient);
            color: #ffffff;
            border: none;
            padding: 14px;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 14px var(--accent-glow);
            font-family: inherit;
        }
        button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px var(--accent-glow);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .message {
            margin-top: 20px;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            display: none;
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
            gap: 6px;
            margin-top: 28px;
            color: var(--fg-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: color 0.2s;
        }
        .back-link:hover {
            color: var(--fg);
        }
    </style>
    <script>
        const savedTheme = localStorage.getItem('strava-scout-theme');
        if (savedTheme) { document.documentElement.setAttribute('data-theme', savedTheme); }
    </script>
</head>
<body>
    <div class="container">
        <h1>Strava Watchtower</h1>
        <p>Subscribe to receive instant email notifications as soon as new Strava challenges are discovered.</p>
        
        <form id="subscribeForm">
            <div class="form-group">
                <input type="email" id="email" placeholder="Enter your email address" required autocomplete="email" />
                <button type="submit" id="submitBtn">Subscribe Now</button>
            </div>
        </form>
        
        <div id="message" class="message"></div>
        
        <a href="/" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Dashboard
        </a>
    </div>

    <script>
        document.getElementById('subscribeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email');
            const submitBtn = document.getElementById('submitBtn');
            const messageEl = document.getElementById('message');
            
            const email = emailInput.value.trim();
            if (!email) return;

            // Reset state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Subscribing...';
            messageEl.className = 'message';
            messageEl.textContent = '';

            try {
                const response = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email }),
                });

                const data = await response.json();

                if (response.ok) {
                    messageEl.className = 'message success';
                    messageEl.textContent = 'Successfully subscribed!';
                    emailInput.value = '';
                } else {
                    messageEl.className = 'message error';
                    messageEl.textContent = data.error || 'Failed to subscribe. Please try again.';
                }
            } catch (error) {
                messageEl.className = 'message error';
                messageEl.textContent = 'A network error occurred. Please try again later.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Subscribe Now';
            }
        });
    </script>
</body>
</html>
`;

import { NotificationBroadcaster, ScanReport } from "./broadcaster";
import { Challenge, Env } from "../types";

export class ExpoBroadcaster implements NotificationBroadcaster {
    readonly id = "expo";
    readonly name = "Expo Push Notifications";

    /**
     * Resolves push tokens:
     * 1. Reads from scan_state WHERE key = 'expo_push_token'.
     * 2. Queries persistent push_subscribers table.
     * 3. Falls back to static env var.
     * 4. ON THE FLY SELF-HEALING: If scan_state was cleared or missing the token,
     *    automatically re-inserts it back into scan_state!
     */
    private async resolveTokens(env: Env): Promise<string[]> {
        const tokens = new Set<string>();

        // 1. Check scan_state first
        try {
            const row = await env.DB.prepare(
                "SELECT value FROM scan_state WHERE key = 'expo_push_token'"
            ).first() as { value: string } | null;
            if (row?.value) {
                tokens.add(row.value);
            }
        } catch (e) {
            console.error("Failed to read expo_push_token from DB:", e);
        }

        // 2. Query persistent push_subscribers table
        try {
            const rows = await env.DB.prepare(
                "SELECT token FROM push_subscribers ORDER BY last_seen_at DESC"
            ).all() as { results?: { token: string }[] };
            if (rows?.results) {
                for (const r of rows.results) {
                    if (r.token) tokens.add(r.token);
                }
            }
        } catch (e) {
            // Table might not exist yet if before migration
        }

        // 3. Fallback to static env var
        if (tokens.size === 0 && env.EXPO_PUSH_TOKEN) {
            tokens.add(env.EXPO_PUSH_TOKEN);
        }

        // 4. On-the-fly self-healing: if scan_state is missing the token, restore it now!
        if (tokens.size > 0) {
            const primaryToken = Array.from(tokens)[0];
            try {
                const check = await env.DB.prepare(
                    "SELECT value FROM scan_state WHERE key = 'expo_push_token'"
                ).first() as { value: string } | null;
                if (!check?.value) {
                    await env.DB.prepare(
                        "INSERT INTO scan_state (key, value) VALUES ('expo_push_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                    ).bind(primaryToken).run();
                    console.log("Self-healed expo_push_token into scan_state on the fly:", primaryToken);
                }
            } catch (e) {
                console.error("Failed to self-heal expo_push_token into scan_state:", e);
            }
        }

        return Array.from(tokens);
    }

    /**
     * Resolves a single primary token (for backward compatibility).
     */
    private async resolveToken(env: Env): Promise<string | null> {
        const tokens = await this.resolveTokens(env);
        return tokens.length > 0 ? tokens[0] : null;
    }

    /**
     * Sends a message via Expo Push API and validates the response body
     * for per-ticket errors (e.g. DeviceNotRegistered, InvalidCredentials).
     */
    private async sendExpoPush(message: Record<string, any>): Promise<void> {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Expo Push returned HTTP ${response.status}: ${errorBody}`);
            return;
        }

        // Expo can return HTTP 200 but with per-ticket errors in the body
        try {
            const body = await response.json() as { data?: { status?: string; message?: string; details?: { error?: string } } };
            if (body?.data?.status === "error") {
                const errorType = body.data.details?.error ?? "unknown";
                console.error(`Expo Push ticket error [${errorType}]: ${body.data.message}`);
                if (errorType === "DeviceNotRegistered") {
                    console.error("The push token is no longer valid. The device may have uninstalled the app or the token has expired. Update EXPO_PUSH_TOKEN or re-register from the app.");
                }
            }
        } catch (e) {
            // Response wasn't JSON; already handled HTTP error above
        }
    }

    private async sendToTokens(env: Env, createMessage: (token: string) => Record<string, any>): Promise<void> {
        const tokens = await this.resolveTokens(env);
        if (tokens.length === 0) return;

        const promises = tokens.map(token => this.sendExpoPush(createMessage(token)));
        await Promise.allSettled(promises);
    }

    async notify(env: Env, challenge: Challenge): Promise<void> {
        await this.sendToTokens(env, (token) => ({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: `Strava Challenge: ${challenge.title}`,
            body: challenge.description,
            data: { url: challenge.url, id: challenge.id, imageUrl: challenge.imageUrl },
        }));
    }

    async notifyBatched(env: Env, challenges: Challenge[]): Promise<void> {
        if (challenges.length === 0) return;
        
        let title = `${challenges.length} new challenges found!`;
        if (challenges.length === 1) {
            title = `Strava Challenge: ${challenges[0].title}`;
        }
        
        let body = challenges.map(c => c.title).slice(0, 3).join(", ");
        if (challenges.length > 3) {
            body += `... and ${challenges.length - 3} more!`;
        }

        await this.sendToTokens(env, (token) => ({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: title,
            body: body,
            data: { type: 'new_challenges', ids: challenges.map(c => c.id) },
        }));
    }

    async sendScanReport(env: Env, result: ScanReport, idsScanned: number[]): Promise<void> {
        await this.sendToTokens(env, (token) => ({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: 'Scan Complete',
            body: `Found: ${result.found}, Missing: ${result.missing}, Errors: ${result.errors}, Checked: ${idsScanned.length}`,
            data: { type: 'report' },
        }));
    }
}

import { NotificationBroadcaster, ScanReport } from "./broadcaster";
import { Challenge, Env } from "../types";

export class ExpoBroadcaster implements NotificationBroadcaster {
    readonly id = "expo";
    readonly name = "Expo Push Notifications";

    /**
     * Resolves the push token: prefers the dynamically-registered token from DB,
     * falls back to the static env var.
     */
    private async resolveToken(env: Env): Promise<string | null> {
        try {
            const row = await env.DB.prepare(
                "SELECT value FROM scan_state WHERE key = 'expo_push_token'"
            ).first() as { value: string } | null;
            if (row?.value) return row.value;
        } catch (e) {
            console.error("Failed to read expo_push_token from DB:", e);
        }
        return env.EXPO_PUSH_TOKEN || null;
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

    async notify(env: Env, challenge: Challenge): Promise<void> {
        const token = await this.resolveToken(env);
        if (!token) return;

        await this.sendExpoPush({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: `Strava Challenge: ${challenge.title}`,
            body: challenge.description,
            data: { url: challenge.url, id: challenge.id, imageUrl: challenge.imageUrl },
        });
    }

    async notifyBatched(env: Env, challenges: Challenge[]): Promise<void> {
        const token = await this.resolveToken(env);
        if (!token || challenges.length === 0) return;
        
        let title = `${challenges.length} new challenges found!`;
        if (challenges.length === 1) {
            title = `Strava Challenge: ${challenges[0].title}`;
        }
        
        let body = challenges.map(c => c.title).slice(0, 3).join(", ");
        if (challenges.length > 3) {
            body += `... and ${challenges.length - 3} more!`;
        }

        await this.sendExpoPush({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: title,
            body: body,
            data: { type: 'new_challenges', ids: challenges.map(c => c.id) },
        });
    }

    async sendScanReport(env: Env, result: ScanReport, idsScanned: number[]): Promise<void> {
        const token = await this.resolveToken(env);
        if (!token) return;

        await this.sendExpoPush({
            to: token,
            sound: 'default',
            channelId: 'default',
            title: 'Scan Complete',
            body: `Found: ${result.found}, Missing: ${result.missing}, Errors: ${result.errors}, Checked: ${idsScanned.length}`,
            data: { type: 'report' },
        });
    }
}

import { NotificationBroadcaster, ScanReport } from "./broadcaster";
import { ExpoBroadcaster } from "./expo";
import { TelegramBroadcaster } from "./telegram";
import { EmailBroadcaster } from "./email";
import { Challenge, Env } from "../types";

export class NotificationDispatcher {
    public broadcasters: NotificationBroadcaster[] = [
        new ExpoBroadcaster(),
        new TelegramBroadcaster(),
        new EmailBroadcaster(),
    ];

    private async isEnabled(env: Env, key: string): Promise<boolean> {
        const row = await env.DB.prepare("SELECT value FROM scan_state WHERE key = ?").bind(key).first() as { value: string } | null;
        if (!row) return true;
        return row.value === "true";
    }

    async notify(env: Env, challenge: Challenge): Promise<void> {
        const promises = this.broadcasters.map(async b => {
            if (await this.isEnabled(env, `notify_${b.id}_enabled`)) {
                await b.notify(env, challenge);
            }
        });
        await Promise.allSettled(promises);
    }

    async notifyBatched(env: Env, challenges: Challenge[]): Promise<void> {
        const promises = this.broadcasters.map(async b => {
            if (await this.isEnabled(env, `notify_${b.id}_enabled`)) {
                await b.notifyBatched(env, challenges);
            }
        });
        await Promise.allSettled(promises);
    }

    async sendScanReport(env: Env, result: ScanReport, idsScanned: number[]): Promise<void> {
        const promises = this.broadcasters.map(async b => {
            if (await this.isEnabled(env, `notify_${b.id}_enabled`)) {
                await b.sendScanReport(env, result, idsScanned);
            }
        });
        await Promise.allSettled(promises);
    }
}

export const notifications = new NotificationDispatcher();

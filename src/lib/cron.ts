import cron from "node-cron";
import { prisma } from "./db";
import { isSyncRunning, runSync } from "./sync";

let task: cron.ScheduledTask | null = null;
let started = false;

export async function startCron() {
  if (started) return;
  started = true;
  // Fires at minute 0 of every hour. The job itself decides whether to actually run.
  task = cron.schedule("0 * * * *", async () => {
    try {
      const enabled = await prisma.appSetting.findUnique({ where: { key: "cron_enabled" } });
      if (enabled?.value !== "true") return;
      if (await isSyncRunning()) return;
      if (!process.env.HUBSPOT_TOKEN) return;
      await runSync("cron");
    } catch (e) {
      console.error("[cron] sync failed:", e);
    }
  });
  task.start();
  console.log("[cron] hourly sync scheduler started");
}

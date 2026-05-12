export async function register() {
  // Skip the in-process cron on serverless platforms. node-cron schedules work
  // only inside a long-lived process — on Vercel each invocation is a fresh
  // container, so the scheduled callback would never fire. For periodic sync
  // on Vercel, wire a Vercel Cron pointing at /api/sync.
  if (process.env.VERCEL) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCron } = await import("./lib/cron");
    await startCron();
  }
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    // No password configured = open access. Return success so the cookie is
    // set; middleware also short-circuits in this state, so behavior is
    // consistent in both directions.
    return NextResponse.json({ ok: true });
  }
  const body = await req.json().catch(() => ({}));
  const given = String(body.password ?? "");
  if (given !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  // Auth cookie stores the password directly so middleware can do a constant
  // string compare without a separate session store. Cheap, single-secret
  // model — same security as Vercel's password protection.
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sp_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

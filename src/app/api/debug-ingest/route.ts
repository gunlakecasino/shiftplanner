import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** Dev-only NDJSON sink for debug-mode instrumentation (session log files under .cursor/). */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const sessionId = req.headers.get("X-Debug-Session-Id") || "unknown";
  const line = await req.text();
  const dir = path.join(process.cwd(), ".cursor");
  const logPath = path.join(dir, `debug-${sessionId}.log`);

  await mkdir(dir, { recursive: true });
  await appendFile(logPath, `${line.trim()}\n`, "utf8");

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import high from "@/tests/sample-invoice-high-confidence.json";
import low from "@/tests/sample-invoice-low-confidence.json";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "high";

  if (mode === "low") {
    return NextResponse.json({ data: low, source: "mock-low" });
  }

  return NextResponse.json({ data: high, source: "mock-high" });
}

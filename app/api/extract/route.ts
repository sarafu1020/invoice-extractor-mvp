import { NextResponse } from "next/server";
import OpenAI from "openai";
import { invoiceSchema, normalizeDate } from "@/lib/schema";

export const runtime = "nodejs";

const SCHEMA_PROMPT = `Extract invoice data and return ONLY valid JSON with this exact schema:
{
  "invoice_no": "string",
  "invoice_date": "YYYY-MM-DD",
  "shipper_name": "string",
  "consignee_name": "string",
  "total_amount": number,
  "currency": "string",
  "items": [{"description":"string","quantity":number,"unit_price":number}],
  "confidence_score": number,
  "low_confidence_fields": ["string"]
}`;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다.", error_code: "NO_FILE" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY 미설정", error_code: "NO_API_KEY" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const bytes = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");

    let raw = "{}";

    if (isPdf) {
      // PDF 텍스트 추출 기반 처리 (MVP)
      const pdfParse = (await import("pdf-parse")).default;
      const parsedPdf = await pdfParse(bytes);
      const fullText = parsedPdf?.text || "";
      const pages = fullText.split("\f").filter(Boolean);
      const pageText = (pages.length ? pages : [fullText])
        .slice(0, 10)
        .map((p, i) => `--- PAGE ${i + 1} ---\n${p}`)
        .join("\n\n")
        .slice(0, 24000);

      if (!pageText.trim()) {
        return NextResponse.json(
          { error: "PDF 파싱 실패 - 문서를 다시 업로드해주세요", error_code: "PDF_PARSE_FAILED" },
          { status: 422 }
        );
      }

      const res = await client.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `${SCHEMA_PROMPT}\n\nInvoice text (${Math.max(1, pages.length)} pages):\n${pageText}`,
          },
        ],
        response_format: { type: "json_object" },
      });
      raw = res.choices?.[0]?.message?.content || "{}";
    } else {
      // 이미지 OCR + 구조화
      const b64 = bytes.toString("base64");
      const dataUrl = `data:${file.type};base64,${b64}`;
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SCHEMA_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      raw = res.choices?.[0]?.message?.content || "{}";
    }

    const parsed = JSON.parse(raw);
    const validated = invoiceSchema.parse(parsed);
    validated.invoice_date = normalizeDate(validated.invoice_date);

    return NextResponse.json({ data: validated });
  } catch (e: any) {
    return NextResponse.json(
      { error: `API 응답 지연/파싱 실패: ${e?.message || "unknown"}`, error_code: "EXTRACT_FAILED" },
      { status: 500 }
    );
  }
}

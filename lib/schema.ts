import { z } from "zod";

export const invoiceItemSchema = z.object({
  description: z.string().default(""),
  quantity: z.number().nonnegative().default(0),
  unit_price: z.number().nonnegative().default(0),
});

export const invoiceSchema = z.object({
  invoice_no: z.string().default(""),
  invoice_date: z.string().default(""),
  shipper_name: z.string().default(""),
  consignee_name: z.string().default(""),
  total_amount: z.number().nonnegative().default(0),
  currency: z.string().default(""),
  items: z.array(invoiceItemSchema).default([]),
  confidence_score: z.number().min(0).max(100).default(0),
  low_confidence_fields: z.array(z.string()).default([]),
});

export function normalizeDate(input: string): string {
  const m = input?.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

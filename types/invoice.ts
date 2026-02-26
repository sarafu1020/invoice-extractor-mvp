export type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
};

export type InvoiceData = {
  invoice_no: string;
  invoice_date: string;
  shipper_name: string;
  consignee_name: string;
  total_amount: number;
  currency: string;
  items: InvoiceItem[];
  confidence_score: number;
  low_confidence_fields: string[];
};

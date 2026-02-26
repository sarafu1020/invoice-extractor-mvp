"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Item = { description: string; quantity: number; unit_price: number };
type AuditLog = { at: string; field: string; oldValue: string; newValue: string };
type Data = {
  invoice_no: string;
  invoice_date: string;
  shipper_name: string;
  consignee_name: string;
  total_amount: number;
  currency: string;
  items: Item[];
  confidence_score: number;
  low_confidence_fields: string[];
};

const emptyData: Data = {
  invoice_no: "",
  invoice_date: "",
  shipper_name: "",
  consignee_name: "",
  total_amount: 0,
  currency: "",
  items: [],
  confidence_score: 0,
  low_confidence_fields: [],
};

function mapErrorMessage(code?: string, fallback?: string) {
  switch (code) {
    case "NO_FILE":
      return "파일이 없습니다. PDF/JPG 파일을 다시 선택해주세요.";
    case "PDF_PARSE_FAILED":
      return "PDF 파싱 실패 - 스캔 품질을 확인하거나 이미지로 다시 업로드해주세요.";
    case "NO_API_KEY":
      return "서버 설정 오류(OPENAI_API_KEY). 관리자에게 문의하세요.";
    case "EXTRACT_FAILED":
      return "API 응답 지연 - 문서를 다시 업로드해주세요.";
    default:
      return fallback || "처리 중 오류가 발생했습니다.";
  }
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("대기");
  const [error, setError] = useState("");
  const [data, setData] = useState<Data>(emptyData);
  const [confirmed, setConfirmed] = useState(false);
  const [lowReviewed, setLowReviewed] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const low = useMemo(() => new Set(data.low_confidence_fields || []), [data]);
  const hasLow = (data.low_confidence_fields || []).length > 0;
  const canDownload = confirmed && (!hasLow || lowReviewed);

  async function onUpload(f?: File) {
    if (!f) return;
    setError("");
    setStatus("업로드 중");
    setFile(f);

    const body = new FormData();
    body.append("file", f);

    try {
      setStatus("AI 데이터 추출 중");
      const res = await fetch("/api/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(mapErrorMessage(json?.error_code, json?.error || "추출 실패"));
        setStatus("오류");
        return;
      }
      setData(json.data);
      setStatus("인간 검증 대기");
      setConfirmed(false);
      setLowReviewed(false);
      setAuditLogs([]);

      const lowFields: string[] = json?.data?.low_confidence_fields || [];
      if (lowFields.length) {
        setTimeout(() => {
          const el = document.querySelector(`[data-field="${lowFields[0]}"]`) as HTMLElement | null;
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 100);
      }
    } catch (e: any) {
      setError(mapErrorMessage("EXTRACT_FAILED", e.message));
      setStatus("오류");
    }
  }

  function cellStyle(field: string): React.CSSProperties {
    return low.has(field)
      ? { border: "2px solid #dc2626", background: "#fee2e2" }
      : {};
  }

  function pushAudit(field: string, oldValue: unknown, newValue: unknown) {
    if (String(oldValue) === String(newValue)) return;
    setAuditLogs((prev) => [
      ...prev,
      {
        at: new Date().toISOString(),
        field,
        oldValue: String(oldValue ?? ""),
        newValue: String(newValue ?? ""),
      },
    ]);
  }

  function updateField<K extends keyof Data>(field: K, value: Data[K]) {
    const old = data[field];
    pushAudit(String(field), old, value);
    setData({ ...data, [field]: value });
  }

  function updateItem(i: number, field: keyof Item, value: string | number) {
    const items = [...(data.items || [])];
    const old = items[i]?.[field];
    items[i] = { ...items[i], [field]: value } as Item;
    pushAudit(`items[${i}].${String(field)}`, old, value);
    setData({ ...data, items });
  }

  function exportExcel() {
    const sheet1 = XLSX.utils.json_to_sheet([
      {
        invoice_no: data.invoice_no,
        invoice_date: data.invoice_date,
        shipper_name: data.shipper_name,
        consignee_name: data.consignee_name,
        total_amount: data.total_amount,
        currency: data.currency,
        confidence_score: data.confidence_score,
        low_confidence_fields: data.low_confidence_fields.join(", "),
      },
    ]);
    const sheet2 = XLSX.utils.json_to_sheet(data.items || []);
    const meta = XLSX.utils.json_to_sheet([
      {
        exported_at: new Date().toISOString(),
        confirmed: confirmed ? "Y" : "N",
        low_confidence_reviewed: lowReviewed ? "Y" : "N",
        confidence_score: data.confidence_score,
      },
      ...auditLogs.map((a) => ({
        exported_at: a.at,
        confirmed: "AUDIT",
        low_confidence_reviewed: a.field,
        confidence_score: `${a.oldValue} -> ${a.newValue}`,
      })),
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet1, "invoice");
    XLSX.utils.book_append_sheet(wb, sheet2, "items");
    XLSX.utils.book_append_sheet(wb, meta, "metadata");
    XLSX.writeFile(wb, "invoice_verified.xlsx");
    setStatus("완료");
  }

  return (
    <main style={{ padding: 16 }}>
      <h2>Invoice Extractor MVP</h2>

      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => onUpload(e.target.files?.[0])} />
        <b>상태: {status}</b>
      </div>
      {error && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section style={{ background: "white", borderRadius: 10, padding: 12 }}>
          <h4>원본 문서</h4>
          {file ? (
            <div>
              <div style={{ marginBottom: 8 }}>파일: {file.name}</div>
              {file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={URL.createObjectURL(file)} alt="preview" style={{ width: "100%", maxHeight: 700, objectFit: "contain" }} />
              ) : (
                <div>PDF 미리보기는 추후 구현 (현재 추출 API는 이미지 우선)</div>
              )}
            </div>
          ) : (
            <div>파일 업로드 대기</div>
          )}
        </section>

        <section style={{ background: "white", borderRadius: 10, padding: 12 }}>
          <h4>추출 데이터(수정 가능)</h4>
          <div style={{ display: "grid", gap: 6 }}>
            <input data-field="invoice_no" style={cellStyle("invoice_no")} value={data.invoice_no} onChange={(e) => updateField("invoice_no", e.target.value)} placeholder="invoice_no" />
            <input data-field="invoice_date" style={cellStyle("invoice_date")} value={data.invoice_date} onChange={(e) => updateField("invoice_date", e.target.value)} placeholder="invoice_date" />
            <input data-field="shipper_name" style={cellStyle("shipper_name")} value={data.shipper_name} onChange={(e) => updateField("shipper_name", e.target.value)} placeholder="shipper_name" />
            <input data-field="consignee_name" style={cellStyle("consignee_name")} value={data.consignee_name} onChange={(e) => updateField("consignee_name", e.target.value)} placeholder="consignee_name" />
            <input data-field="total_amount" style={cellStyle("total_amount")} type="number" value={data.total_amount} onChange={(e) => updateField("total_amount", Number(e.target.value || 0))} placeholder="total_amount" />
            <input data-field="currency" style={cellStyle("currency")} value={data.currency} onChange={(e) => updateField("currency", e.target.value)} placeholder="currency" />
            <div>confidence_score: {data.confidence_score}</div>
            <div>low_confidence_fields: {data.low_confidence_fields.join(", ") || "없음"}</div>
          </div>

          <hr style={{ margin: "12px 0" }} />
          <h5>Items</h5>
          {(data.items || []).map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
              <input value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="description" />
              <input type="number" value={it.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value || 0))} placeholder="quantity" />
              <input type="number" value={it.unit_price} onChange={(e) => updateItem(i, "unit_price", Number(e.target.value || 0))} placeholder="unit_price" />
            </div>
          ))}

          <label style={{ display: "block", marginTop: 12 }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            &nbsp;데이터 검증 완료 및 승인(Confirm)
          </label>

          {hasLow && (
            <label style={{ display: "block", marginTop: 8, color: "#b91c1c" }}>
              <input type="checkbox" checked={lowReviewed} onChange={(e) => setLowReviewed(e.target.checked)} />
              &nbsp;저신뢰 필드({data.low_confidence_fields.length}개) 확인 완료
            </label>
          )}

          <button
            onClick={exportExcel}
            disabled={!canDownload}
            style={{ marginTop: 10, padding: "8px 12px", cursor: canDownload ? "pointer" : "not-allowed" }}
          >
            엑셀 다운로드
          </button>

          <div style={{ marginTop: 12 }}>
            <b>수정 이력(Audit): {auditLogs.length}건</b>
            {auditLogs.length > 0 && (
              <div style={{ maxHeight: 140, overflow: "auto", fontSize: 12, marginTop: 6, background: "#f8fafc", padding: 8, borderRadius: 8 }}>
                {auditLogs.slice(-10).map((a, i) => (
                  <div key={i}>[{a.at}] {a.field}: {a.oldValue} → {a.newValue}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

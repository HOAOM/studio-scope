import ExcelJS from 'exceljs';
import { getCategoryLabel } from './categories';

const CATEGORY_COLORS: Record<string, string> = {
  'joinery': 'FFE0B97A',
  'loose-furniture': 'FFB8D4F0',
  'lighting': 'FFFFE082',
  'finishes': 'FFD7BDE2',
  'ffe': 'FFA3E4D7',
  'accessories': 'FFF5B7B1',
  'appliances': 'FFAED6F1',
  'hvac': 'FFFAD7A0',
  'electrical': 'FFF9E79F',
  'plumbing': 'FFAED6F1',
  'fire-protection': 'FFF5B7B1',
  'low-voltage': 'FFD2B4DE',
  'sanitary': 'FFA9DFBF',
};

const HEADER_FILL = 'FF1F2937';
const ALT_ROW_FILL = 'FFF8FAFC';
const SUBTOTAL_FILL = 'FF374151';
const TOTAL_FILL = 'FF111827';

const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

function fill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportBOQToExcel(
  project: any,
  items: any[],
  companySettings: any
): Promise<void> {
  const companyName = companySettings?.company_name || 'Studio';
  const sorted = [...items].sort((a, b) =>
    String(a.category || '').localeCompare(String(b.category || ''))
  );

  const grouped = new Map<string, any[]>();
  for (const it of sorted) {
    const k = it.category || 'uncategorized';
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(it);
  }

  const headers = [
    '#', 'Categoria', 'Area', 'Descrizione', 'Fornitore', 'Qtà',
    'Budget Unit. €', 'Costo Unit. €', 'Tot. Budget €', 'Tot. Costo €',
    'Stato', 'Lifecycle',
  ];
  const NCOLS = headers.length;
  const lastColLetter = 'L';

  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet('BOQ Completo');

  // Column widths
  const widths = [5, 18, 14, 40, 22, 8, 14, 14, 14, 14, 14, 18];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = Math.max(10, Math.min(40, w));
  });
  // Force narrow ones below min for #/Qtà
  ws.getColumn(1).width = 6;
  ws.getColumn(6).width = 8;

  // Row 1: company name
  ws.mergeCells(`A1:${lastColLetter}1`);
  const r1 = ws.getCell('A1');
  r1.value = companyName;
  r1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  r1.fill = fill(HEADER_FILL);
  r1.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 22;

  // Row 2: BOQ title
  ws.mergeCells(`A2:${lastColLetter}2`);
  const r2 = ws.getCell('A2');
  r2.value = `BILL OF QUANTITIES — ${project?.name || ''}`;
  r2.font = { bold: true, size: 12 };
  r2.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 3: meta
  ws.mergeCells(`A3:${lastColLetter}3`);
  const r3 = ws.getCell('A3');
  r3.value = `Cliente: ${project?.client || ''} | Data: ${new Date().toLocaleDateString('it-IT')} | Rev.: ${project?.boq_version ?? ''}`;
  r3.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };

  // Row 4 empty separator
  ws.addRow([]);

  // Row 5: header
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(HEADER_FILL);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF374151' } },
      bottom: { style: 'thin', color: { argb: 'FF374151' } },
    };
  });
  headerRow.height = 20;

  let progressive = 0;
  let grandBudget = 0;
  let grandCost = 0;

  const numericCols = new Set([6, 7, 8, 9, 10]); // 1-indexed: Qtà, Budget U, Costo U, Tot Budget, Tot Costo
  const currencyCols = new Set([7, 8, 9, 10]);

  for (const [cat, list] of grouped) {
    const catBudget = list.reduce(
      (s, it) => s + num(it.budget_unit_cost) * num(it.quantity || 1), 0
    );
    const catCost = list.reduce(
      (s, it) => s + num(it.unit_cost) * num(it.quantity || 1), 0
    );
    grandBudget += catBudget;
    grandCost += catCost;

    // Category separator row
    const catFill = CATEGORY_COLORS[cat] || 'FFE5E7EB';
    const catRow = ws.addRow(['', getCategoryLabel(cat), '', '', '', '', '', '', '', '', '', '']);
    catRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > NCOLS) return;
      cell.font = { bold: true, size: 11 };
      cell.fill = fill(catFill);
    });

    // Data rows
    list.forEach((it, idx) => {
      progressive += 1;
      const qty = num(it.quantity || 1);
      const totBudget = num(it.budget_unit_cost) * qty;
      const totCost = num(it.unit_cost) * qty;
      const row = ws.addRow([
        progressive,
        getCategoryLabel(it.category),
        it.area || '',
        it.description || '',
        it.supplier || '',
        qty,
        it.budget_unit_cost ?? null,
        it.unit_cost ?? null,
        it.budget_unit_cost ? totBudget : null,
        it.unit_cost ? totCost : null,
        it.approval_status || '',
        it.lifecycle_status || '',
      ]);
      const isAlt = idx % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > NCOLS) return;
        if (isAlt) cell.fill = fill(ALT_ROW_FILL);
        if (numericCols.has(col)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = currencyCols.has(col) ? '€ #,##0.00;[Red]-€ #,##0.00;-' : '#,##0.00';
        } else {
          cell.alignment = { vertical: 'middle', wrapText: col === 4 };
        }
      });
    });

    // Subtotal row per category
    const subRow = ws.addRow(['', `Subtotale ${getCategoryLabel(cat)}`, '', '', '', '', '', '', catBudget, catCost, '', '']);
    subRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > NCOLS) return;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = fill(SUBTOTAL_FILL);
      if (currencyCols.has(col)) {
        cell.numFmt = '€ #,##0.00;[Red]-€ #,##0.00;-';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });
  }

  // Empty separator
  ws.addRow([]);

  // Grand total
  const totalRow = ws.addRow(['', 'TOTALE GENERALE', '', '', '', '', '', '', grandBudget, grandCost, '', '']);
  totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > NCOLS) return;
    cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(TOTAL_FILL);
    cell.border = { top: { style: 'medium', color: { argb: 'FF000000' } } };
    if (currencyCols.has(col)) {
      cell.numFmt = '€ #,##0.00;[Red]-€ #,##0.00;-';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
  });
  totalRow.height = 22;

  // Freeze top header
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  // ─────────────────────────────────────────
  // Riepilogo sheet
  // ─────────────────────────────────────────
  const ws2 = wb.addWorksheet('Riepilogo');
  const sumHeaders = ['Categoria', 'N. Item', 'Tot. Budget €', 'Tot. Costo €', 'Scostamento €', 'Scostamento %'];
  [20, 10, 16, 16, 16, 14].forEach((w, i) => {
    ws2.getColumn(i + 1).width = Math.max(10, Math.min(40, w));
  });

  const sumHeaderRow = ws2.addRow(sumHeaders);
  sumHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(HEADER_FILL);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  for (const [cat, list] of grouped) {
    const catBudget = list.reduce((s, it) => s + num(it.budget_unit_cost) * num(it.quantity || 1), 0);
    const catCost = list.reduce((s, it) => s + num(it.unit_cost) * num(it.quantity || 1), 0);
    const delta = catCost - catBudget;
    const deltaPct = catBudget > 0 ? delta / catBudget : 0;
    const row = ws2.addRow([getCategoryLabel(cat), list.length, catBudget, catCost, delta, deltaPct]);
    const rowColor = deltaPct <= 0 ? 'FFD1FAE5' : deltaPct <= 0.1 ? 'FFFEF3C7' : 'FFFEE2E2';
    row.eachCell((cell, col) => {
      if (col >= 5) cell.fill = fill(rowColor);
      if (col === 3 || col === 4 || col === 5) {
        cell.numFmt = '€ #,##0.00;[Red]-€ #,##0.00;-';
        cell.alignment = { horizontal: 'right' };
      }
      if (col === 6) {
        cell.numFmt = '0.0%';
        cell.alignment = { horizontal: 'right' };
      }
    });
  }

  ws2.addRow([]);
  const totDelta = grandCost - grandBudget;
  const totDeltaPct = grandBudget > 0 ? totDelta / grandBudget : 0;
  const totRow = ws2.addRow(['TOTALE', sorted.length, grandBudget, grandCost, totDelta, totDeltaPct]);
  totRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(TOTAL_FILL);
    if (col === 3 || col === 4 || col === 5) {
      cell.numFmt = '€ #,##0.00;[Red]-€ #,##0.00;-';
      cell.alignment = { horizontal: 'right' };
    }
    if (col === 6) {
      cell.numFmt = '0.0%';
      cell.alignment = { horizontal: 'right' };
    }
  });

  // Write file
  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  const code = project?.code || project?.project_code || 'PROJECT';
  downloadBuffer(buffer as ArrayBuffer, `${code}-BOQ-${date}.xlsx`);
}

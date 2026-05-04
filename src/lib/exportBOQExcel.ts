import { utils, writeFile, type WorkSheet } from 'xlsx';
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
const TOTAL_FILL = 'FF111827';

const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

function setCell(ws: WorkSheet, addr: string, value: any, style: any) {
  if (!ws[addr]) ws[addr] = { t: typeof value === 'number' ? 'n' : 's', v: value };
  ws[addr].s = style;
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

  // Group by category
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

  const aoa: any[][] = [];
  aoa.push([companyName]);
  aoa.push([`BILL OF QUANTITIES — ${project?.name || ''}`]);
  aoa.push([
    `Cliente: ${project?.client || ''} | Data: ${new Date().toLocaleDateString('it-IT')} | Rev.: ${project?.boq_version ?? ''}`,
  ]);
  aoa.push([]);
  aoa.push(headers);

  // track rows for styling
  const categoryRows: { row: number; category: string }[] = [];
  const dataRows: number[] = [];

  let progressive = 0;
  let grandBudget = 0;
  let grandCost = 0;

  for (const [cat, list] of grouped) {
    const catBudget = list.reduce(
      (s, it) => s + num(it.budget_unit_cost) * num(it.quantity || 1),
      0
    );
    const catCost = list.reduce(
      (s, it) => s + num(it.unit_cost) * num(it.quantity || 1),
      0
    );
    grandBudget += catBudget;
    grandCost += catCost;

    aoa.push(['', getCategoryLabel(cat), '', '', '', '', '', '', catBudget, catCost, '', '']);
    categoryRows.push({ row: aoa.length - 1, category: cat });

    for (const it of list) {
      progressive += 1;
      const qty = num(it.quantity || 1);
      const totBudget = num(it.budget_unit_cost) * qty;
      const totCost = num(it.unit_cost) * qty;
      aoa.push([
        progressive,
        getCategoryLabel(it.category),
        it.area || '',
        it.description || '',
        it.supplier || '',
        qty,
        it.budget_unit_cost ?? '',
        it.unit_cost ?? '',
        it.budget_unit_cost ? totBudget : '',
        it.unit_cost ? totCost : '',
        it.approval_status || '',
        it.lifecycle_status || '',
      ]);
      dataRows.push(aoa.length - 1);
    }
  }

  aoa.push([]);
  aoa.push(['', 'TOTALE GENERALE', '', '', '', '', '', '', grandBudget, grandCost, '', '']);
  const totalRowIdx = aoa.length - 1;

  const ws = utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = [
    { wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 22 }, { wch: 6 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
  ];

  // Merges for title rows
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 11 } },
  ];

  const colLetters = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  // Title styles
  setCell(ws, 'A1', companyName, {
    font: { bold: true, sz: 14, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: HEADER_FILL }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  });
  setCell(ws, 'A2', `BILL OF QUANTITIES — ${project?.name || ''}`, {
    font: { bold: true, sz: 12 },
  });
  setCell(ws, 'A3', aoa[2][0], { font: { italic: true, sz: 10, color: { rgb: 'FF6B7280' } } });

  // Header row (row index 4 → Excel row 5)
  for (let c = 0; c < headers.length; c++) {
    const addr = `${colLetters[c]}5`;
    setCell(ws, addr, headers[c], {
      font: { bold: true, color: { rgb: 'FFFFFFFF' } },
      fill: { fgColor: { rgb: HEADER_FILL }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'FF374151' } },
        bottom: { style: 'thin', color: { rgb: 'FF374151' } },
      },
    });
  }

  // Category header rows
  for (const { row, category } of categoryRows) {
    const fill = CATEGORY_COLORS[category] || 'FFE5E7EB';
    for (let c = 0; c < headers.length; c++) {
      const addr = `${colLetters[c]}${row + 1}`;
      setCell(ws, addr, ws[addr]?.v ?? '', {
        font: { bold: true, sz: 11 },
        fill: { fgColor: { rgb: fill }, patternType: 'solid' },
        numFmt: c === 8 || c === 9 ? '€#,##0.00' : undefined,
      });
    }
  }

  // Data rows alt fill
  dataRows.forEach((r, i) => {
    const isAlt = i % 2 === 1;
    for (let c = 0; c < headers.length; c++) {
      const addr = `${colLetters[c]}${r + 1}`;
      setCell(ws, addr, ws[addr]?.v ?? '', {
        fill: isAlt ? { fgColor: { rgb: ALT_ROW_FILL }, patternType: 'solid' } : undefined,
        numFmt: c === 6 || c === 7 || c === 8 || c === 9 ? '€#,##0.00' : undefined,
        alignment: { vertical: 'center', wrapText: c === 3 },
      });
    }
  });

  // Total row
  for (let c = 0; c < headers.length; c++) {
    const addr = `${colLetters[c]}${totalRowIdx + 1}`;
    setCell(ws, addr, ws[addr]?.v ?? '', {
      font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 12 },
      fill: { fgColor: { rgb: TOTAL_FILL }, patternType: 'solid' },
      numFmt: c === 8 || c === 9 ? '€#,##0.00' : undefined,
      border: {
        top: { style: 'medium', color: { rgb: 'FF000000' } },
      },
    });
  }

  // Riepilogo sheet
  const sumHeaders = ['Categoria', 'N. Item', 'Tot. Budget €', 'Tot. Costo €', 'Scostamento €', 'Scostamento %'];
  const sumAoa: any[][] = [sumHeaders];
  for (const [cat, list] of grouped) {
    const catBudget = list.reduce((s, it) => s + num(it.budget_unit_cost) * num(it.quantity || 1), 0);
    const catCost = list.reduce((s, it) => s + num(it.unit_cost) * num(it.quantity || 1), 0);
    const delta = catCost - catBudget;
    const deltaPct = catBudget > 0 ? delta / catBudget : 0;
    sumAoa.push([getCategoryLabel(cat), list.length, catBudget, catCost, delta, deltaPct]);
  }
  const totDelta = grandCost - grandBudget;
  const totDeltaPct = grandBudget > 0 ? totDelta / grandBudget : 0;
  sumAoa.push([]);
  sumAoa.push(['TOTALE', sorted.length, grandBudget, grandCost, totDelta, totDeltaPct]);

  const ws2 = utils.aoa_to_sheet(sumAoa);
  ws2['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];

  for (let c = 0; c < sumHeaders.length; c++) {
    const addr = `${colLetters[c]}1`;
    setCell(ws2, addr, sumHeaders[c], {
      font: { bold: true, color: { rgb: 'FFFFFFFF' } },
      fill: { fgColor: { rgb: HEADER_FILL }, patternType: 'solid' },
      alignment: { horizontal: 'center' },
    });
  }
  for (let r = 1; r < sumAoa.length; r++) {
    if (!sumAoa[r] || sumAoa[r].length === 0) continue;
    const isTotal = sumAoa[r][0] === 'TOTALE';
    const deltaPct = Number(sumAoa[r][5]) || 0;
    const rowColor = deltaPct <= 0
      ? 'FFD1FAE5'
      : deltaPct <= 0.1
      ? 'FFFEF3C7'
      : 'FFFEE2E2';
    for (let c = 0; c < sumHeaders.length; c++) {
      const addr = `${colLetters[c]}${r + 1}`;
      setCell(ws2, addr, ws2[addr]?.v ?? '', {
        font: { bold: isTotal, color: isTotal ? { rgb: 'FFFFFFFF' } : undefined },
        fill: {
          fgColor: { rgb: isTotal ? TOTAL_FILL : (c >= 4 ? rowColor : 'FFFFFFFF') },
          patternType: 'solid',
        },
        numFmt: c === 2 || c === 3 || c === 4 ? '€#,##0.00' : c === 5 ? '0.0%' : undefined,
      });
    }
  }

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'BOQ Completo');
  utils.book_append_sheet(wb, ws2, 'Riepilogo');

  const date = new Date().toISOString().slice(0, 10);
  const code = project?.code || project?.project_code || 'PROJECT';
  writeFile(wb, `${code}-BOQ-${date}.xlsx`);
}

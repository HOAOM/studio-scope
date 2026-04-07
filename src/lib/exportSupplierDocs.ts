/**
 * Supplier Document Export — PDF + Excel for RFQ, PO, Proforma Request
 */
import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';

export type SupplierDocType = 'rfq' | 'purchase_order' | 'proforma_request';

export interface SupplierItem {
  item_code: string;
  description: string;
  dimensions: string | null;
  finish_material: string | null;
  finish_color: string | null;
  quantity: number;
  unit_cost: number | null;
  selling_price: number | null;
  reference_image_url: string | null;
  quotation_ref: string | null;
  po_number: string | null;
  delivery_date: string | null;
}

export interface SupplierDocOptions {
  projectName: string;
  projectCode: string;
  supplier: string;
  documentType: SupplierDocType;
  items: SupplierItem[];
  notes?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  responseDeadline?: string;
  docNumber?: string;
}

const DOC_TITLES: Record<SupplierDocType, string> = {
  rfq: 'Request for Quotation',
  purchase_order: 'Purchase Order',
  proforma_request: 'Proforma Invoice Request',
};

const DOC_PREFIXES: Record<SupplierDocType, string> = {
  rfq: 'RFQ',
  purchase_order: 'PO',
  proforma_request: 'PR',
};

// ─── PDF Generation ─────────────────────────────────────────

export function generateSupplierPDF(options: SupplierDocOptions): void {
  const {
    projectName, projectCode, supplier, documentType, items,
    notes, deliveryAddress, paymentTerms, responseDeadline, docNumber,
  } = options;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;
  const today = new Date().toLocaleDateString('en-GB');

  const refNumber = docNumber || `${DOC_PREFIXES[documentType]}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;

  let y = margin;

  // Header
  pdf.setFillColor(24, 24, 27);
  pdf.rect(0, 0, pageW, 40, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(DOC_TITLES[documentType], margin, 18);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Ref: ${refNumber}`, margin, 26);
  pdf.text(`Date: ${today}`, margin, 32);
  pdf.text(`Project: ${projectName} (${projectCode})`, pageW - margin, 26, { align: 'right' });
  pdf.text(`Supplier: ${supplier}`, pageW - margin, 32, { align: 'right' });

  y = 50;

  // Table headers depend on doc type
  const isRFQ = documentType === 'rfq';
  const isPO = documentType === 'purchase_order';

  // Column definitions
  const colDefs = [
    { label: '#', w: 8 },
    { label: 'Item Code', w: 22 },
    { label: 'Description', w: isRFQ ? 50 : 42 },
    { label: 'Dimensions', w: 25 },
    { label: 'Finishes', w: 25 },
    { label: 'Qty', w: 10 },
  ];

  if (isRFQ) {
    colDefs.push({ label: 'Unit Price', w: 20 });
    colDefs.push({ label: 'Total', w: 20 });
  } else {
    colDefs.push({ label: 'Unit Price', w: 20 });
    colDefs.push({ label: 'Total', w: 20 });
  }

  // Draw table header
  pdf.setFillColor(240, 240, 242);
  pdf.rect(margin, y, contentW, 8, 'F');
  pdf.setTextColor(60, 60, 60);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');

  let colX = margin + 1;
  colDefs.forEach(col => {
    pdf.text(col.label, colX, y + 5.5);
    colX += col.w;
  });

  y += 10;

  // Rows
  let grandTotal = 0;
  items.forEach((item, idx) => {
    // Check page overflow
    if (y > 260) {
      pdf.addPage();
      y = margin;
    }

    const rowH = 8;
    if (idx % 2 === 0) {
      pdf.setFillColor(250, 250, 252);
      pdf.rect(margin, y - 1, contentW, rowH, 'F');
    }

    pdf.setTextColor(24, 24, 27);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');

    colX = margin + 1;
    pdf.text(`${idx + 1}`, colX, y + 4); colX += 8;
    pdf.text(item.item_code || '—', colX, y + 4); colX += 22;

    const descLines = pdf.splitTextToSize(item.description, colDefs[2].w - 2);
    pdf.text(descLines[0] || '', colX, y + 4); colX += colDefs[2].w;

    pdf.text(item.dimensions || '—', colX, y + 4); colX += 25;

    const finish = [item.finish_material, item.finish_color].filter(Boolean).join(' / ') || '—';
    pdf.text(finish.substring(0, 30), colX, y + 4); colX += 25;

    pdf.text(`${item.quantity || 1}`, colX, y + 4); colX += 10;

    if (isRFQ) {
      // Empty cells for supplier to fill
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(colX, y - 1, 20, rowH);
      colX += 20;
      pdf.rect(colX, y - 1, 20, rowH);
    } else {
      const unitPrice = item.unit_cost || 0;
      const total = unitPrice * (item.quantity || 1);
      grandTotal += total;
      pdf.text(unitPrice ? unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—', colX, y + 4);
      colX += 20;
      pdf.text(total ? total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—', colX, y + 4);
    }

    y += rowH;
  });

  // Total row (for PO and Proforma)
  if (!isRFQ) {
    y += 2;
    pdf.setFillColor(24, 24, 27);
    pdf.rect(margin, y, contentW, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL', margin + 1, y + 5.5);
    pdf.text(
      `AED ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      pageW - margin - 1, y + 5.5, { align: 'right' }
    );
    y += 14;
  } else {
    y += 8;
  }

  // Additional info sections
  if (deliveryAddress) {
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Delivery Address:', margin, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    const addrLines = pdf.splitTextToSize(deliveryAddress, contentW);
    pdf.text(addrLines, margin, y);
    y += addrLines.length * 3.5 + 4;
  }

  if (paymentTerms) {
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Payment Terms:', margin, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.text(paymentTerms, margin, y);
    y += 8;
  }

  if (responseDeadline && isRFQ) {
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Response Deadline: ${responseDeadline}`, margin, y);
    y += 8;
  }

  if (notes) {
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Notes:', margin, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    const noteLines = pdf.splitTextToSize(notes, contentW);
    pdf.text(noteLines, margin, y);
    y += noteLines.length * 3.5 + 4;
  }

  // Signature line (for PO)
  if (isPO) {
    if (y > 240) { pdf.addPage(); y = margin; }
    y += 10;
    pdf.setDrawColor(100, 100, 100);
    pdf.line(margin, y + 15, margin + 70, y + 15);
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(7);
    pdf.text('Authorized Signature', margin, y + 20);
    pdf.line(pageW - margin - 70, y + 15, pageW - margin, y + 15);
    pdf.text('Date', pageW - margin - 70, y + 20);
  }

  // Footer on each page
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(160, 160, 160);
    pdf.setFontSize(6);
    pdf.text(`${DOC_TITLES[documentType]} — ${refNumber} — Page ${i}/${totalPages}`, pageW / 2, 290, { align: 'center' });
  }

  pdf.save(`${refNumber}.pdf`);
}

// ─── Excel Generation ───────────────────────────────────────

export async function generateSupplierExcel(options: SupplierDocOptions): Promise<void> {
  const {
    projectName, projectCode, supplier, documentType, items,
    notes, deliveryAddress, paymentTerms, docNumber,
  } = options;

  const refNumber = docNumber || `${DOC_PREFIXES[documentType]}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StudioScope';
  wb.created = new Date();

  const ws = wb.addWorksheet(DOC_TITLES[documentType]);

  // Header rows
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = DOC_TITLES[documentType];
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'left' };

  ws.getCell('A2').value = `Ref: ${refNumber}`;
  ws.getCell('A3').value = `Project: ${projectName} (${projectCode})`;
  ws.getCell('A4').value = `Supplier: ${supplier}`;
  ws.getCell('A5').value = `Date: ${new Date().toLocaleDateString('en-GB')}`;

  // Table header row
  const headerRow = 7;
  const isRFQ = documentType === 'rfq';

  const headers = ['#', 'Item Code', 'Description', 'Dimensions', 'Finish Material', 'Finish Color', 'Qty'];
  if (isRFQ) {
    headers.push('Unit Price (to fill)', 'Total (to fill)');
  } else {
    headers.push('Unit Price', 'Total');
  }

  const hRow = ws.getRow(headerRow);
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 35;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 15;
  ws.getColumn(7).width = 8;
  ws.getColumn(8).width = 15;
  ws.getColumn(9).width = 15;

  // Data rows
  let grandTotal = 0;
  items.forEach((item, idx) => {
    const rowNum = headerRow + 1 + idx;
    const row = ws.getRow(rowNum);

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = item.item_code || '';
    row.getCell(3).value = item.description;
    row.getCell(4).value = item.dimensions || '';
    row.getCell(5).value = item.finish_material || '';
    row.getCell(6).value = item.finish_color || '';
    row.getCell(7).value = item.quantity || 1;

    if (isRFQ) {
      // Leave empty for supplier
      row.getCell(8).value = null;
      row.getCell(9).value = null;
      // Add formula for total = qty * unit price
      row.getCell(9).value = { formula: `G${rowNum}*H${rowNum}` };
    } else {
      const unitPrice = item.unit_cost || 0;
      const total = unitPrice * (item.quantity || 1);
      grandTotal += total;
      row.getCell(8).value = unitPrice;
      row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).value = total;
      row.getCell(9).numFmt = '#,##0.00';
    }

    // Alternating row colors
    if (idx % 2 === 0) {
      for (let c = 1; c <= 9; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    }
  });

  // Total row (for PO / Proforma)
  if (!isRFQ) {
    const totalRowNum = headerRow + 1 + items.length;
    const tRow = ws.getRow(totalRowNum);
    tRow.getCell(1).value = 'TOTAL';
    tRow.getCell(1).font = { bold: true };
    ws.mergeCells(`A${totalRowNum}:H${totalRowNum}`);
    tRow.getCell(9).value = grandTotal;
    tRow.getCell(9).numFmt = '#,##0.00';
    tRow.getCell(9).font = { bold: true, size: 12 };
  }

  // Notes section
  const notesRow = headerRow + items.length + 3;
  if (deliveryAddress) {
    ws.getCell(`A${notesRow}`).value = 'Delivery Address:';
    ws.getCell(`A${notesRow}`).font = { bold: true };
    ws.getCell(`B${notesRow}`).value = deliveryAddress;
  }
  if (paymentTerms) {
    ws.getCell(`A${notesRow + 1}`).value = 'Payment Terms:';
    ws.getCell(`A${notesRow + 1}`).font = { bold: true };
    ws.getCell(`B${notesRow + 1}`).value = paymentTerms;
  }
  if (notes) {
    ws.getCell(`A${notesRow + 2}`).value = 'Notes:';
    ws.getCell(`A${notesRow + 2}`).font = { bold: true };
    ws.getCell(`B${notesRow + 2}`).value = notes;
  }

  // Download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${refNumber}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

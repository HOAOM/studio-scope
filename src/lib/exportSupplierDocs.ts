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

export interface CompanyInfo {
  company_name: string;
  company_address: string;
  logo_url: string;
  phone: string;
  email: string;
  website: string;
  vat_number: string;
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
  company?: CompanyInfo;
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
    notes, deliveryAddress, paymentTerms, responseDeadline, docNumber, company,
  } = options;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;
  const today = new Date().toLocaleDateString('en-GB');

  const refNumber = docNumber || `${DOC_PREFIXES[documentType]}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
  const isRFQ = documentType === 'rfq';
  const isPO = documentType === 'purchase_order';

  let y = margin;

  // ── Company Header ──
  const companyName = company?.company_name || '';
  const companyAddr = company?.company_address || '';
  const companyPhone = company?.phone || '';
  const companyEmail = company?.email || '';
  const companyVat = company?.vat_number || '';

  // Header band
  pdf.setFillColor(24, 24, 27);
  pdf.rect(0, 0, pageW, 38, 'F');
  pdf.setTextColor(255, 255, 255);

  // Company name (left)
  if (companyName) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(companyName, margin, 14);
  }

  // Company details below name
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  let headerY = 20;
  if (companyAddr) { pdf.text(companyAddr, margin, headerY); headerY += 4; }
  const contactLine = [companyPhone, companyEmail].filter(Boolean).join(' | ');
  if (contactLine) { pdf.text(contactLine, margin, headerY); headerY += 4; }
  if (companyVat) { pdf.text(`VAT: ${companyVat}`, margin, headerY); }

  // Doc title (right)
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(DOC_TITLES[documentType], pageW - margin, 14, { align: 'right' });
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Date: ${today}`, pageW - margin, 22, { align: 'right' });

  y = 44;

  // ── Project & Supplier info ──
  pdf.setTextColor(24, 24, 27);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Project: ${projectName} (${projectCode})`, margin, y);
  pdf.text(`Supplier: ${supplier}`, pageW - margin, y, { align: 'right' });
  y += 7;

  // ── Column definitions ──
  // # (5mm) | Item Code (20mm) | Description (flex) | Dimensions (22mm) | Finishes (22mm) | Qty (10mm) | Unit Price (20mm) | Total (20mm)
  const colWidths = [5, 20, 0, 22, 22, 10, 20, 20]; // description is flex
  colWidths[2] = contentW - colWidths.reduce((a, b) => a + b, 0); // remaining for description

  const colLabels = ['#', 'Item Code', 'Description', 'Dimensions', 'Finishes', 'Qty',
    isRFQ ? 'Unit Price' : 'Unit Price', isRFQ ? 'Total' : 'Total'];

  // Draw table header
  pdf.setFillColor(240, 240, 242);
  pdf.rect(margin, y, contentW, 6, 'F');
  pdf.setTextColor(80, 80, 80);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');

  let colX = margin;
  colLabels.forEach((label, i) => {
    pdf.text(label, colX + 1, y + 4);
    colX += colWidths[i];
  });

  y += 7;

  // ── Rows ──
  let grandTotal = 0;
  const rowH = 4.5; // compact row height

  items.forEach((item, idx) => {
    // Calculate description height for multi-line
    const descMaxW = colWidths[2] - 2;
    const descLines = pdf.splitTextToSize(item.description, descMaxW);
    const lineH = Math.max(rowH, descLines.length * 3 + 1.5);

    // Check page overflow
    if (y + lineH > 270) {
      pdf.addPage();
      y = margin;
    }

    // Alternating row background
    if (idx % 2 === 0) {
      pdf.setFillColor(248, 248, 250);
      pdf.rect(margin, y - 0.5, contentW, lineH, 'F');
    }

    pdf.setTextColor(24, 24, 27);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'normal');

    colX = margin;

    // # — 2-digit max
    pdf.text(`${idx + 1}`, colX + 1, y + 3); colX += colWidths[0];

    // Item Code
    pdf.text(item.item_code || '—', colX + 1, y + 3); colX += colWidths[1];

    // Description — multi-line
    descLines.forEach((line: string, li: number) => {
      pdf.text(line, colX + 1, y + 3 + li * 3);
    });
    colX += colWidths[2];

    // Dimensions
    pdf.text(item.dimensions || '—', colX + 1, y + 3); colX += colWidths[3];

    // Finishes
    const finish = [item.finish_material, item.finish_color].filter(Boolean).join(' / ') || '—';
    pdf.text(finish.substring(0, 28), colX + 1, y + 3); colX += colWidths[4];

    // Qty
    pdf.text(`${item.quantity || 1}`, colX + 1, y + 3); colX += colWidths[5];

    if (isRFQ) {
      // Empty cells for supplier to fill
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(colX, y - 0.5, colWidths[6], lineH);
      colX += colWidths[6];
      pdf.rect(colX, y - 0.5, colWidths[7], lineH);
    } else {
      const unitPrice = item.unit_cost || 0;
      const total = unitPrice * (item.quantity || 1);
      grandTotal += total;
      pdf.text(unitPrice ? unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—', colX + 1, y + 3);
      colX += colWidths[6];
      pdf.text(total ? total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—', colX + 1, y + 3);
    }

    y += lineH;
  });

  // Total row (for PO and Proforma)
  if (!isRFQ) {
    y += 2;
    pdf.setFillColor(24, 24, 27);
    pdf.rect(margin, y, contentW, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL', margin + 1, y + 5);
    pdf.text(
      `AED ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      pageW - margin - 1, y + 5, { align: 'right' }
    );
    y += 12;
  } else {
    y += 6;
  }

  // Additional info sections
  const addSection = (title: string, content: string) => {
    if (y > 260) { pdf.addPage(); y = margin; }
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin, y);
    y += 3.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const lines = pdf.splitTextToSize(content, contentW);
    pdf.text(lines, margin, y);
    y += lines.length * 3 + 4;
  };

  if (deliveryAddress) addSection('Delivery Address:', deliveryAddress);
  if (paymentTerms) addSection('Payment Terms:', paymentTerms);
  if (responseDeadline && isRFQ) addSection('Response Deadline:', responseDeadline);
  if (notes) addSection('Notes:', notes);

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
    const footerText = [companyName, DOC_TITLES[documentType], `Page ${i}/${totalPages}`].filter(Boolean).join(' — ');
    pdf.text(footerText, pageW / 2, 290, { align: 'center' });
  }

  pdf.save(`${DOC_PREFIXES[documentType]}-${projectCode}-${supplier.replace(/\s+/g, '_')}.pdf`);
}

// ─── Excel Generation ───────────────────────────────────────

export async function generateSupplierExcel(options: SupplierDocOptions): Promise<void> {
  const {
    projectName, projectCode, supplier, documentType, items,
    notes, deliveryAddress, paymentTerms, docNumber, company,
  } = options;

  const refNumber = docNumber || `${DOC_PREFIXES[documentType]}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
  const wb = new ExcelJS.Workbook();
  wb.creator = company?.company_name || 'StudioScope';
  wb.created = new Date();

  const ws = wb.addWorksheet(DOC_TITLES[documentType]);

  // Header rows
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = DOC_TITLES[documentType];
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'left' };

  if (company?.company_name) {
    ws.getCell('A2').value = company.company_name;
    ws.getCell('A2').font = { bold: true, size: 11 };
  }
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
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 40;
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
    row.getCell(3).alignment = { wrapText: true };
    row.getCell(4).value = item.dimensions || '';
    row.getCell(5).value = item.finish_material || '';
    row.getCell(6).value = item.finish_color || '';
    row.getCell(7).value = item.quantity || 1;

    if (isRFQ) {
      row.getCell(8).value = null;
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
  a.download = `${DOC_PREFIXES[documentType]}-${projectCode}-${supplier.replace(/\s+/g, '_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

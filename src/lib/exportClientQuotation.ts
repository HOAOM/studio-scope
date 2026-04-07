/**
 * Client Quotation PDF — Formal preventivo grouped by room/area
 * Shows only selected options with selling prices
 */
import jsPDF from 'jspdf';

interface QuotationItem {
  item_code: string;
  description: string;
  area: string;
  category: string;
  dimensions: string | null;
  finish_material: string | null;
  finish_color: string | null;
  selling_price: number | null;
  quantity: number;
}

interface ExportQuotationOptions {
  projectName: string;
  projectCode: string;
  clientName: string;
  items: QuotationItem[];
  termsAndConditions?: string;
  validityDays?: number;
}

export function exportClientQuotationPDF(options: ExportQuotationOptions): void {
  const { projectName, projectCode, clientName, items, termsAndConditions, validityDays = 30 } = options;
  const today = new Date().toLocaleDateString('en-GB');
  const refNumber = `QUO-${projectCode}-${Date.now().toString(36).toUpperCase()}`;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - margin * 2;

  // Group by area
  const roomGroups: Record<string, QuotationItem[]> = {};
  items.forEach(item => {
    const room = item.area || 'General';
    if (!roomGroups[room]) roomGroups[room] = [];
    roomGroups[room].push(item);
  });

  let y = margin;

  // Header
  pdf.setFillColor(24, 24, 27);
  pdf.rect(0, 0, pageW, 42, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('QUOTATION', margin, 18);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Ref: ${refNumber}`, margin, 26);
  pdf.text(`Date: ${today}`, margin, 32);
  pdf.text(`Valid for: ${validityDays} days`, margin, 38);
  pdf.text(`Project: ${projectName}`, pageW - margin, 26, { align: 'right' });
  pdf.text(`Client: ${clientName}`, pageW - margin, 32, { align: 'right' });

  y = 52;

  let grandTotal = 0;
  const roomNames = Object.keys(roomGroups).sort();

  for (const roomName of roomNames) {
    const roomItems = roomGroups[roomName];

    // Check page space
    if (y > 240) { pdf.addPage(); y = margin; }

    // Room header
    pdf.setFillColor(240, 240, 242);
    pdf.rect(margin, y, contentW, 7, 'F');
    pdf.setTextColor(24, 24, 27);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(roomName, margin + 2, y + 5);
    y += 9;

    // Table header
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('#', margin + 1, y + 3);
    pdf.text('Code', margin + 8, y + 3);
    pdf.text('Description', margin + 30, y + 3);
    pdf.text('Finishes', margin + 95, y + 3);
    pdf.text('Qty', margin + 135, y + 3);
    pdf.text('Unit Price', margin + 148, y + 3);
    pdf.text('Total', margin + 168, y + 3);
    y += 5;

    let roomTotal = 0;
    roomItems.forEach((item, idx) => {
      if (y > 270) { pdf.addPage(); y = margin; }

      const rowH = 6;
      if (idx % 2 === 0) {
        pdf.setFillColor(250, 250, 252);
        pdf.rect(margin, y - 1, contentW, rowH, 'F');
      }

      const unitPrice = item.selling_price || 0;
      const total = unitPrice * (item.quantity || 1);
      roomTotal += total;

      pdf.setTextColor(24, 24, 27);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');

      pdf.text(`${idx + 1}`, margin + 1, y + 3);
      pdf.text(item.item_code || '—', margin + 8, y + 3);

      const desc = pdf.splitTextToSize(item.description, 60);
      pdf.text(desc[0] || '', margin + 30, y + 3);

      const finish = [item.finish_material, item.finish_color].filter(Boolean).join(' / ') || '—';
      pdf.text(finish.substring(0, 35), margin + 95, y + 3);

      pdf.text(`${item.quantity || 1}`, margin + 135, y + 3);
      pdf.text(unitPrice ? unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—', margin + 148, y + 3);
      pdf.text(total ? total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—', margin + 168, y + 3);

      y += rowH;
    });

    // Room subtotal
    grandTotal += roomTotal;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin + 148, y, margin + contentW, y);
    y += 1;
    pdf.setTextColor(24, 24, 27);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Subtotal: AED ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + contentW, y + 3, { align: 'right' });
    y += 8;
  }

  // Grand Total
  if (y > 250) { pdf.addPage(); y = margin; }
  y += 4;
  pdf.setFillColor(24, 24, 27);
  pdf.rect(margin, y, contentW, 10, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRAND TOTAL', margin + 3, y + 7);
  pdf.text(`AED ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + contentW - 3, y + 7, { align: 'right' });
  y += 18;

  // Terms
  if (termsAndConditions) {
    if (y > 240) { pdf.addPage(); y = margin; }
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Terms & Conditions:', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const lines = pdf.splitTextToSize(termsAndConditions, contentW);
    pdf.text(lines, margin, y);
  }

  // Footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(160, 160, 160);
    pdf.setFontSize(6);
    pdf.text(`Quotation ${refNumber} — Page ${i}/${totalPages}`, pageW / 2, 290, { align: 'center' });
  }

  pdf.save(`${refNumber}.pdf`);
}

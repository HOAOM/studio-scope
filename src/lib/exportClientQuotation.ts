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

interface CompanyInfo {
  company_name: string;
  company_address: string;
  logo_url: string;
  phone: string;
  email: string;
  website: string;
  vat_number: string;
}

interface ExportQuotationOptions {
  projectName: string;
  projectCode: string;
  clientName: string;
  items: QuotationItem[];
  termsAndConditions?: string;
  validityDays?: number;
  company?: CompanyInfo;
}

export function exportClientQuotationPDF(options: ExportQuotationOptions): void {
  const { projectName, projectCode, clientName, items, termsAndConditions, validityDays = 30, company } = options;
  const today = new Date().toLocaleDateString('en-GB');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 12;
  const contentW = pageW - margin * 2;

  const companyName = company?.company_name || '';
  const companyAddr = company?.company_address || '';
  const companyPhone = company?.phone || '';
  const companyEmail = company?.email || '';
  const companyVat = company?.vat_number || '';

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
  pdf.rect(0, 0, pageW, 38, 'F');
  pdf.setTextColor(255, 255, 255);

  // Company name (left)
  if (companyName) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(companyName, margin, 14);
  }
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  let headerY = 20;
  if (companyAddr) { pdf.text(companyAddr, margin, headerY); headerY += 4; }
  const contactLine = [companyPhone, companyEmail].filter(Boolean).join(' | ');
  if (contactLine) { pdf.text(contactLine, margin, headerY); headerY += 4; }
  if (companyVat) { pdf.text(`VAT: ${companyVat}`, margin, headerY); }

  // Title right
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('QUOTATION', pageW - margin, 14, { align: 'right' });
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Date: ${today}`, pageW - margin, 22, { align: 'right' });
  pdf.text(`Valid for: ${validityDays} days`, pageW - margin, 27, { align: 'right' });
  pdf.text(`Project: ${projectName}`, pageW - margin, 32, { align: 'right' });

  y = 44;

  // Client info
  pdf.setTextColor(24, 24, 27);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Client: ${clientName}`, margin, y);
  y += 7;

  let grandTotal = 0;
  const roomNames = Object.keys(roomGroups).sort();

  for (const roomName of roomNames) {
    const roomItems = roomGroups[roomName];

    if (y > 240) { pdf.addPage(); y = margin; }

    // Room header
    pdf.setFillColor(240, 240, 242);
    pdf.rect(margin, y, contentW, 6, 'F');
    pdf.setTextColor(24, 24, 27);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text(roomName, margin + 2, y + 4.5);
    y += 8;

    // Table header
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.text('#', margin + 1, y + 3);
    pdf.text('Code', margin + 8, y + 3);
    pdf.text('Description', margin + 30, y + 3);
    pdf.text('Finishes', margin + 95, y + 3);
    pdf.text('Qty', margin + 135, y + 3);
    pdf.text('Unit Price', margin + 148, y + 3);
    pdf.text('Total', margin + 168, y + 3);
    y += 4.5;

    let roomTotal = 0;
    roomItems.forEach((item, idx) => {
      if (y > 270) { pdf.addPage(); y = margin; }

      const descLines = pdf.splitTextToSize(item.description, 60);
      const rowH = Math.max(4.5, descLines.length * 3 + 1.5);

      if (idx % 2 === 0) {
        pdf.setFillColor(248, 248, 250);
        pdf.rect(margin, y - 0.5, contentW, rowH, 'F');
      }

      const unitPrice = item.selling_price || 0;
      const total = unitPrice * (item.quantity || 1);
      roomTotal += total;

      pdf.setTextColor(24, 24, 27);
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'normal');

      pdf.text(`${idx + 1}`, margin + 1, y + 3);
      pdf.text(item.item_code || '—', margin + 8, y + 3);

      descLines.forEach((line: string, li: number) => {
        pdf.text(line, margin + 30, y + 3 + li * 3);
      });

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
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Subtotal: AED ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + contentW, y + 3, { align: 'right' });
    y += 7;
  }

  // Grand Total
  if (y > 250) { pdf.addPage(); y = margin; }
  y += 3;
  pdf.setFillColor(24, 24, 27);
  pdf.rect(margin, y, contentW, 8, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRAND TOTAL', margin + 3, y + 6);
  pdf.text(`AED ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + contentW - 3, y + 6, { align: 'right' });
  y += 14;

  // Terms
  if (termsAndConditions) {
    if (y > 240) { pdf.addPage(); y = margin; }
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Terms & Conditions:', margin, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const lines = pdf.splitTextToSize(termsAndConditions, contentW);
    pdf.text(lines, margin, y);
  }

  // Footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setTextColor(160, 160, 160);
    pdf.setFontSize(6);
    const footerText = [companyName, 'Quotation', `Page ${i}/${totalPages}`].filter(Boolean).join(' — ');
    pdf.text(footerText, pageW / 2, 290, { align: 'center' });
  }

  pdf.save(`Quotation-${projectCode}-${clientName.replace(/\s+/g, '_')}.pdf`);
}

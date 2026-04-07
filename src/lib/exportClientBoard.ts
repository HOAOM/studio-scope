/**
 * Client Board PDF Export — A3 landscape, 2x3 grid per room
 * Shows only selected option per item with image, description, finishes, dimensions, price
 */
import jsPDF from 'jspdf';

interface BoardItem {
  id: string;
  item_code: string;
  description: string;
  area: string;
  category: string;
  dimensions: string | null;
  finish_material: string | null;
  finish_color: string | null;
  reference_image_url: string | null;
  selling_price: number | null;
  quantity: number | null;
}

interface ExportClientBoardOptions {
  boardName: string;
  projectName: string;
  items: BoardItem[];
  date?: string;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    return await new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

export async function exportClientBoardPDF(options: ExportClientBoardOptions): Promise<void> {
  const { boardName, projectName, items, date } = options;
  const exportDate = date || new Date().toLocaleDateString('en-GB');

  // Group items by room/area
  const roomGroups: Record<string, BoardItem[]> = {};
  items.forEach(item => {
    const room = item.area || 'General';
    if (!roomGroups[room]) roomGroups[room] = [];
    roomGroups[room].push(item);
  });

  // A3 landscape: 420 x 297 mm
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const pageW = 420;
  const pageH = 297;
  const margin = 12;
  const headerH = 20;
  const footerH = 12;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin - headerH - footerH - margin;

  // Grid: 3 cols x 2 rows
  const cols = 3;
  const rows = 2;
  const cellGap = 4;
  const cellW = (contentW - cellGap * (cols - 1)) / cols;
  const cellH = (contentH - cellGap * (rows - 1)) / rows;
  const imgH = cellH * 0.45;

  const roomNames = Object.keys(roomGroups).sort();
  let pageIndex = 0;

  for (const roomName of roomNames) {
    const roomItems = roomGroups[roomName];
    const pages = Math.ceil(roomItems.length / (cols * rows));

    for (let p = 0; p < pages; p++) {
      if (pageIndex > 0) pdf.addPage();
      pageIndex++;

      const pageItems = roomItems.slice(p * cols * rows, (p + 1) * cols * rows);

      // Header
      pdf.setFillColor(24, 24, 27); // zinc-900
      pdf.rect(0, 0, pageW, margin + headerH, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(projectName, margin, margin + 8);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${boardName} — ${roomName}`, margin, margin + 15);
      pdf.setFontSize(9);
      pdf.text(exportDate, pageW - margin, margin + 8, { align: 'right' });
      if (pages > 1) {
        pdf.text(`Sheet ${p + 1}/${pages}`, pageW - margin, margin + 15, { align: 'right' });
      }

      // Cells
      const startY = margin + headerH + 4;
      for (let idx = 0; idx < pageItems.length; idx++) {
        const item = pageItems[idx];
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = margin + col * (cellW + cellGap);
        const y = startY + row * (cellH + cellGap);

        // Cell background
        pdf.setFillColor(250, 250, 250);
        pdf.setDrawColor(228, 228, 231);
        pdf.roundedRect(x, y, cellW, cellH, 2, 2, 'FD');

        // Image
        if (item.reference_image_url) {
          const imgData = await loadImageAsBase64(item.reference_image_url);
          if (imgData) {
            try {
              pdf.addImage(imgData, 'JPEG', x + 3, y + 3, cellW - 6, imgH - 3);
            } catch { /* skip broken images */ }
          }
        }

        // Text below image
        let textY = y + imgH + 5;
        const textX = x + 4;
        const maxTextW = cellW - 8;

        // Item code
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.text(item.item_code || '—', textX, textY);
        textY += 5;

        // Description
        pdf.setTextColor(24, 24, 27);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const descLines = pdf.splitTextToSize(item.description, maxTextW);
        pdf.text(descLines.slice(0, 2), textX, textY);
        textY += descLines.slice(0, 2).length * 3.5 + 2;

        // Dimensions
        if (item.dimensions) {
          pdf.setTextColor(100, 100, 100);
          pdf.setFontSize(7);
          pdf.text(`Dim: ${item.dimensions}`, textX, textY);
          textY += 4;
        }

        // Finishes
        const finishParts: string[] = [];
        if (item.finish_material) finishParts.push(item.finish_material);
        if (item.finish_color) finishParts.push(item.finish_color);
        if (finishParts.length > 0) {
          pdf.setTextColor(100, 100, 100);
          pdf.setFontSize(7);
          pdf.text(`Finish: ${finishParts.join(' / ')}`, textX, textY);
          textY += 4;
        }

        // Price + Qty at bottom right
        const bottomY = y + cellH - 5;
        pdf.setTextColor(24, 24, 27);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        const priceText = item.selling_price
          ? `AED ${Number(item.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          : '—';
        pdf.text(priceText, x + cellW - 4, bottomY, { align: 'right' });

        if (item.quantity && item.quantity > 1) {
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Qty: ${item.quantity}`, textX, bottomY);
        }
      }

      // Footer
      const footerY = pageH - footerH;
      pdf.setDrawColor(228, 228, 231);
      pdf.line(margin, footerY, pageW - margin, footerY);
      pdf.setTextColor(160, 160, 160);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.text('For Client Approval', margin, footerY + 6);
      pdf.text(`Page ${pageIndex}`, pageW - margin, footerY + 6, { align: 'right' });
    }
  }

  pdf.save(`${boardName.replace(/\s+/g, '_')}_ClientBoard.pdf`);
}



# Export & Document Generation System

## Overview

Build a comprehensive document generation system with three modules: Client Board PDF export, Presentation PDF export, and Supplier Document generation (RFQ, PO, Proforma Request) in both PDF and Excel formats.

---

## Module 1: Client Board PDF Export

**What it does**: Generates A3 landscape PDF from a client board, showing only the selected option per item with image, description, finishes, dimensions, and client price. Grouped by room in a 2x3 grid layout.

**Technical approach**:
- Add a "Download PDF" button on each board card in `ClientBoardsTab.tsx`
- Use `jsPDF` (already in the project) to generate A3 landscape pages
- Each page = 1 room, 2x3 grid of items
- Each cell: reference image (loaded from URL), item code, description, dimensions, finish material/color, selling price, quantity
- Header: project name, board name, date, room name
- Footer: page number, "For Client Approval" watermark
- No internal margins or cost data visible

**Files**: 
- New: `src/lib/exportClientBoard.ts`
- Edit: `src/components/warroom/ClientBoardsTab.tsx` (add Download button)

---

## Module 2: Presentation PDF Export

**Current state**: `PresentationBuilder.tsx` already has an `exportPDF` function using `html2canvas` + `jsPDF`. This works but quality is limited.

**Improvement**: Refine the existing export to ensure A3 landscape, proper resolution, and consistent layout. Minor polish, not a rewrite.

**Files**: Edit `src/components/warroom/PresentationBuilder.tsx`

---

## Module 3: Supplier Documents (RFQ, PO, Proforma Request)

This is the most substantial new feature. Three document types, each available as PDF + Excel.

### 3.1 Database

New table `supplier_documents` to track generated documents:
```
id uuid PK
project_id uuid
supplier text
document_type text (rfq, purchase_order, proforma_request)
items jsonb (snapshot of item data at generation time)
generated_at timestamptz
generated_by uuid
notes text
status text (draft, sent, confirmed)
```

### 3.2 New UI Tab: "Supplier Export"

Add a new tab in `ProjectDetail.tsx` (or integrate into existing Procurement view). The flow:

1. **Select supplier** from a dropdown (auto-populated from items with that supplier)
2. **Items list** auto-filters to show all items for that supplier
3. **Choose document type**: RFQ / Purchase Order / Proforma Request
4. User can add notes, payment terms, delivery address
5. **Generate** button creates PDF + Excel

### 3.3 Document Content per Type

**RFQ (Request for Quotation)**:
- Header: company logo placeholder, project name, date, RFQ number
- Table: item code, description, dimensions, finishes, quantity, reference image URL
- No internal prices — supplier fills in their prices
- Footer: response deadline, contact info, terms

**Purchase Order (PO)**:
- Header: PO number (auto-generated), project name, date
- Table: item code, description, dimensions, quantity, agreed unit price, total
- Payment terms section (from the supplier_payments data)
- Delivery address, required delivery date
- Signature line

**Proforma Request**:
- Header: project name, date, reference to accepted quotation
- Table: item code, description, quantity, agreed price, total
- Request for proforma invoice with payment details
- Bank transfer info placeholder

### 3.4 PDF Generation

Use `jsPDF` with a clean, professional template:
- A4 portrait for supplier documents
- Company header area (configurable later with logo)
- Structured table with alternating row colors
- Totals row at bottom
- Footer with page numbers

### 3.5 Excel Generation

Use `exceljs` (already installed) to create a structured .xlsx:
- Same data as PDF but in editable spreadsheet format
- Formatted headers, column widths, number formatting
- For RFQ: empty price columns for supplier to fill in
- For PO: all prices filled, formulas for totals

**Files**:
- New: `src/lib/exportSupplierDocs.ts` (PDF + Excel generation logic)
- New: `src/components/warroom/SupplierExportTab.tsx` (UI)
- Edit: `src/pages/ProjectDetail.tsx` (add tab)
- Migration: `supplier_documents` table

---

## Module 4: Preventivo Cliente (Client Quotation)

Generate a formal client-facing quotation document:
- Groups items by room/area
- Shows only selected options with selling prices
- Summary table with subtotals per category/room
- Grand total
- Terms and conditions section
- Available as PDF

**Files**: 
- New: `src/lib/exportClientQuotation.ts`
- Button added in Client Boards or a dedicated export area

---

## Implementation Order

1. **Migration**: Create `supplier_documents` table with RLS
2. **Supplier export logic**: `exportSupplierDocs.ts` with PDF + Excel for all 3 types
3. **Supplier Export UI**: `SupplierExportTab.tsx` with supplier selection and generation
4. **Client Board PDF**: `exportClientBoard.ts` with A3 layout
5. **Client Quotation PDF**: `exportClientQuotation.ts`
6. **Wire everything**: Add tabs/buttons in ProjectDetail
7. **Polish Presentation export**: Improve existing PDF quality

---

## Technical Notes

- All PDF generation uses `jsPDF` (already installed)
- All Excel generation uses `exceljs` (already installed)
- Images in PDFs: fetch from Supabase storage URLs, convert to base64 via canvas
- Documents are generated client-side (no edge function needed)
- `supplier_documents` table stores metadata only, not the actual files
- RLS: project owner can manage, members can view


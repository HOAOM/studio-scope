
# Studio Scope — Full Upgrade Plan v2

## Overview

Major upgrade from the current 7-state workflow to a full 25-state item lifecycle with auto-generated Gantt, client boards, audit trail, and expanded roles.

---

## Phase 1: Database Foundation

### 1.1 Enum Extensions

**item_lifecycle_status** — from 7 to 25 states:
```
concept, in_design, design_ready,
finishes_proposed, finishes_approved_designer, finishes_approved_hod,
client_board_ready, client_board_waiting_signature, client_board_signed,
quotation_preparation, quotation_inserted, quotation_approved_ops, quotation_approved_high,
po_issued, proforma_received, payment_approval, payment_executed,
in_production, ready_to_ship, in_delivery, delivered_to_site,
installation_planned, installed, snagging, closed,
on_hold, cancelled
```

**app_role** — add 3 new roles:
```
existing: admin, designer, accountant, qs, head_of_payments, client, ceo, site_engineer, project_manager, procurement_manager, mep_engineer
add: coo, head_of_design, architectural_dept
```

Role mapping from prompt:
- COO → `coo` (new)
- CEO → `ceo` (exists)
- Head of Design → `head_of_design` (new)
- Designer → `designer` (exists)
- Architectural Dept → `architectural_dept` (new)
- BOQ/Estimator/QS → `qs` (exists)
- Purchasing → `procurement_manager` (exists)
- Finance/Payments → `accountant` + `head_of_payments` (exist)
- Project Manager → `project_manager` (exists)
- Client → `client` (exists)
- Admin → `admin` (exists)

### 1.2 New Tables

**audit_log** — lightweight text-based log:
```sql
id uuid PK
entity_type text (item, client_board, quotation, po, payment, task)
entity_id uuid
action text (create, update, approve, reject, revision, override, cancel)
user_id uuid
summary text  -- e.g. "Changed status from draft to in_design"
created_at timestamptz
```

**item_revisions** — snapshot of item state per revision:
```sql
id uuid PK
item_id uuid FK → project_items
revision_number int (1, 2, 3...)
status text (active, obsolete, cancelled)
snapshot jsonb  -- frozen copy of key fields at time of revision creation
created_at timestamptz
created_by uuid
reason text
```

**client_boards** — separate from presentations:
```sql
id uuid PK
project_id uuid FK → projects
name text
room_filter text[]  -- rooms included
items jsonb  -- item IDs and their data snapshot
pdf_url text
status text (draft, ready, waiting_signature, signed)
signed_at timestamptz
signed_by uuid
created_at timestamptz
updated_at timestamptz
owner_id uuid
```

### 1.3 Schema Changes to project_items
```sql
ALTER TABLE project_items ADD COLUMN revision_number int DEFAULT 1;
ALTER TABLE project_items ADD COLUMN is_active boolean DEFAULT true;
ALTER TABLE project_items ADD COLUMN created_by uuid;
ALTER TABLE project_items ADD COLUMN locked_fields text[] DEFAULT '{}';
```

### 1.4 Migration of existing data
- All existing items get revision_number = 1, is_active = true

---

## Phase 2: Workflow Engine (workflow.ts rewrite)

### 2.1 State Machine
- 25 states with valid transitions defined
- Role-based permissions: who can trigger each transition
- Field locking rules per state (after client_board_signed → lock dimensions, finishes, layout)
- Hard gates: cannot PO without design + finishes + client board signed

### 2.2 Gate Logic (expanded)
Current gates (macro-area based) are expanded:
- **Design validation**: all items must have design_ready
- **Client approval**: all items must have client_board_signed
- **Procurement**: all items must have po_issued
- **Production**: all items must have payment_executed (if upfront required)
- **Delivery**: all items must have delivered_to_site
- **Installation**: all items must have installed + snagging resolved
- **Closing**: all items must be closed

### 2.3 Revision Logic
- Changing finishes after client_board_signed → R+1, revert to finishes_proposed
- Changing dimensions after payment_executed → blocked (override required)
- Previous client boards + quotations marked obsolete

---

## Phase 3: Gantt Auto-Generation

### 3.1 Auto Task Creation
When a BOQ item is created, auto-generate a task chain:
- Design task (in_design → design_ready)
- Finishes task (finishes_proposed → finishes_approved)
- Client Board task (client_board_ready → client_board_signed)
- Quotation task (quotation_preparation → quotation_approved)
- PO + Payment task (po_issued → payment_executed)
- Production task (in_production → ready_to_ship)
- Delivery task (in_delivery → delivered_to_site)
- Installation task (installation_planned → installed)
- Closing task (snagging → closed)

### 3.2 Date Calculation
- Use project start date as anchor
- 12 working days for quotation lead time (excl. weekends + EU/UAE holidays)
- Use supplier-defined production/delivery lead times when available
- Recalculate on state changes

### 3.3 Gantt Sync
- Auto-update task dates when item state changes
- Remove cancelled items from Gantt
- Only show active revisions

---

## Phase 4: Item Detail Modal

### 4.1 Full-screen overlay modal
- Opens on double-click from Gantt or item table
- Role-based field visibility
- Tabs: Info, Design, Procurement, Finance, Delivery, History
- Action buttons: Approve, Reject, Next State, New Revision
- Save / Cancel to close

### 4.2 Role-based visibility
- Designer: design, finishes, dimensions, client boards (no costs/margins)
- QS: quantities, costs, quotations
- COO/Admin: everything
- Client: client-facing only (no margins, no internal notes)

---

## Phase 5: Client Board (separate from Presentation)

### 5.1 Board Generation
- Select room/area → system aggregates items with approved design + finishes
- Generate A3 layout with item images, descriptions, dimensions, client prices
- No internal margins visible

### 5.2 Signature Workflow
- Generate PDF → status: waiting_signature
- After physical signature → user sets client_board_signed
- Upload signed PDF required
- Locks core fields on all included items

### 5.3 Invalidation
- If item finishes/dimensions change after signing → board marked obsolete
- New board must be generated with new revision

---

## Phase 6: COO Dashboard & Alerts

### 6.1 Milestones
- COO sets target dates for: all finishes approved, all POs issued, all payments executed, all installations complete
- System continuously evaluates feasibility based on current states + lead times

### 6.2 Risk Alerts
- Items stuck in same state > X days
- Milestones at risk / impossible
- Macro-phases blocked by incomplete items
- Rejected items requiring action

### 6.3 KPI Expansion
- % items per state (design approved, finishes approved, PO issued, paid, produced, delivered, installed, closed)
- Per project, per room, per macro-area
- Drill-down capability

---

## Implementation Order

1. **Database migrations** (enums + tables + migration)
2. **workflow.ts rewrite** (states, transitions, gates, field locking)
3. **Update existing UI** (StatusBadge, ItemFormDialog, BOQAnalyst to use new states)
4. **Audit log triggers**
5. **Item Detail Modal** (role-based overlay)
6. **Gantt auto-generation engine**
7. **Client Board feature**
8. **COO Dashboard + Alerts**
9. **Revision system** (R+1 logic, obsolescence)
10. **Testing & polish**

---

## Future (post-upgrade)
- Internal messaging system with email notifications
- Automated reminders (edge functions + cron)
- Supplier catalogue
- Report generation via email

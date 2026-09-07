ALTER TABLE public.checkpoint_definitions
  ADD COLUMN IF NOT EXISTS min_value_aed numeric,
  ADD COLUMN IF NOT EXISTS is_conditional boolean NOT NULL DEFAULT false;

INSERT INTO public.checkpoint_definitions
  (code, label, tipo, macro_gruppo, categorie_applicabili, ruolo_responsabile, requires_role_count, richiede_documento, skip_level, sort_order, min_value_aed, is_conditional)
VALUES
  ('rfq_issued',        'RFQ Emesso',                    'automatic', 'procurement', NULL, NULL,                  0, false, 1, 110, NULL,    false),
  ('quote_received',    'Offerta Ricevuta',              'automatic', 'procurement', NULL, NULL,                  0, false, 1, 120, NULL,    false),
  ('supplier_evaluation','Valutazione Fornitore',        'formal',    'procurement', NULL, 'procurement_manager', 1, false, 2, 130, NULL,    false),
  ('supplier_qualified','Fornitore Qualificato',         'formal',    'procurement', NULL, 'procurement_manager', 1, false, 2, 140, 50000,   false),
  ('award',             'Aggiudicazione',                'formal',    'procurement', NULL, 'procurement_manager', 1, false, 2, 150, NULL,    false),
  ('po_contract_approved','PO/Contratto Approvato',      'formal',    'procurement', NULL, 'procurement_manager', 1, true,  2, 160, NULL,    false),
  ('advance_payment_approved','Anticipo Pagamento Approvato','formal','procurement', NULL, 'head_of_payments',    1, true,  2, 170, 50000,   true),
  ('supplier_confirmation','Conferma Fornitore',         'automatic', 'procurement', NULL, NULL,                  0, false, 1, 180, NULL,    false)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  tipo = EXCLUDED.tipo,
  macro_gruppo = EXCLUDED.macro_gruppo,
  categorie_applicabili = EXCLUDED.categorie_applicabili,
  ruolo_responsabile = EXCLUDED.ruolo_responsabile,
  requires_role_count = EXCLUDED.requires_role_count,
  richiede_documento = EXCLUDED.richiede_documento,
  skip_level = EXCLUDED.skip_level,
  sort_order = EXCLUDED.sort_order,
  min_value_aed = EXCLUDED.min_value_aed,
  is_conditional = EXCLUDED.is_conditional;
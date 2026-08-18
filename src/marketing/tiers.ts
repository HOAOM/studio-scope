/**
 * Marketing tier model — mirrors the DB tiers (basic / advanced / pro)
 * and their real limits from public.tier_limits.
 * Prices are the ones actually sold on kroneel.com.
 */
export type MarketingTier = "basic" | "advanced" | "pro";

export interface TierCard {
  id: MarketingTier;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

export const MARKETING_TIERS: TierCard[] = [
  {
    id: "basic",
    name: "Basic",
    price: "€79",
    cadence: "/ mese",
    tagline: "Per studi che muovono i primi progetti.",
    features: [
      "1 utente per ruolo",
      "10 progetti attivi",
      "5 GB di archiviazione",
      "1 addon incluso",
      "BOQ Analyst + Gantt",
      "Client Boards",
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    price: "€99",
    cadence: "/ mese",
    tagline: "Il flusso completo, dal design al cantiere.",
    highlight: true,
    features: [
      "5 utenti per ruolo",
      "30 progetti attivi",
      "20 GB di archiviazione",
      "3 addon inclusi",
      "Procurement & margini",
      "Import Excel massivo",
      "Presentation builder",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€135",
    cadence: "/ mese",
    tagline: "Operazioni senza limiti, branding e API.",
    features: [
      "Utenti illimitati",
      "Progetti illimitati",
      "Archiviazione illimitata",
      "Tutti gli addon",
      "Branding personalizzato",
      "Accesso API e SLA dedicati",
    ],
  },
];

export function tierLabel(id: MarketingTier) {
  return MARKETING_TIERS.find((t) => t.id === id)?.name ?? id;
}

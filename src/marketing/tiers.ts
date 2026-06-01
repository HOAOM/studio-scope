/**
 * Marketing tier model — mirrors the DB tiers (starter / pro / business)
 * and their real limits from tier_project_limit / tier_storage_limit_gb.
 * Prices are presentational; billing is wired later.
 */
export type MarketingTier = "starter" | "pro" | "business";

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
    id: "starter",
    name: "Starter",
    price: "€49",
    cadence: "/ mese",
    tagline: "Per studi che muovono i primi progetti.",
    features: [
      "2 progetti attivi",
      "2 GB di archiviazione",
      "BOQ Analyst + Gantt",
      "Client Boards",
      "1 utente per ruolo",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€149",
    cadence: "/ mese",
    tagline: "Il flusso completo, dal design al cantiere.",
    highlight: true,
    features: [
      "8 progetti attivi",
      "10 GB di archiviazione",
      "Procurement & margini",
      "Import Excel massivo",
      "Presentation builder",
      "Più utenti per ruolo",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "Su misura",
    cadence: "",
    tagline: "Operazioni senza limiti, branding e API.",
    features: [
      "Progetti illimitati",
      "Archiviazione estesa",
      "Branding personalizzato",
      "Accesso API",
      "SLA dedicati",
      "Utenti illimitati",
    ],
  },
];

export function tierLabel(id: MarketingTier) {
  return MARKETING_TIERS.find((t) => t.id === id)?.name ?? id;
}

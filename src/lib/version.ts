/**
 * App version metadata + changelog.
 *
 * Convention: bump patch (2.5.0 → 2.5.1 → 2.5.2) on every visible change.
 * Bump minor (2.5.x → 2.6.0) when a whole phase of the roadmap is shipped.
 * Add a new entry at the TOP of CHANGELOG on every release.
 */

export interface ChangelogEntry {
  version: string;
  date: string; // ISO yyyy-mm-dd
  summary: string;
  details?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v2.5.1',
    date: '2026-05-21',
    summary: 'Versioning automatico + changelog visibile',
    details: [
      'Ogni modifica futura incrementa il numero versione (2.5.1 → 2.5.2 …)',
      'Badge versione in alto è ora cliccabile: mostra la cronologia completa',
      'Preparazione fase isolamento multi-studio (in corso)',
    ],
  },
  {
    version: 'v2.5.0',
    date: '2026-05-04',
    summary: 'Roles Refactor · Gantt Sync · Costs · Messaging · Suppliers',
  },
];

export const APP_VERSION = CHANGELOG[0].version;
export const APP_VERSION_LABEL = CHANGELOG[0].summary;
export const APP_VERSION_DATE = CHANGELOG[0].date;

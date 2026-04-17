/**
 * VersionBadge — Tiny version chip for header/footer.
 * Tooltip shows the release label and date for changelog traceability.
 */
import { APP_VERSION, APP_VERSION_LABEL, APP_VERSION_DATE } from '@/lib/version';
import { cn } from '@/lib/utils';

interface VersionBadgeProps {
  className?: string;
}

export function VersionBadge({ className }: VersionBadgeProps) {
  return (
    <span
      title={`${APP_VERSION} — ${APP_VERSION_LABEL} · ${APP_VERSION_DATE}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {APP_VERSION}
    </span>
  );
}

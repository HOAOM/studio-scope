/**
 * VersionBadge — Clickable chip that opens a popover with the full changelog.
 * Helps the user trace what changed and when, version by version.
 */
import { APP_VERSION, CHANGELOG } from '@/lib/version';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VersionBadgeProps {
  className?: string;
}

export function VersionBadge({ className }: VersionBadgeProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Clicca per la cronologia versioni"
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer',
            className,
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {APP_VERSION}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[380px] p-0 bg-card border-border"
        sideOffset={8}
      >
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">Cronologia versioni</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Ogni modifica incrementa la versione
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          <ol className="divide-y divide-border">
            {CHANGELOG.map((entry, i) => (
              <li key={entry.version} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {entry.version}
                    {i === 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        attuale
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{entry.date}</span>
                </div>
                <div className="mt-1 text-xs text-foreground">{entry.summary}</div>
                {entry.details && entry.details.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground list-disc list-inside marker:text-muted-foreground/60">
                    {entry.details.map((d, j) => (
                      <li key={j}>{d}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

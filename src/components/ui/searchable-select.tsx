import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  emptyMessage = 'No results found.',
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedLabel = React.useMemo(() => {
    if (!value || value === '__none__') return '';
    return options.find((o) => o.value === value)?.label || '';
  }, [options, value]);

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // When opening, clear search and show all; when value selected, show its label
  React.useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center rounded-md border border-input bg-background text-sm ring-offset-background transition-colors',
            'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
        >
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            className="flex-1 h-full px-3 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
            placeholder={placeholder}
            value={open ? search : selectedLabel}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              if (!open) setOpen(true);
            }}
          />
          {value && value !== '__none__' && !open && (
            <button
              type="button"
              className="px-1 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange('__none__');
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-[250px] overflow-y-auto" align="start">
        {filteredOptions.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          <div className="py-1">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  value === option.value && 'bg-accent text-accent-foreground'
                )}
                onClick={() => handleSelect(option.value)}
              >
                <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                {option.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

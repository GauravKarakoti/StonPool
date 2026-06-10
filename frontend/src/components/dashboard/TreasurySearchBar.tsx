import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  onSearch: (query: string) => void;
  isLoading?: boolean;
};

export function TreasurySearchBar({ onSearch, isLoading }: Props) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="relative mx-auto max-w-2xl">
      <div
        className={cn(
          'absolute -inset-px rounded-2xl transition-opacity duration-500 pointer-events-none',
          focused ? 'opacity-100' : 'opacity-0'
        )}
        style={{ background: 'linear-gradient(120deg, transparent, #0098EA, transparent)' }}
      />
      <div className="relative flex items-center gap-3 rounded-2xl glass-card px-5 py-4">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="@groupname, t.me/+invite, or chat ID"
          disabled={isLoading}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="hidden sm:inline-flex items-center rounded border border-border bg-surface px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Search
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Public groups: use <span className="font-mono">@username</span>, group name, or chat ID from{' '}
        <span className="font-mono">/dashboard</span>. Private groups: paste the invite link after{' '}
        <span className="font-mono">/set_invite</span>.
      </p>
    </form>
  );
}

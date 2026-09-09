'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { suggestTags, type CollectionTag } from '@/lib/tagName';
import { cn } from '@/lib/utils';

interface TagPickerProps {
  assignedTags: CollectionTag[];
  vocabulary: CollectionTag[];
  onAdd: (name: string) => Promise<void>;
  onRemove: (tagId: number) => Promise<void>;
  compact?: boolean;
  testId?: string;
}

export default function TagPicker({
  assignedTags,
  vocabulary,
  onAdd,
  onRemove,
  compact = false,
  testId,
}: TagPickerProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => suggestTags({
    query,
    vocabulary,
    assignedTagIds: assignedTags.map((tag) => tag.id),
  }), [assignedTags, query, vocabulary]);

  const optionCount = suggestions.matches.length + (suggestions.createName ? 1 : 0);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, optionCount]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const commitName = async (name: string) => {
    if (isBusy || !name) {
      return;
    }

    setIsBusy(true);
    try {
      await onAdd(name);
      setQuery('');
      setIsOpen(true);
      inputRef.current?.focus();
    } finally {
      setIsBusy(false);
    }
  };

  const commitHighlighted = async () => {
    if (suggestions.matches[highlightedIndex]) {
      await commitName(suggestions.matches[highlightedIndex].name);
      return;
    }

    if (suggestions.createName) {
      await commitName(suggestions.createName);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => (
        optionCount === 0 ? 0 : Math.min(current + 1, optionCount - 1)
      ));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void commitHighlighted();
      return;
    }

    if (event.key === 'Escape') {
      setQuery('');
      setIsOpen(false);
      return;
    }

    if (event.key === 'Backspace' && query === '' && assignedTags.length > 0) {
      event.preventDefault();
      void onRemove(assignedTags[assignedTags.length - 1].id);
    }
  };

  return (
    <div ref={rootRef} className="relative" data-testid={testId}>
      <div
        className={cn(
          'flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-white px-2 py-1',
          compact ? 'min-h-8' : 'min-h-10',
        )}
        onClick={() => {
          inputRef.current?.focus();
          setIsOpen(true);
        }}
      >
        {assignedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex max-w-full items-center gap-1 rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800"
            title={tag.name}
          >
            <span className="truncate">{tag.name}</span>
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              className="rounded-full p-0.5 hover:bg-violet-200"
              onClick={(event) => {
                event.stopPropagation();
                void onRemove(tag.id);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={isBusy}
          placeholder={assignedTags.length === 0 ? 'Add tag...' : ''}
          aria-label="Add tag"
          className="min-w-[7rem] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {isOpen && optionCount > 0 && (
        <div
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestions.matches.map((tag, index) => (
            <button
              key={tag.id}
              type="button"
              className={cn(
                'flex w-full px-3 py-2 text-left text-sm hover:bg-muted',
                highlightedIndex === index && 'bg-muted',
              )}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => {
                void commitName(tag.name);
              }}
            >
              {tag.name}
            </button>
          ))}
          {suggestions.createName && (
            <button
              type="button"
              className={cn(
                'flex w-full px-3 py-2 text-left text-sm hover:bg-muted',
                highlightedIndex === suggestions.matches.length && 'bg-muted',
              )}
              onMouseEnter={() => setHighlightedIndex(suggestions.matches.length)}
              onClick={() => {
                void commitName(suggestions.createName!);
              }}
            >
              Create “{suggestions.createName}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

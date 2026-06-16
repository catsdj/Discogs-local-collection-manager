'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DROPDOWN_GAP_PX = 4;
const DROPDOWN_MAX_HEIGHT_PX = 240;

interface StyleMultiSelectProps {
  styles: string[];
  selectedStyles: string[];
  onSelectionChange: (selectedStyles: string[]) => void;
  placeholder?: string;
  className?: string;
}

export default function StyleMultiSelect({
  styles,
  selectedStyles,
  onSelectionChange,
  placeholder = "Select styles...",
  className
}: StyleMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPlacement, setDropdownPlacement] = useState<'down' | 'up'>('down');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStyles = styles.filter(style =>
    style.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateDropdownPlacement = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuHeight = Math.min(menuRef.current?.offsetHeight || DROPDOWN_MAX_HEIGHT_PX, DROPDOWN_MAX_HEIGHT_PX);
    const spaceBelow = window.innerHeight - triggerRect.bottom - DROPDOWN_GAP_PX;
    const spaceAbove = triggerRect.top - DROPDOWN_GAP_PX;

    setDropdownPlacement(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'up' : 'down');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(updateDropdownPlacement);
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, filteredStyles.length, selectedStyles.length, updateDropdownPlacement]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updateDropdownPlacement);
    window.addEventListener('scroll', updateDropdownPlacement, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPlacement);
      window.removeEventListener('scroll', updateDropdownPlacement, true);
    };
  }, [isOpen, updateDropdownPlacement]);

  const handleTriggerClick = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    updateDropdownPlacement();
    setIsOpen(true);
  };

  const handleStyleToggle = (style: string) => {
    const newSelection = selectedStyles.includes(style)
      ? selectedStyles.filter(s => s !== style)
      : [...selectedStyles, style];
    
    onSelectionChange(newSelection);
  };

  const removeStyle = (style: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedStyles.filter(s => s !== style);
    onSelectionChange(newSelection);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange([]);
  };

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      {/* Selected styles display */}
      <div
        ref={triggerRef}
        className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={handleTriggerClick}
      >
        {selectedStyles.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedStyles.map((style) => (
              <span
                key={style}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground text-xs rounded"
              >
                {style}
                <button
                  onClick={(e) => removeStyle(style, e)}
                  className="hover:bg-primary-foreground/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {selectedStyles.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground px-1"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={menuRef}
          className={cn(
            "absolute z-50 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-hidden",
            dropdownPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              type="text"
              placeholder="Search styles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Styles list */}
          <div className="max-h-48 overflow-y-auto">
            {filteredStyles.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No styles found
              </div>
            ) : (
              filteredStyles.map((style) => (
                <div
                  key={style}
                  className="flex items-center px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                  onClick={() => handleStyleToggle(style)}
                >
                  <div className="flex items-center justify-center w-4 h-4 mr-2">
                    {selectedStyles.includes(style) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <span className={cn(
                    selectedStyles.includes(style) && "font-medium"
                  )}>
                    {style}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {selectedStyles.length > 0 && (
            <div className="p-2 border-t bg-muted/50">
              <div className="text-xs text-muted-foreground">
                {selectedStyles.length} style{selectedStyles.length !== 1 ? 's' : ''} selected
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


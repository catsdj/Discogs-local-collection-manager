'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { TextFilter, YearRangeFilter, DateRangeFilter, StyleFilter } from './ColumnFilters';

interface FilterDropdownProps {
  column: string;
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  // Filter values
  artistFilter: string;
  titleFilter: string;
  labelFilter: string;
  yearMinFilter: string;
  yearMaxFilter: string;
  yearValueFilter: string;
  dateAddedMinFilter: string;
  dateAddedMaxFilter: string;
  styleFilter: string[];
  availableStyles: string[];
  // Filter handlers
  onArtistFilterChange: (value: string) => void;
  onTitleFilterChange: (value: string) => void;
  onLabelFilterChange: (value: string) => void;
  onYearMinFilterChange: (value: string) => void;
  onYearMaxFilterChange: (value: string) => void;
  onYearValueFilterChange: (value: string) => void;
  onDateAddedMinFilterChange: (value: string) => void;
  onDateAddedMaxFilterChange: (value: string) => void;
  onStyleFilterChange: (value: string[]) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
}

export interface FilterDropdownRef {
  focusInput: () => void;
}

const FilterDropdown = forwardRef<FilterDropdownRef, FilterDropdownProps>(({
  column,
  isOpen,
  onClose,
  position,
  artistFilter,
  titleFilter,
  labelFilter,
  yearMinFilter,
  yearMaxFilter,
  yearValueFilter,
  dateAddedMinFilter,
  dateAddedMaxFilter,
  styleFilter,
  availableStyles,
  onArtistFilterChange,
  onTitleFilterChange,
  onLabelFilterChange,
  onYearMinFilterChange,
  onYearMaxFilterChange,
  onYearValueFilterChange,
  onDateAddedMinFilterChange,
  onDateAddedMaxFilterChange,
  onStyleFilterChange,
  onApplyFilters,
}, ref) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderFilter = () => {
    switch (column) {
      case 'artist':
        return (
          <TextFilter
            ref={inputRef}
            value={artistFilter}
            onChange={onArtistFilterChange}
            placeholder="Search by artist name..."
            onApply={onApplyFilters}
            onClear={() => {
              onArtistFilterChange('');
              onApplyFilters();
            }}
          />
        );
      case 'title':
        return (
          <TextFilter
            ref={inputRef}
            value={titleFilter}
            onChange={onTitleFilterChange}
            placeholder="Search by title..."
            onApply={onApplyFilters}
            onClear={() => {
              onTitleFilterChange('');
              onApplyFilters();
            }}
          />
        );
      case 'year':
        return (
          <div className="space-y-2">
            <YearRangeFilter
              minValue={yearMinFilter}
              maxValue={yearMaxFilter}
              onMinChange={onYearMinFilterChange}
              onMaxChange={onYearMaxFilterChange}
              onApply={onApplyFilters}
              onClear={() => {
                onYearMinFilterChange('');
                onYearMaxFilterChange('');
                onApplyFilters();
              }}
            />
            <TextFilter
              ref={inputRef}
              value={yearValueFilter}
              onChange={onYearValueFilterChange}
              placeholder="Search year (e.g., '199' for 1990s)"
              onApply={onApplyFilters}
              onClear={() => {
                onYearValueFilterChange('');
                onApplyFilters();
              }}
            />
          </div>
        );
      case 'label':
        return (
          <TextFilter
            ref={inputRef}
            value={labelFilter}
            onChange={onLabelFilterChange}
            placeholder="Search by label name..."
            onApply={onApplyFilters}
            onClear={() => {
              onLabelFilterChange('');
              onApplyFilters();
            }}
          />
        );
      case 'styles':
        return (
          <StyleFilter
            value={styleFilter}
            onChange={onStyleFilterChange}
            availableStyles={availableStyles}
            onApply={onApplyFilters}
            onClear={() => {
              onStyleFilterChange([]);
              onApplyFilters();
            }}
          />
        );
      case 'date_added':
        return (
          <DateRangeFilter
            minValue={dateAddedMinFilter}
            maxValue={dateAddedMaxFilter}
            onMinChange={onDateAddedMinFilterChange}
            onMaxChange={onDateAddedMaxFilterChange}
            onApply={onApplyFilters}
            onClear={() => {
              onDateAddedMinFilterChange('');
              onDateAddedMaxFilterChange('');
              onApplyFilters();
            }}
          />
        );
      case 'starting_price':
        return (
          <TextFilter
            ref={inputRef}
            value={artistFilter} // Reuse for price range
            onChange={onArtistFilterChange}
            placeholder="Min price (e.g., '10')"
            onApply={onApplyFilters}
            onClear={() => {
              onArtistFilterChange('');
              onApplyFilters();
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="fixed z-50"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {renderFilter()}
    </div>
  );
});
FilterDropdown.displayName = 'FilterDropdown';

export default FilterDropdown;

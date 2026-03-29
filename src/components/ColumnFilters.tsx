'use client';

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import StyleMultiSelect from '@/components/StyleMultiSelect';

interface TextFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onApply: () => void;
  onClear: () => void;
}

export const TextFilter = forwardRef<HTMLInputElement, TextFilterProps>(({ value, onChange, placeholder, onApply, onClear }, ref) => {
  return (
    <div className="p-3 bg-background border rounded-lg shadow-lg min-w-64">
      <div className="space-y-2">
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={onApply} className="flex-1">
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
});
TextFilter.displayName = 'TextFilter';

interface YearRangeFilterProps {
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export function YearRangeFilter({ 
  minValue, 
  maxValue, 
  onMinChange, 
  onMaxChange, 
  onApply, 
  onClear 
}: YearRangeFilterProps) {
  return (
    <div className="p-3 bg-background border rounded-lg shadow-lg min-w-64">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min Year"
            value={minValue}
            onChange={(e) => onMinChange(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
          <input
            type="number"
            placeholder="Max Year"
            value={maxValue}
            onChange={(e) => onMaxChange(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onApply} className="flex-1">
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DateRangeFilterProps {
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export function DateRangeFilter({ 
  minValue, 
  maxValue, 
  onMinChange, 
  onMaxChange, 
  onApply, 
  onClear 
}: DateRangeFilterProps) {
  return (
    <div className="p-3 bg-background border rounded-lg shadow-lg min-w-64">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="date"
            value={minValue}
            onChange={(e) => onMinChange(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
          <input
            type="date"
            value={maxValue}
            onChange={(e) => onMaxChange(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onApply} className="flex-1">
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}

interface StyleFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
  availableStyles: string[];
  onApply: () => void;
  onClear: () => void;
}

export function StyleFilter({ 
  value, 
  onChange, 
  availableStyles, 
  onApply, 
  onClear 
}: StyleFilterProps) {
  return (
    <div className="p-3 bg-background border rounded-lg shadow-lg min-w-80">
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          {availableStyles.length} styles available
        </div>
        <StyleMultiSelect
          styles={availableStyles}
          selectedStyles={value}
          onSelectionChange={onChange}
          placeholder="Select styles to filter..."
          className="w-full"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={onApply} className="flex-1">
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}


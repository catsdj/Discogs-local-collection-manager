'use client';

import { Button } from '@/components/ui/button';
import { useCollectionStore } from '@/stores/useCollectionStore';
import { useJobStatus } from '@/hooks/useJobStatus';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { clearCache } from '@/lib/cache';

interface CollectionControlsProps {
  onLoadCollection: () => void;
}

export function CollectionControls({ onLoadCollection }: CollectionControlsProps) {
  const {
    isLoading,
    cacheStats,
    setCacheStats,
    selectedStyles,
  } = useCollectionStore();
  
  const { jobStatus, startJob } = useJobStatus();

  const handleClearCache = () => {
    clearCache();
    // Update cache stats immediately so button disappears
    setCacheStats({ totalCached: 0, cacheSize: '0 KB' });
    console.log('Legacy browser cache cleared successfully');
  };

  const handleClearFilters = () => {
    // This would need to be passed from parent or use store
    useCollectionStore.getState().resetFilters();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onLoadCollection} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Load Collection'}
      </Button>
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => startJob()}
          disabled={isLoading || jobStatus.status === 'running' || jobStatus.status === 'pending'}
        >
          {jobStatus.status === 'running' || jobStatus.status === 'pending' ? (
            <div className="flex items-center gap-2">
              <LoadingSpinner />
              <span>Job Running...</span>
            </div>
          ) : (
            'Load All Details (Smart Cache)'
          )}
        </Button>
        
        <Button
          variant="outline"
          onClick={() => startJob(true)}
          disabled={isLoading || jobStatus.status === 'running' || jobStatus.status === 'pending'}
          size="sm"
        >
          Test (5 Records)
        </Button>
        
        <Button
          variant="outline"
          onClick={() => startJob(false, true)}
          disabled={isLoading || jobStatus.status === 'running' || jobStatus.status === 'pending'}
          size="sm"
        >
          Force All Records
        </Button>
      </div>
      
      {/* Database info instead of browser cache */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>💾 Database: 953 releases synced</span>
        {cacheStats.totalCached > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearCache}
            className="h-6 px-2 text-xs"
            title="Clear legacy browser cache"
          >
            Clear Browser Cache ({cacheStats.totalCached})
          </Button>
        )}
      </div>
      
      {selectedStyles.length > 0 && (
        <Button variant="outline" onClick={handleClearFilters} disabled={isLoading}>
          Clear Filters
        </Button>
      )}
    </div>
  );
}



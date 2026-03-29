import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

export function CollectionHeader() {
  return (
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>My Discogs Collection</CardTitle>
          <p className="text-sm text-muted-foreground">
            Filter your collection by music styles
          </p>
        </div>
        <Link href="/analytics">
          <Button variant="outline" size="sm">
            <TrendingUp className="h-4 w-4 mr-2" />
            View Analytics
          </Button>
        </Link>
      </div>
    </CardHeader>
  );
}



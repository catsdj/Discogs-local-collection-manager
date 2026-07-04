import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type SetupInfo = {
  configured: boolean;
  missing: string[];
  message: string | null;
  steps: string[];
  quickSetup: string;
};

export default function SetupRequiredCard({ setup }: { setup: SetupInfo }) {
  if (setup.configured) {
    return null;
  }

  return (
    <Card className="border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-amber-950 dark:text-amber-100">
          Setup required before syncing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-amber-950 dark:text-amber-50">
        <p>{setup.message}</p>
        <ol className="list-decimal space-y-2 pl-5">
          {setup.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="font-mono text-xs rounded-md border border-amber-200 bg-background/80 px-3 py-2 dark:border-amber-800">
          DISCOGS_API_TOKEN=your_token<br />
          DISCOGS_USERNAME=your_username
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default" size="sm">
            <a
              href="https://www.discogs.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Discogs API token
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{setup.quickSetup}</p>
      </CardContent>
    </Card>
  );
}

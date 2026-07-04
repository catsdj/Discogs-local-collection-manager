import { NextResponse } from 'next/server';
import { getDiscogsSetupStatus } from '@/lib/config';

export const SETUP_REQUIRED_CODE = 'SETUP_REQUIRED';

export function isDiscogsConfigured(): boolean {
  return getDiscogsSetupStatus().configured;
}

export function getSetupInstructions() {
  const status = getDiscogsSetupStatus();
  return {
    configured: status.configured,
    missing: status.missing,
    message: status.configured
      ? null
      : 'Add your Discogs API token and username before syncing your collection.',
    steps: [
      'Copy env.example to .env.local in the project root',
      'Create a personal access token at https://www.discogs.com/settings/developers',
      'Set DISCOGS_API_TOKEN and DISCOGS_USERNAME in .env.local',
      'Restart the dev server (npm run dev)',
    ],
    quickSetup: 'Or run: npm run setup',
  };
}

export function setupRequiredResponse() {
  const setup = getSetupInstructions();
  return NextResponse.json(
    {
      error: 'Discogs API credentials are not configured.',
      code: SETUP_REQUIRED_CODE,
      message: setup.message,
      setup,
    },
    { status: 503 },
  );
}

export function rejectIfNotConfigured(): NextResponse | null {
  if (!isDiscogsConfigured()) {
    return setupRequiredResponse();
  }
  return null;
}

import { NextRequest, NextResponse } from 'next/server';
import { getSetupInstructions } from '@/lib/setup';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  return NextResponse.json(getSetupInstructions());
}

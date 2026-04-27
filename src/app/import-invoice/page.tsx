import { Suspense } from 'react';
import InvoiceImportClient from '@/components/InvoiceImportClient';

export default function ImportInvoicePage() {
  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading invoice import...</div>}>
        <InvoiceImportClient />
      </Suspense>
    </div>
  );
}

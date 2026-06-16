'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ExternalLink, FileText, PlusCircle, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';

interface InvoiceCandidate {
  id: number;
  title: string;
  year: string | null;
  country: string | null;
  format: string[];
  labels: string[];
  catalogNumber: string | null;
  thumb: string | null;
  discogsUrl: string;
  score: number;
  confidence: 'strong' | 'possible' | 'weak';
  reasons: string[];
  inCollection: boolean;
}

interface InvoiceItem {
  id: string;
  catalogNumber: string;
  artist: string;
  title: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  rawDescription: string;
  catalogVariants: string[];
  candidates: InvoiceCandidate[];
  matchStatus?: 'pending' | 'searching' | 'matched' | 'no-match' | 'error';
  matchError?: string;
}

interface InvoiceImportResult {
  vendor: 'deejay.de';
  importId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  items: InvoiceItem[];
}

interface AddCollectionResult {
  releaseId: number;
  folderId?: number;
  folderName?: string;
  status: 'added' | 'already-local' | 'partial' | 'rejected' | 'error';
  discogsStatus?: string;
  error?: string;
}

interface CollectionFolder {
  id: number;
  name: string;
  count: number;
}

interface AddSelection {
  releaseId: number;
  folderId: number;
}

const confidenceClassNames: Record<InvoiceCandidate['confidence'], string> = {
  strong: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  possible: 'border-amber-200 bg-amber-50 text-amber-800',
  weak: 'border-gray-200 bg-gray-50 text-gray-700',
};

function formatPrice(value: number, currency: string | null) {
  return new Intl.NumberFormat(currency === 'EUR' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(value);
}

export default function InvoiceImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<InvoiceImportResult | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, number>>({});
  const [selectedFolderByItem, setSelectedFolderByItem] = useState<Record<string, number>>({});
  const [collectionFolders, setCollectionFolders] = useState<CollectionFolder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [addResults, setAddResults] = useState<AddCollectionResult[] | null>(null);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRunRef = useRef(0);

  const selectedCount = useMemo(
    () => Object.values(selectedCandidates).filter(Boolean).length,
    [selectedCandidates],
  );

  const defaultFolderId = useMemo(() => {
    const uncategorized = collectionFolders.find((folder) => folder.id === 1);
    return uncategorized?.id ?? collectionFolders[0]?.id ?? null;
  }, [collectionFolders]);

  const selectedRowsWithFolders = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.items
      .map((item): AddSelection | null => {
        const releaseId = selectedCandidates[item.id];
        const folderId = selectedFolderByItem[item.id] ?? defaultFolderId;

        if (!releaseId || !folderId) {
          return null;
        }

        return { releaseId, folderId };
      })
      .filter((selection): selection is AddSelection => selection !== null);
  }, [defaultFolderId, result, selectedCandidates, selectedFolderByItem]);

  useEffect(() => {
    let cancelled = false;

    async function loadCollectionFolders() {
      setIsLoadingFolders(true);
      setFolderError(null);

      try {
        const response = await fetch('/api/invoices/deejay?action=folders');
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load Discogs folders');
        }

        if (!cancelled) {
          setCollectionFolders(payload.folders || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFolderError(loadError instanceof Error ? loadError.message : 'Failed to load Discogs folders');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFolders(false);
        }
      }
    }

    void loadCollectionFolders();

    return () => {
      cancelled = true;
    };
  }, []);

  const getSelectedFolderId = (itemId: string) => selectedFolderByItem[itemId] ?? defaultFolderId;

  const setCandidateSelection = (itemId: string, releaseId: number) => {
    setSelectedCandidates((current) => ({
      ...current,
      [itemId]: releaseId,
    }));
    setSelectedFolderByItem((current) => {
      if (current[itemId] || !defaultFolderId) {
        return current;
      }

      return {
        ...current,
        [itemId]: defaultFolderId,
      };
    });
  };

  const clearCandidateSelection = (itemId: string) => {
    setSelectedCandidates((current) => {
      if (!(itemId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setSelectedFolderByItem((current) => {
      if (!(itemId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[itemId];
      return next;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setResult(null);
    setSelectedCandidates({});
    setSelectedFolderByItem({});
    setIsMatching(false);
    setAddResults(null);
    setAddMessage(null);
    setError(null);
  };

  const matchInvoiceItems = async (items: InvoiceItem[], runId: number, importId: string) => {
    setIsMatching(true);

    for (const item of items) {
      if (importRunRef.current !== runId) {
        return;
      }

      setResult((current) => current ? {
        ...current,
        items: current.items.map((currentItem) => (
          currentItem.id === item.id
            ? { ...currentItem, matchStatus: 'searching', matchError: undefined }
            : currentItem
        )),
      } : current);

      try {
        const response = await fetch(`/api/invoices/deejay?action=match&importId=${encodeURIComponent(importId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Discogs matching failed');
        }

        const candidates = payload.candidates as InvoiceCandidate[];
        setResult((current) => current ? {
          ...current,
          items: current.items.map((currentItem) => (
            currentItem.id === item.id
              ? {
                  ...currentItem,
                  candidates,
                  matchStatus: candidates.length > 0 ? 'matched' : 'no-match',
                }
              : currentItem
          )),
        } : current);

        const bestCandidate = candidates[0];
        if (bestCandidate?.confidence === 'strong') {
          setCandidateSelection(item.id, bestCandidate.id);
        }
      } catch (matchError) {
        setResult((current) => current ? {
          ...current,
          items: current.items.map((currentItem) => (
            currentItem.id === item.id
              ? {
                  ...currentItem,
                  matchStatus: 'error',
                  matchError: matchError instanceof Error ? matchError.message : 'Discogs matching failed',
                }
              : currentItem
          )),
        } : current);
      }
    }

    if (importRunRef.current === runId) {
      setIsMatching(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    const runId = importRunRef.current + 1;
    importRunRef.current = runId;
    setIsImporting(true);
    setIsMatching(false);
    setAddResults(null);
    setAddMessage(null);
    setError(null);
    setSelectedCandidates({});
    setSelectedFolderByItem({});

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/invoices/deejay', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Invoice import failed');
      }

      const parsedItems = (payload.items as InvoiceItem[]).map((item) => ({
        ...item,
        candidates: [],
        matchStatus: 'pending' as const,
      }));

      setResult({
        ...payload,
        items: parsedItems,
      });
      setIsImporting(false);
      void matchInvoiceItems(parsedItems, runId, payload.importId as string);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Invoice import failed');
      setIsMatching(false);
      setIsImporting(false);
    } finally {
      if (importRunRef.current !== runId) {
        setIsImporting(false);
      }
    }
  };

  const handleAddSelectedToCollection = async () => {
    if (selectedRowsWithFolders.length === 0) {
      return;
    }

    setIsAddingToCollection(true);
    setAddResults(null);
    setAddMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/invoices/deejay?action=add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selections: selectedRowsWithFolders, importId: result?.importId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add selected releases');
      }

      const results = payload.results as AddCollectionResult[];
      setAddResults(results);
      setAddMessage(typeof payload.message === 'string' ? payload.message : null);

      const successfulIds = new Set(
        results
          .filter((result) => result.status === 'added' || result.status === 'already-local')
          .map((result) => result.releaseId),
      );

      setResult((current) => current ? {
        ...current,
        items: current.items.map((item) => ({
          ...item,
          candidates: item.candidates.map((candidate) => ({
            ...candidate,
            inCollection: candidate.inCollection || successfulIds.has(candidate.id),
          })),
        })),
      } : current);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Failed to add selected releases');
    } finally {
      setIsAddingToCollection(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-2 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import Invoice</h1>
          <p className="mt-1 text-muted-foreground">POC for deejay.de PDF invoices and Discogs release matching.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">
            Back to collection
          </Link>
        </Button>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            deejay.de PDF
          </CardTitle>
          <CardDescription>
            Upload a generated deejay.de invoice. The app extracts line items, searches Discogs, and prepares a review list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:max-w-md"
            />
            <Button onClick={handleImport} disabled={!file || isImporting || isMatching}>
              {isImporting ? (
                <>
                  <Search className="h-4 w-4 animate-pulse" />
                  Extracting invoice...
                </>
              ) : isMatching ? (
                <>
                  <Search className="h-4 w-4 animate-pulse" />
                  Matching rows...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Extract and Match
                </>
              )}
            </Button>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Vendor</div>
                  <div className="font-semibold">{result.vendor}</div>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Invoice</div>
                  <div className="font-semibold">{result.invoiceNumber || 'Unknown'}</div>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Date</div>
                  <div className="font-semibold">{result.invoiceDate || 'Unknown'}</div>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="text-muted-foreground">Selected</div>
                  <div className="font-semibold">{selectedCount} of {result.items.length}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Add selected Discogs releases to the chosen Discogs folders and the local app database.
                </div>
                <Button
                  onClick={handleAddSelectedToCollection}
                  disabled={
                    selectedCount === 0 ||
                    selectedRowsWithFolders.length !== selectedCount ||
                    isLoadingFolders ||
                    isAddingToCollection ||
                    isImporting ||
                    isMatching
                  }
                >
                  {isAddingToCollection ? (
                    <>
                      <PlusCircle className="h-4 w-4 animate-pulse" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-4 w-4" />
                      Add Selected
                    </>
                  )}
                </Button>
              </div>
              <div className="mt-3 rounded-md border bg-muted p-3 text-sm">
                {isLoadingFolders ? (
                  <span className="text-muted-foreground">Loading Discogs folders...</span>
                ) : folderError ? (
                  <span className="text-red-700">{folderError}</span>
                ) : collectionFolders.length > 0 ? (
                  <span className="text-muted-foreground">
                    {collectionFolders.length} assignable Discogs folders loaded. The aggregate All folder is intentionally excluded.
                  </span>
                ) : (
                  <span className="text-red-700">No assignable Discogs folders are available.</span>
                )}
              </div>
              {addResults && (
                <div className="mt-3 space-y-2 rounded-md border bg-muted p-3 text-sm">
                  <div>
                    {addResults.filter((result) => result.status === 'added').length} added,{' '}
                    {addResults.filter((result) => result.status === 'already-local').length} already local,{' '}
                    {addResults.filter((result) => result.status === 'partial').length} partial,{' '}
                    {addResults.filter((result) => result.status === 'rejected' || result.status === 'error').length} failed.
                  </div>
                  {addResults.some((result) => result.error) && (
                    <div className="space-y-1 text-red-700">
                      {addResults
                        .filter((result) => result.error)
                        .map((result) => (
                          <div key={`${result.releaseId}-${result.folderId || 'none'}`}>
                            {result.releaseId}
                            {result.folderName ? ` -> ${result.folderName}` : ''}: {result.error}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {addMessage && (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {addMessage}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {result.items.map((item, itemIndex) => (
              <Card key={item.id} className="rounded-lg">
                <CardHeader>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-lg">{item.catalogNumber} - {item.artist}</CardTitle>
                      <CardDescription>{item.title}</CardDescription>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatPrice(item.unitPrice, result.currency)} x {item.quantity}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.catalogVariants.map((variant) => (
                      <span key={variant} className="rounded-md border bg-muted px-2 py-1">
                        {variant}
                      </span>
                    ))}
                  </div>

                  {(item.matchStatus === 'pending' || item.matchStatus === 'searching') ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Search className="h-4 w-4 animate-pulse" />
                        {item.matchStatus === 'searching' ? 'Searching Discogs...' : 'Queued for Discogs search...'}
                      </div>
                      <div className="grid gap-3">
                        {[0, 1].map((skeleton) => (
                          <div key={skeleton} className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[72px_1fr]">
                            <div className="h-[72px] w-[72px] animate-pulse rounded-md bg-muted" />
                            <div className="space-y-2">
                              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : item.matchStatus === 'error' ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {item.matchError || 'Discogs matching failed.'}
                    </div>
                  ) : item.candidates.length === 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      No candidates found. This row will need manual search in the next iteration.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <label
                        htmlFor={`${item.id}-skip`}
                        className={`grid cursor-pointer gap-3 rounded-lg border p-3 transition-colors md:grid-cols-[auto_1fr] ${
                          !selectedCandidates[item.id]
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-border bg-background hover:bg-muted/60'
                        }`}
                      >
                        <input
                          id={`${item.id}-skip`}
                          type="radio"
                          name={`item-${item.id}`}
                          checked={!selectedCandidates[item.id]}
                          onChange={() => clearCandidateSelection(item.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <div className="font-medium">Do not add this row</div>
                          <div className="text-sm text-muted-foreground">
                            Exclude this invoice line from the add-to-collection step.
                          </div>
                        </div>
                      </label>

                      {item.candidates.map((candidate) => {
                        const inputId = `${item.id}-${candidate.id}`;
                        const selected = selectedCandidates[item.id] === candidate.id;

                        return (
                          <label
                            key={candidate.id}
                            htmlFor={inputId}
                            className={`grid cursor-pointer gap-3 rounded-lg border p-3 transition-colors md:grid-cols-[auto_72px_1fr] ${
                              selected
                                ? 'border-blue-400 bg-blue-50'
                                : candidate.inCollection
                                  ? 'border-emerald-300 bg-emerald-50/70 hover:bg-emerald-50'
                                  : 'border-border bg-background hover:bg-muted/60'
                            }`}
                          >
                            <input
                              id={inputId}
                              type="radio"
                              name={`item-${item.id}`}
                              checked={selected}
                              onChange={() => setCandidateSelection(item.id, candidate.id)}
                              className="mt-2"
                            />
                            <div className="h-[72px] w-[72px] overflow-hidden rounded-md bg-muted">
                              {candidate.thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={candidate.thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                  No art
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="font-semibold text-blue-700">{candidate.title}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {[candidate.catalogNumber, candidate.year, candidate.country].filter(Boolean).join(' | ')}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {candidate.inCollection && (
                                    <div className="w-fit rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                                      In collection
                                    </div>
                                  )}
                                  <div className={`w-fit rounded-full border px-2 py-1 text-xs font-medium ${confidenceClassNames[candidate.confidence]}`}>
                                    {candidate.confidence} · {candidate.score}
                                  </div>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {[...candidate.labels, ...candidate.format].filter(Boolean).join(' · ')}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {candidate.reasons.map((reason) => (
                                  <span key={reason} className="rounded-md bg-muted px-2 py-1 text-xs">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                              <a
                                href={candidate.discogsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                              >
                                Open Discogs
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {selectedCandidates[item.id] && (
                    <div className="grid gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 sm:grid-cols-[1fr_240px] sm:items-center">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Row {itemIndex + 1} has a selected release for the next add-to-collection step.
                      </div>
                      <Select
                        value={String(getSelectedFolderId(item.id) || '')}
                        onChange={(event) => {
                          const folderId = Number(event.target.value);
                          if (!Number.isInteger(folderId)) {
                            return;
                          }

                          setSelectedFolderByItem((current) => ({
                            ...current,
                            [item.id]: folderId,
                          }));
                        }}
                        disabled={isLoadingFolders || collectionFolders.length === 0}
                        aria-label={`Discogs folder for invoice row ${itemIndex + 1}`}
                        className="bg-white"
                      >
                        <option value="" disabled>
                          {isLoadingFolders ? 'Loading folders...' : 'Choose folder'}
                        </option>
                        {collectionFolders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name} ({folder.count})
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

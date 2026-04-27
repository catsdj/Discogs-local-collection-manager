import zlib from 'zlib';

export interface DeejayInvoiceItem {
  id: string;
  catalogNumber: string;
  artist: string;
  title: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  rawDescription: string;
}

export interface DeejayInvoiceParseResult {
  vendor: 'deejay.de';
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  items: DeejayInvoiceItem[];
  extractedText: string;
}

const textStreamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const MAX_DECOMPRESSED_STREAM_BYTES = 1_000_000;
const MAX_EXTRACTED_TEXT_CHARS = 50_000;

function decodePdfString(value: string): string {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\u00a0/g, ' ')
    .trim();
}

function extractPdfText(buffer: Buffer): string {
  const content = buffer.toString('latin1');
  const lines: string[] = [];
  let extractedTextLength = 0;
  let match: RegExpExecArray | null;

  while ((match = textStreamPattern.exec(content)) !== null) {
    const compressed = Buffer.from(match[1], 'latin1');
    let decoded: Buffer;

    try {
      decoded = zlib.inflateSync(compressed);
    } catch {
      continue;
    }

    if (decoded.length > MAX_DECOMPRESSED_STREAM_BYTES) {
      throw new Error('PDF text stream is too large');
    }

    const stream = decoded.toString('latin1');
    if (!stream.includes('BT') || !stream.includes('TJ')) {
      continue;
    }

    const stringMatches = stream.matchAll(/\((?:\\.|[^\\)])*\)/g);
    for (const stringMatch of stringMatches) {
      const text = decodePdfString(stringMatch[0].slice(1, -1));
      if (text && /[A-Za-z0-9]/.test(text)) {
        lines.push(text);
        extractedTextLength += text.length + 1;

        if (extractedTextLength > MAX_EXTRACTED_TEXT_CHARS) {
          throw new Error('PDF text content is too large');
        }
      }
    }
  }

  return lines.join('\n');
}

function parseEuroNumber(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function parseDescription(description: string): Pick<DeejayInvoiceItem, 'catalogNumber' | 'artist' | 'title'> {
  const [catalogPart, ...rest] = description.split(/\s+-\s+/);
  const remainder = rest.join(' - ').trim();
  const titleBreak = remainder.lastIndexOf('- ');

  if (!catalogPart || !remainder || titleBreak === -1) {
    return {
      catalogNumber: catalogPart?.trim() || description.trim(),
      artist: '',
      title: remainder || description.trim(),
    };
  }

  return {
    catalogNumber: catalogPart.trim(),
    artist: remainder.slice(0, titleBreak).trim(),
    title: remainder.slice(titleBreak + 1).trim(),
  };
}

export function normalizeCatalogNumber(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

export function generateCatalogVariants(value: string): string[] {
  const trimmed = value.trim();
  const compact = trimmed.replace(/[^A-Za-z0-9]/g, '');
  const spaced = trimmed.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  const groups = compact.match(/^([A-Za-z]+)(\d.*)$/);
  const inferred = groups ? [`${groups[1]}-${groups[2]}`, `${groups[1]} ${groups[2]}`] : [];

  return Array.from(new Set([trimmed, compact, spaced, ...inferred].filter(Boolean)));
}

export function parseDeejayInvoicePdf(buffer: Buffer): DeejayInvoiceParseResult {
  const extractedText = extractPdfText(buffer);
  const lines = extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const invoiceNumberIndex = lines.findIndex((line) => line === 'Invoice No.:');
  const dateIndex = lines.findIndex((line) => line === 'Date:');
  const currencyIndex = lines.findIndex((line) => line === 'Currency:');
  const descriptionIndex = lines.findIndex((line) => line === 'Description');
  const quantityTotalIndex = lines.findIndex((line, index) => (
    index > descriptionIndex + 3 &&
    line === 'Quantity' &&
    /^\d+$/.test(lines[index + 1] || '')
  ));

  const tableStartIndex = descriptionIndex >= 0
    ? lines.findIndex((line, index) => index > descriptionIndex && line === 'Sum')
    : -1;
  const itemLines = tableStartIndex >= 0 && quantityTotalIndex > tableStartIndex
    ? lines.slice(tableStartIndex + 1, quantityTotalIndex)
    : [];

  const items: DeejayInvoiceItem[] = [];

  for (let index = 0; index < itemLines.length; index += 4) {
    const [rawDescription, unitPriceRaw, quantityRaw, totalPriceRaw] = itemLines.slice(index, index + 4);

    if (!rawDescription || !unitPriceRaw || !quantityRaw || !totalPriceRaw) {
      continue;
    }

    if (!/^\d+(?:,\d{2})?$/.test(unitPriceRaw) || !/^\d+$/.test(quantityRaw) || !/^\d+(?:,\d{2})?$/.test(totalPriceRaw)) {
      continue;
    }

    const parsedDescription = parseDescription(rawDescription);
    items.push({
      id: `${items.length + 1}-${normalizeCatalogNumber(parsedDescription.catalogNumber)}`,
      ...parsedDescription,
      unitPrice: parseEuroNumber(unitPriceRaw),
      quantity: Number(quantityRaw),
      totalPrice: parseEuroNumber(totalPriceRaw),
      rawDescription,
    });
  }

  return {
    vendor: 'deejay.de',
    invoiceNumber: invoiceNumberIndex >= 0 ? lines[invoiceNumberIndex + 1] || null : null,
    invoiceDate: dateIndex >= 0 ? lines[dateIndex + 1] || null : null,
    currency: currencyIndex >= 0 ? lines[currencyIndex + 1] || null : null,
    items,
    extractedText,
  };
}

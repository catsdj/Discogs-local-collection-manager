export const MAX_TAG_NAME_LENGTH = 60;

export type CollectionTag = {
  id: number;
  name: string;
};

export type ParsedTagName = {
  name: string;
  normalizedName: string;
};

export function parseTagName(raw: unknown): ParsedTagName | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_NAME_LENGTH);

  if (!name) {
    return null;
  }

  return {
    name,
    normalizedName: name.toLowerCase(),
  };
}

export function suggestTags(options: {
  query: string;
  vocabulary: CollectionTag[];
  assignedTagIds: number[];
}): { matches: CollectionTag[]; createName: string | null } {
  const parsedQuery = parseTagName(options.query);
  const assigned = new Set(options.assignedTagIds);
  const available = options.vocabulary.filter((tag) => !assigned.has(tag.id));

  if (!parsedQuery) {
    return {
      matches: available,
      createName: null,
    };
  }

  const matches = available.filter((tag) => (
    tag.name.toLowerCase().includes(parsedQuery.normalizedName)
  ));
  const exactMatch = matches.some((tag) => tag.name.toLowerCase() === parsedQuery.normalizedName);

  return {
    matches,
    createName: exactMatch ? null : parsedQuery.name,
  };
}

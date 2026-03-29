import { useMemo } from 'react';
import { DiscogsRelease } from '@/types/discogs';
import { useCollectionStore } from '@/stores/useCollectionStore';

export function useFilteredReleases(releases: DiscogsRelease[]) {
  const {
    artistFilter,
    titleFilter,
    labelFilter,
    yearMinFilter,
    yearMaxFilter,
    yearValueFilter,
    dateAddedMinFilter,
    dateAddedMaxFilter,
    styleFilter,
  } = useCollectionStore();

  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      // Artist filter
      if (artistFilter) {
        const artistNames = release.basic_information.artists
          .map((artist) => artist.name)
          .join(' ')
          .toLowerCase();
        if (!artistNames.includes(artistFilter.toLowerCase())) {
          return false;
        }
      }

      // Title filter
      if (titleFilter) {
        if (!release.basic_information.title.toLowerCase().includes(titleFilter.toLowerCase())) {
          return false;
        }
      }

      // Label filter
      if (labelFilter) {
        const labelNames = release.basic_information.labels
          .map((label) => label.name)
          .join(' ')
          .toLowerCase();
        if (!labelNames.includes(labelFilter.toLowerCase())) {
          return false;
        }
      }

      // Year range filter
      if (yearMinFilter || yearMaxFilter) {
        const year = release.basic_information.year;
        if (year === 0) {
          return false;
        }
        if (yearMinFilter && year < parseInt(yearMinFilter)) {
          return false;
        }
        if (yearMaxFilter && year > parseInt(yearMaxFilter)) {
          return false;
        }
      }

      // Year value filter
      if (yearValueFilter) {
        const year = release.basic_information.year;
        if (year === 0) {
          return false;
        }
        const yearStr = year.toString();
        if (!yearStr.includes(yearValueFilter)) {
          return false;
        }
      }

      // Date added range filter
      if (dateAddedMinFilter || dateAddedMaxFilter) {
        const dateAdded = new Date(release.date_added);
        if (dateAddedMinFilter && dateAdded < new Date(dateAddedMinFilter)) {
          return false;
        }
        if (dateAddedMaxFilter && dateAdded > new Date(dateAddedMaxFilter)) {
          return false;
        }
      }

      // Style filter
      if (styleFilter.length > 0) {
        const releaseStyles = release.basic_information.styles || [];
        if (
          !styleFilter.some((filterStyle) =>
            releaseStyles.some((releaseStyle) =>
              releaseStyle.toLowerCase().includes(filterStyle.toLowerCase())
            )
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    releases,
    artistFilter,
    titleFilter,
    labelFilter,
    yearMinFilter,
    yearMaxFilter,
    yearValueFilter,
    dateAddedMinFilter,
    dateAddedMaxFilter,
    styleFilter,
  ]);

  return filteredReleases;
}



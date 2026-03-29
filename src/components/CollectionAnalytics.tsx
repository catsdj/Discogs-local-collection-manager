'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Calendar, Star } from 'lucide-react';
import { DiscogsRelease, ReleaseDetails } from '@/types/discogs';

interface CollectionAnalyticsProps {
  releases: DiscogsRelease[];
  releaseDetails: Record<number, ReleaseDetails>;
}

interface CurrencyTotal {
  amount: number;
  count: number;
}

interface CollectionMetrics {
  totalValue: number; // Deprecated: kept for backward compatibility
  totalValueByCurrency: Map<string, CurrencyTotal>;
  averageValue: number; // Deprecated: use averageValueByCurrency
  averageValueByCurrency: Map<string, number>;
  mostValuableRelease: DiscogsRelease | null;
  mostValuableReleaseCurrency: string;
  collectionGrowthRate: {
    releasesThisMonth: number;
    releasesThisYear: number;
    totalReleases: number;
  };
  valueGrowthRate: {
    valueThisMonth: number;
    valueThisYear: number;
  };
  // Additional metrics that don't require pricing data
  oldestRelease: DiscogsRelease | null;
  newestRelease: DiscogsRelease | null;
  totalArtists: number;
  totalLabels: number;
  releasesWithPricing: number;
  releasesWithoutPricing: number;
}

function calculateCollectionMetrics(releases: DiscogsRelease[], releaseDetails: Record<number, ReleaseDetails>): CollectionMetrics {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Calculate total and average value using releaseDetails
  const releasesWithPrice = releases.filter(release => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return priceInfo?.lowest_price && priceInfo.lowest_price > 0;
  });
  
  // Track totals by currency
  const totalValueByCurrency = new Map<string, CurrencyTotal>();
  
  releasesWithPrice.forEach(release => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    
    if (priceInfo?.lowest_price && priceInfo.currency) {
      const currency = priceInfo.currency;
      const existing = totalValueByCurrency.get(currency) || { amount: 0, count: 0 };
      totalValueByCurrency.set(currency, {
        amount: existing.amount + priceInfo.lowest_price,
        count: existing.count + 1
      });
    }
  });
  
  // Calculate average value by currency
  const averageValueByCurrency = new Map<string, number>();
  totalValueByCurrency.forEach((data, currency) => {
    averageValueByCurrency.set(currency, data.amount / data.count);
  });
  
  const totalValue = releasesWithPrice.reduce((sum, release) => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return sum + (priceInfo?.lowest_price || 0);
  }, 0);
  
  const averageValue = releasesWithPrice.length > 0 
    ? totalValue / releasesWithPrice.length 
    : 0;
  
  // Find most valuable release (comparing only within same currency)
  let mostValuableRelease: DiscogsRelease | null = null;
  let mostValuableReleaseCurrency = 'USD';
  let maxPrice = 0;
  
  releasesWithPrice.forEach(release => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    const price = priceInfo?.lowest_price || 0;
    
    // For cross-currency comparison, we'll use EUR as slightly higher valued
    // This is a simplified comparison; in production, you'd use real exchange rates
    let normalizedPrice = price;
    if (priceInfo?.currency === 'EUR') {
      normalizedPrice = price * 1.1; // Rough EUR to USD conversion for comparison
    }
    
    if (normalizedPrice > maxPrice) {
      maxPrice = normalizedPrice;
      mostValuableRelease = release;
      mostValuableReleaseCurrency = priceInfo?.currency || 'USD';
    }
  });
  
  // Calculate growth rates
  const releasesThisMonth = releases.filter(release => {
    const addedDate = new Date(release.date_added);
    return addedDate.getMonth() === currentMonth && addedDate.getFullYear() === currentYear;
  }).length;
  
  const releasesThisYear = releases.filter(release => {
    const addedDate = new Date(release.date_added);
    return addedDate.getFullYear() === currentYear;
  }).length;
  
  const valueThisMonth = releases.filter(release => {
    const addedDate = new Date(release.date_added);
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return addedDate.getMonth() === currentMonth && 
           addedDate.getFullYear() === currentYear &&
           priceInfo?.lowest_price;
  }).reduce((sum, release) => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return sum + (priceInfo?.lowest_price || 0);
  }, 0);
  
  const valueThisYear = releases.filter(release => {
    const addedDate = new Date(release.date_added);
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return addedDate.getFullYear() === currentYear &&
           priceInfo?.lowest_price;
  }).reduce((sum, release) => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return sum + (priceInfo?.lowest_price || 0);
  }, 0);
  
  // Additional metrics that don't require pricing data
  const releasesWithPricing = releases.filter(release => {
    const releaseId = release.basic_information.id;
    const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
    return priceInfo?.lowest_price && priceInfo.lowest_price > 0;
  }).length;
  
  const releasesWithoutPricing = releases.length - releasesWithPricing;
  
  // Find oldest and newest releases by year
  const releasesWithYear = releases.filter(release => release.basic_information.year > 0);
  const oldestRelease = releasesWithYear.reduce((oldest, release) => 
    release.basic_information.year < oldest.basic_information.year ? release : oldest
  , releasesWithYear[0] || null);
  
  const newestRelease = releasesWithYear.reduce((newest, release) => 
    release.basic_information.year > newest.basic_information.year ? release : newest
  , releasesWithYear[0] || null);
  
  // Count unique artists and labels
  const uniqueArtists = new Set(releases.flatMap(release => 
    release.basic_information.artists.map(artist => artist.name)
  ));
  
  const uniqueLabels = new Set(releases.flatMap(release => 
    release.basic_information.labels.map(label => label.name)
  ));
  
  return {
    totalValue,
    totalValueByCurrency,
    averageValue,
    averageValueByCurrency,
    mostValuableRelease,
    mostValuableReleaseCurrency,
    collectionGrowthRate: {
      releasesThisMonth,
      releasesThisYear,
      totalReleases: releases.length
    },
    valueGrowthRate: {
      valueThisMonth,
      valueThisYear
    },
    oldestRelease,
    newestRelease,
    totalArtists: uniqueArtists.size,
    totalLabels: uniqueLabels.size,
    releasesWithPricing,
    releasesWithoutPricing
  };
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  // Determine locale based on currency
  const locale = currency === 'EUR' ? 'de-DE' : 'en-US';
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export default function CollectionAnalytics({ releases, releaseDetails }: CollectionAnalyticsProps) {
  const metrics = calculateCollectionMetrics(releases, releaseDetails);
  
  return (
    <div className="space-y-6 mb-8">
      {/* First row - Main metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Total Collection Value */}
      <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-green-800">
            Total Collection Value
          </CardTitle>
          <DollarSign className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          {metrics.releasesWithPricing > 0 ? (
            <div className="space-y-1">
              {Array.from(metrics.totalValueByCurrency.entries())
                .sort((a, b) => b[1].amount - a[1].amount) // Sort by amount, highest first
                .map(([currency, data]) => (
                  <div key={currency}>
                    <div className="text-2xl font-bold text-green-900">
                      {formatCurrency(data.amount, currency)}
                    </div>
                    <p className="text-xs text-green-700">
                      {formatNumber(data.count)} release{data.count !== 1 ? 's' : ''} in {currency}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-green-900">No pricing data</div>
              <p className="text-xs text-green-700 mt-1">
                {formatNumber(metrics.releasesWithoutPricing)} releases need pricing data
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Average Release Value */}
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-blue-800">
            Average Release Value
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          {metrics.releasesWithPricing > 0 ? (
            <div className="space-y-1">
              {Array.from(metrics.averageValueByCurrency.entries())
                .sort((a, b) => b[1] - a[1]) // Sort by average value, highest first
                .map(([currency, avgValue]) => (
                  <div key={currency}>
                    <div className="text-2xl font-bold text-blue-900">
                      {formatCurrency(avgValue, currency)}
                    </div>
                    <p className="text-xs text-blue-700">
                      Average per {currency} release
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-blue-900">N/A</div>
              <p className="text-xs text-blue-700 mt-1">
                Load pricing data to see average value
              </p>
            </>
          )}
        </CardContent>
      </Card>


      {/* Most Valuable Release / Oldest Release */}
      <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-amber-800">
            {metrics.mostValuableRelease ? 'Most Valuable Release' : 'Oldest Release'}
          </CardTitle>
          <Star className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          {metrics.mostValuableRelease ? (
            <>
              <div className="text-lg font-bold text-amber-900 truncate" title={metrics.mostValuableRelease.basic_information.title}>
                {metrics.mostValuableRelease.basic_information.title}
              </div>
              <div className="text-sm font-semibold text-amber-800">
                {formatCurrency(
                  (releaseDetails[metrics.mostValuableRelease.basic_information.id]?.priceInfo || metrics.mostValuableRelease.priceInfo)?.lowest_price || 0,
                  metrics.mostValuableReleaseCurrency
                )}
              </div>
              <p className="text-xs text-amber-700 mt-1">
                {metrics.mostValuableRelease.basic_information.artists[0]?.name}
              </p>
            </>
          ) : metrics.oldestRelease ? (
            <>
              <div className="text-lg font-bold text-amber-900 truncate" title={metrics.oldestRelease.basic_information.title}>
                {metrics.oldestRelease.basic_information.title}
              </div>
              <div className="text-sm font-semibold text-amber-800">
                {metrics.oldestRelease.basic_information.year}
              </div>
              <p className="text-xs text-amber-700 mt-1">
                {metrics.oldestRelease.basic_information.artists[0]?.name}
              </p>
            </>
          ) : (
            <div className="text-sm text-amber-700">
              No release data available
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      
      {/* Second row - Additional insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Artists */}
        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-indigo-800">
              Unique Artists
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-900">
              {formatNumber(metrics.totalArtists)}
            </div>
            <p className="text-xs text-indigo-700 mt-1">
              Across {formatNumber(metrics.collectionGrowthRate.totalReleases)} releases
            </p>
          </CardContent>
        </Card>

        {/* Total Labels */}
        <Card className="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-teal-800">
              Unique Labels
            </CardTitle>
            <Calendar className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-900">
              {formatNumber(metrics.totalLabels)}
            </div>
            <p className="text-xs text-teal-700 mt-1">
              Label diversity in collection
            </p>
          </CardContent>
        </Card>

        {/* Year Range */}
        <Card className="bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-rose-800">
              Year Range
            </CardTitle>
            <Star className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            {metrics.oldestRelease && metrics.newestRelease ? (
              <>
                <div className="text-2xl font-bold text-rose-900">
                  {metrics.oldestRelease.basic_information.year} - {metrics.newestRelease.basic_information.year}
                </div>
                <p className="text-xs text-rose-700 mt-1">
                  {metrics.newestRelease.basic_information.year - metrics.oldestRelease.basic_information.year} year span
                </p>
              </>
            ) : (
              <div className="text-sm text-rose-700">
                No year data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Coverage */}
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-800">
              Pricing Coverage
            </CardTitle>
            <DollarSign className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">
              {metrics.releasesWithPricing > 0 
                ? `${Math.round((metrics.releasesWithPricing / metrics.collectionGrowthRate.totalReleases) * 100)}%`
                : '0%'
              }
            </div>
            <p className="text-xs text-orange-700 mt-1">
              {formatNumber(metrics.releasesWithPricing)} of {formatNumber(metrics.collectionGrowthRate.totalReleases)} releases
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

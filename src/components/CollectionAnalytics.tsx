'use client';

import { useEffect, useState } from 'react';
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
  const [activeStatIndex, setActiveStatIndex] = useState(0);

  const statCards = [
    {
      title: 'Total Collection Value',
      Icon: DollarSign,
      shellClass: 'border-green-200 bg-gradient-to-br from-green-50 to-green-100',
      titleClass: 'text-green-800',
      iconClass: 'text-green-600',
      content: metrics.releasesWithPricing > 0 ? (
        <div className="space-y-1">
          {Array.from(metrics.totalValueByCurrency.entries())
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([currency, data]) => (
              <div key={currency}>
                <div className="text-xl font-bold text-green-900">
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
          <div className="text-xl font-bold text-green-900">No pricing data</div>
          <p className="mt-1 text-xs text-green-700">
            {formatNumber(metrics.releasesWithoutPricing)} releases need pricing data
          </p>
        </>
      ),
    },
    {
      title: 'Average Release Value',
      Icon: TrendingUp,
      shellClass: 'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100',
      titleClass: 'text-blue-800',
      iconClass: 'text-blue-600',
      content: metrics.releasesWithPricing > 0 ? (
        <div className="space-y-1">
          {Array.from(metrics.averageValueByCurrency.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([currency, avgValue]) => (
              <div key={currency}>
                <div className="text-xl font-bold text-blue-900">
                  {formatCurrency(avgValue, currency)}
                </div>
                <p className="text-xs text-blue-700">Average per {currency} release</p>
              </div>
            ))}
        </div>
      ) : (
        <>
          <div className="text-xl font-bold text-blue-900">N/A</div>
          <p className="mt-1 text-xs text-blue-700">Load pricing data to see average value</p>
        </>
      ),
    },
    {
      title: metrics.mostValuableRelease ? 'Most Valuable Release' : 'Oldest Release',
      Icon: Star,
      shellClass: 'border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100',
      titleClass: 'text-amber-800',
      iconClass: 'text-amber-600',
      content: metrics.mostValuableRelease ? (
        <>
          <div className="truncate text-base font-bold text-amber-900" title={metrics.mostValuableRelease.basic_information.title}>
            {metrics.mostValuableRelease.basic_information.title}
          </div>
          <div className="text-sm font-semibold text-amber-800">
            {formatCurrency(
              (releaseDetails[metrics.mostValuableRelease.basic_information.id]?.priceInfo || metrics.mostValuableRelease.priceInfo)?.lowest_price || 0,
              metrics.mostValuableReleaseCurrency
            )}
          </div>
          <p className="mt-1 text-xs text-amber-700">
            {metrics.mostValuableRelease.basic_information.artists[0]?.name}
          </p>
        </>
      ) : metrics.oldestRelease ? (
        <>
          <div className="truncate text-base font-bold text-amber-900" title={metrics.oldestRelease.basic_information.title}>
            {metrics.oldestRelease.basic_information.title}
          </div>
          <div className="text-sm font-semibold text-amber-800">
            {metrics.oldestRelease.basic_information.year}
          </div>
          <p className="mt-1 text-xs text-amber-700">
            {metrics.oldestRelease.basic_information.artists[0]?.name}
          </p>
        </>
      ) : (
        <div className="text-sm text-amber-700">No release data available</div>
      ),
    },
    {
      title: 'Unique Artists',
      Icon: TrendingUp,
      shellClass: 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-indigo-100',
      titleClass: 'text-indigo-800',
      iconClass: 'text-indigo-600',
      content: (
        <>
          <div className="text-xl font-bold text-indigo-900">{formatNumber(metrics.totalArtists)}</div>
          <p className="mt-1 text-xs text-indigo-700">
            Across {formatNumber(metrics.collectionGrowthRate.totalReleases)} releases
          </p>
        </>
      ),
    },
    {
      title: 'Unique Labels',
      Icon: Calendar,
      shellClass: 'border-teal-200 bg-gradient-to-br from-teal-50 to-teal-100',
      titleClass: 'text-teal-800',
      iconClass: 'text-teal-600',
      content: (
        <>
          <div className="text-xl font-bold text-teal-900">{formatNumber(metrics.totalLabels)}</div>
          <p className="mt-1 text-xs text-teal-700">Label diversity in collection</p>
        </>
      ),
    },
    {
      title: 'Year Range',
      Icon: Star,
      shellClass: 'border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100',
      titleClass: 'text-rose-800',
      iconClass: 'text-rose-600',
      content: metrics.oldestRelease && metrics.newestRelease ? (
        <>
          <div className="text-xl font-bold text-rose-900">
            {metrics.oldestRelease.basic_information.year} - {metrics.newestRelease.basic_information.year}
          </div>
          <p className="mt-1 text-xs text-rose-700">
            {metrics.newestRelease.basic_information.year - metrics.oldestRelease.basic_information.year} year span
          </p>
        </>
      ) : (
        <div className="text-sm text-rose-700">No year data available</div>
      ),
    },
    {
      title: 'Pricing Coverage',
      Icon: DollarSign,
      shellClass: 'border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100',
      titleClass: 'text-orange-800',
      iconClass: 'text-orange-600',
      content: (
        <>
          <div className="text-xl font-bold text-orange-900">
            {metrics.releasesWithPricing > 0
              ? `${Math.round((metrics.releasesWithPricing / metrics.collectionGrowthRate.totalReleases) * 100)}%`
              : '0%'
            }
          </div>
          <p className="mt-1 text-xs text-orange-700">
            {formatNumber(metrics.releasesWithPricing)} of {formatNumber(metrics.collectionGrowthRate.totalReleases)} releases
          </p>
        </>
      ),
    },
  ];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStatIndex((currentIndex) => (currentIndex + 1) % statCards.length);
    }, 3500);

    return () => window.clearInterval(interval);
  }, [statCards.length]);

  const activeStat = statCards[activeStatIndex % statCards.length];
  const ActiveIcon = activeStat.Icon;
  
  return (
    <div className="mb-5 max-w-sm">
      <Card className={`h-32 justify-between overflow-hidden rounded-lg py-3 transition-colors ${activeStat.shellClass}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1">
          <CardTitle className={`text-sm font-medium ${activeStat.titleClass}`}>
            {activeStat.title}
          </CardTitle>
          <ActiveIcon className={`h-4 w-4 ${activeStat.iconClass}`} />
        </CardHeader>
        <CardContent className="px-3">
          {activeStat.content}
        </CardContent>
      </Card>
      <div className="mt-2 flex gap-1.5">
        {statCards.map((statCard, index) => (
          <button
            key={statCard.title}
            type="button"
            onClick={() => setActiveStatIndex(index)}
            className={`h-1.5 rounded-full transition-all ${
              index === activeStatIndex ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'
            }`}
            aria-label={`Show ${statCard.title}`}
          />
        ))}
      </div>
    </div>
  );
}

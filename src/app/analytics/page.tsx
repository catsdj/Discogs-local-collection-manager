'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, BarChart3 } from 'lucide-react';
import Link from 'next/link';

interface DiscogsRelease {
  id: number;
  basic_information: {
    id: number;
    title: string;
    year: number;
    cover_image: string;
    artists: Array<{ name: string }>;
    styles: string[];
    genres: string[];
    labels: Array<{ name: string }>;
  };
  date_added: string;
  priceInfo?: {
    lowest_price: number | null;
    currency: string;
  };
}

interface MonthlyData {
  month: string;
  releases: number;
  valuesByCurrency: Map<string, number>;
}

interface YearData {
  year: number;
  totalReleases: number;
  totalValuesByCurrency: Map<string, number>;
  monthlyData: MonthlyData[];
}

interface AnalyticsCollectionResponse {
  releases?: DiscogsRelease[];
  pagination?: {
    pages?: number;
  };
  error?: string;
}

async function fetchAnalyticsPage(page: number, signal: AbortSignal): Promise<AnalyticsCollectionResponse> {
  const response = await fetch(`/api/discogs?page=${page}&per_page=500`, {
    signal,
    cache: 'no-store',
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('X-RateLimit-Reset-After');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    throw new Error(`Rate limit exceeded. Please wait ${retrySeconds} seconds before trying again.`);
  }

  return response.json();
}

export default function AnalyticsPage() {
  const [releases, setReleases] = useState<DiscogsRelease[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearData, setYearData] = useState<YearData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load collection data
  useEffect(() => {
    const controller = new AbortController();

    const loadData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const firstPage = await fetchAnalyticsPage(1, controller.signal);
        if (firstPage.error) {
          throw new Error(firstPage.error);
        }

        const totalPages = firstPage.pagination?.pages || 1;
        const remainingPagePromises = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
          fetchAnalyticsPage(index + 2, controller.signal)
        );
        const remainingPages = await Promise.all(remainingPagePromises);

        const allReleases: DiscogsRelease[] = [
          ...(firstPage.releases || []),
          ...remainingPages.flatMap((pageResult) => {
            if (pageResult.error) {
              throw new Error(pageResult.error);
            }
            return pageResult.releases || [];
          }),
        ];

        setReleases(allReleases);
        
        // Extract available years from releases
        const years = new Set<number>();
        allReleases.forEach((release: DiscogsRelease) => {
          const year = new Date(release.date_added).getFullYear();
          years.add(year);
        });
        
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        setAvailableYears(sortedYears);
        
        // Set default year to most recent year with data
        if (sortedYears.length > 0) {
          setSelectedYear(sortedYears[0]);
        }
        
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.error('Error loading analytics data:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load analytics data.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      controller.abort();
    };
  }, []);

  // Calculate year data when releases or selected year changes
  useEffect(() => {
    if (releases.length === 0) return;
    const releaseDetails: Record<number, { videos: unknown[]; tracklist: unknown[]; priceInfo?: { lowest_price: number | null; currency: string } }> = {};

    const releasesInYear = releases.filter(release => {
      const year = new Date(release.date_added).getFullYear();
      return year === selectedYear;
    });

    // Group by month
    const monthlyGroups: { [key: string]: DiscogsRelease[] } = {};
    releasesInYear.forEach(release => {
      const date = new Date(release.date_added);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = [];
      }
      monthlyGroups[monthKey].push(release);
    });

    // Convert to monthly data with currency grouping
    const monthlyData: MonthlyData[] = Object.entries(monthlyGroups)
      .map(([monthKey, monthReleases]) => {
        const date = new Date(monthKey + '-01');
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        // Group values by currency
        const valuesByCurrency = new Map<string, number>();
        monthReleases.forEach(release => {
          const releaseId = release.basic_information.id;
          const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
          if (priceInfo?.lowest_price && priceInfo.currency) {
            const current = valuesByCurrency.get(priceInfo.currency) || 0;
            valuesByCurrency.set(priceInfo.currency, current + priceInfo.lowest_price);
          }
        });

        return {
          month: monthName,
          releases: monthReleases.length,
          valuesByCurrency
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateA.getTime() - dateB.getTime();
      });

    // Calculate totals by currency
    const totalReleases = releasesInYear.length;
    const totalValuesByCurrency = new Map<string, number>();
    
    releasesInYear.forEach(release => {
      const releaseId = release.basic_information.id;
      const priceInfo = releaseDetails[releaseId]?.priceInfo || release.priceInfo;
      if (priceInfo?.lowest_price && priceInfo.currency) {
        const current = totalValuesByCurrency.get(priceInfo.currency) || 0;
        totalValuesByCurrency.set(priceInfo.currency, current + priceInfo.lowest_price);
      }
    });

    setYearData({
      year: selectedYear,
      totalReleases,
      totalValuesByCurrency,
      monthlyData
    });
  }, [releases, selectedYear]);

  const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    const locale = currency === 'EUR' ? 'de-DE' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getMaxReleases = (): number => {
    if (!yearData) return 0;
    return Math.max(...yearData.monthlyData.map(m => m.releases));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading analytics data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-7xl mx-auto">
          <Card className="max-w-xl mx-auto mt-12">
            <CardHeader>
              <CardTitle>Analytics Unavailable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{loadError}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Collection
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Collection Analytics</h1>
              <p className="text-muted-foreground">Deep insights into your Discogs collection</p>
            </div>
          </div>
        </div>

        {/* Year Selector */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Collection Growth Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <label htmlFor="year-select" className="text-sm font-medium">
                Select Year:
              </label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border rounded-md bg-background"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              {yearData && (
                <div className="text-sm text-muted-foreground">
                  {yearData.totalReleases} releases • {
                    Array.from(yearData.totalValuesByCurrency.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([currency, value]) => formatCurrency(value, currency))
                      .join(' + ')
                  } total value
                </div>
              )}
            </div>

            {/* Monthly Growth Chart */}
            {yearData && yearData.monthlyData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Releases Added by Month</h3>
                </div>
                
                <div className="flex gap-4">
                  {(() => {
                    const maxReleases = getMaxReleases();
                    
                    // Calculate nice intervals for Y-axis
                    const calculateYAxisConfig = (max: number): { steps: number[], adjustedMax: number } => {
                      if (max === 0) return { steps: [0], adjustedMax: 0 };
                      
                      // Find a nice step size
                      let stepSize = 1;
                      if (max > 50) stepSize = 10;
                      else if (max > 20) stepSize = 5;
                      else if (max > 10) stepSize = 2;
                      
                      const numSteps = Math.ceil(max / stepSize);
                      const adjustedMax = numSteps * stepSize;
                      
                      // Generate 5-6 evenly spaced labels
                      const steps: number[] = [];
                      for (let i = 5; i >= 0; i--) {
                        steps.push(Math.round((adjustedMax * i) / 5));
                      }
                      
                      return { steps, adjustedMax };
                    };
                    
                    const { steps: yAxisSteps, adjustedMax } = calculateYAxisConfig(maxReleases);
                    
                    return (
                      <>
                        {/* Y-axis labels */}
                        <div className="flex flex-col justify-between h-64 py-2">
                          {yAxisSteps.map((value, index) => (
                            <div key={index} className="text-xs text-muted-foreground text-right pr-2 min-w-[30px]">
                              {value}
                            </div>
                          ))}
                        </div>
                        
                        {/* Chart bars */}
                        <div className="flex-1 flex gap-2 items-end h-64 border-l border-b border-gray-200 pl-2 py-2 mb-8">
                          {yearData.monthlyData.map((month, index) => {
                            // Use adjustedMax instead of actual max for consistent scaling
                            // h-64 = 256px, py-2 = 16px padding, leaving 240px
                            // Reserve ~50px for labels (release count + month label), leaving 190px for bars
                            const heightPx = adjustedMax > 0 ? Math.max((month.releases / adjustedMax) * 190, 4) : 4;
                            
                            const tooltipText = `${month.releases} releases • ${
                              Array.from(month.valuesByCurrency.entries())
                                .sort((a, b) => b[1] - a[1])
                                .map(([currency, value]) => formatCurrency(value, currency))
                                .join(' + ')
                            }`;
                            
                            return (
                              <div key={index} className="flex flex-col items-center gap-2 flex-1">
                                <div className="flex flex-col items-center gap-1 w-full">
                                  <div
                                    className="bg-blue-500 rounded-t w-full transition-all duration-300 hover:bg-blue-600 cursor-pointer"
                                    style={{ height: `${heightPx}px` }}
                                    title={tooltipText}
                                  />
                                  <div className="text-xs font-medium">
                                    {month.releases}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground text-center transform -rotate-45 origin-top-left whitespace-nowrap mt-1">
                                  {month.month.split(' ')[0]}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Chart Legend */}
                <div className="flex items-center justify-between text-sm text-muted-foreground mt-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span>Releases Added</span>
                    </div>
                  </div>
                  <div>
                    Max: {getMaxReleases()} releases
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No data available for {selectedYear}</p>
                <p className="text-sm">Try selecting a different year</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {yearData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-800">
                  Total Releases by Year
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900 mb-4">
                  {releases.length}
                </div>
                <p className="text-xs text-blue-700 mb-3">
                  Total collection size
                </p>
                
                {/* Yearly breakdown chart */}
                <div className="space-y-2">
                  {availableYears.map(year => {
                    const yearReleases = releases.filter(release => {
                      const releaseYear = new Date(release.date_added).getFullYear();
                      return releaseYear === year;
                    }).length;
                    
                    const maxYearReleases = Math.max(...availableYears.map(y => {
                      return releases.filter(release => {
                        const releaseYear = new Date(release.date_added).getFullYear();
                        return releaseYear === y;
                      }).length;
                    }));
                    
                    const percentage = maxYearReleases > 0 ? (yearReleases / maxYearReleases) * 100 : 0;
                    const isSelectedYear = year === selectedYear;
                    
                    return (
                      <div key={year} className="flex items-center gap-2">
                        <div className="text-xs text-blue-700 w-12 text-right font-medium">
                          {year}
                        </div>
                        <div className="flex-1 bg-blue-100 rounded-full h-6 relative">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isSelectedYear ? 'bg-blue-600' : 'bg-blue-400'
                            }`}
                            style={{ width: `${Math.max(percentage, 5)}%` }}
                            title={`${yearReleases} releases in ${year}`}
                          />
                        </div>
                        <span className="text-xs font-semibold text-blue-700 w-10 text-left">
                          {yearReleases}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-800">
                  Total Value ({selectedYear})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {yearData.totalValuesByCurrency.size > 0 ? (
                  <div className="space-y-1">
                    {Array.from(yearData.totalValuesByCurrency.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([currency, value]) => (
                        <div key={currency}>
                          <div className="text-2xl font-bold text-green-900">
                            {formatCurrency(value, currency)}
                          </div>
                          <p className="text-xs text-green-700">
                            {currency} investment this year
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-green-900">No pricing data</div>
                    <p className="text-xs text-green-700 mt-1">
                      Investment this year
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-purple-800">
                  Average per Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-900">
                  {yearData.monthlyData.length > 0 
                    ? Math.round(yearData.totalReleases / yearData.monthlyData.length)
                    : 0
                  }
                </div>
                <p className="text-xs text-purple-700 mt-1">
                  Releases per month
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

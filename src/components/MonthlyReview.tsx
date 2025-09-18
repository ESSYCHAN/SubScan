// src/components/MonthlyReview.tsx
// Complete Monthly Review component that works with your existing budget system

"use client";

import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  AlertCircle, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Target,
  CheckCircle2
} from 'lucide-react';
import { useEnhancedBudget } from '@/components/HouseholdBudgetProvider';

// Helper function for currency formatting
const fmt = (n: number) => `£${(n || 0).toFixed(2)}`;

// Define the insight type
interface InsightItem {
  name: string;
  emoji: string;
  budgeted: number;
  spent: number;
  variance: number;
  percentVar: number;
  status: 'on-track' | 'over' | 'under';
}

interface MonthSummary {
  month: string;
  totalBudgeted: number;
  totalSpent: number;
  totalVariance: number;
  overCategories: number;
  onTrackCategories: number;
  underCategories: number;
}

export function MonthlyReview() {
  const { categories } = useEnhancedBudget();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 7); // YYYY-MM format
  });

  // Generate available months (last 6 months)
  const availableMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toISOString().slice(0, 7);
      const monthName = date.toLocaleDateString('en-GB', { 
        month: 'long', 
        year: 'numeric' 
      });
      months.push({ key: monthKey, name: monthName, date });
    }
    return months;
  }, []);

  // Calculate insights for selected month
  const monthlyInsights = useMemo((): { insights: InsightItem[], summary: MonthSummary } => {
    const insights: InsightItem[] = [];
    let totalBudgeted = 0;
    let totalSpent = 0;
    let overCategories = 0;
    let onTrackCategories = 0;
    let underCategories = 0;

    categories.forEach(cat => {
      // For demo purposes, we'll use the current spent amount as historical data
      // In a real app, this would come from historical budget period data
      const budgeted = cat.monthlyBudget || 0;
      const spent = cat.spent || 0;
      
      if (budgeted === 0) return; // Skip categories without budget
      
      const variance = spent - budgeted;
      const percentVar = budgeted > 0 ? (variance / budgeted) * 100 : 0;
      
      let status: 'on-track' | 'over' | 'under';
      if (Math.abs(percentVar) < 5) {
        status = 'on-track';
        onTrackCategories++;
      } else if (percentVar > 0) {
        status = 'over';
        overCategories++;
      } else {
        status = 'under';
        underCategories++;
      }

      insights.push({
        name: cat.name,
        emoji: cat.emoji,
        budgeted,
        spent,
        variance,
        percentVar,
        status
      });

      totalBudgeted += budgeted;
      totalSpent += spent;
    });

    const totalVariance = totalSpent - totalBudgeted;

    return {
      insights: insights.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)),
      summary: {
        month: selectedMonth,
        totalBudgeted,
        totalSpent,
        totalVariance,
        overCategories,
        onTrackCategories,
        underCategories
      }
    };
  }, [categories, selectedMonth]);

  const { insights, summary } = monthlyInsights;

  // Navigation functions
  const goToPreviousMonth = () => {
    const currentIndex = availableMonths.findIndex(m => m.key === selectedMonth);
    if (currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1].key);
    }
  };

  const goToNextMonth = () => {
    const currentIndex = availableMonths.findIndex(m => m.key === selectedMonth);
    if (currentIndex > 0) {
      setSelectedMonth(availableMonths[currentIndex - 1].key);
    }
  };

  const currentMonthName = availableMonths.find(m => m.key === selectedMonth)?.name || selectedMonth;
  
  // Show welcome message if no budget categories
  if (categories.length === 0 || categories.every(cat => (cat.monthlyBudget || 0) === 0)) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-8 text-center border border-blue-100">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-xl font-semibold text-blue-900 mb-2">Welcome to Monthly Budgeting</h3>
        <p className="text-blue-700 mb-4">Set up your monthly budget amounts in the categories above to start tracking your spending performance.</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-lg text-sm text-blue-800">
          <Target className="w-4 h-4" />
          Complete your first month to see insights here
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Month Navigation */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={goToPreviousMonth}
              disabled={availableMonths.findIndex(m => m.key === selectedMonth) === availableMonths.length - 1}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">{currentMonthName}</h2>
              <p className="text-sm text-gray-500">Budget Performance Review</p>
            </div>
            
            <button 
              onClick={goToNextMonth}
              disabled={availableMonths.findIndex(m => m.key === selectedMonth) === 0}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {availableMonths.map(month => (
                <option key={month.key} value={month.key}>
                  {month.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-6 h-6 text-blue-600" />
              <span className="text-sm text-blue-600 font-medium">Budgeted</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">{fmt(summary.totalBudgeted)}</div>
          </div>

          <div className="bg-purple-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-6 h-6 text-purple-600" />
              <span className="text-sm text-purple-600 font-medium">Spent</span>
            </div>
            <div className="text-2xl font-bold text-purple-900">{fmt(summary.totalSpent)}</div>
          </div>

          <div className={`rounded-xl p-4 ${
            summary.totalVariance >= 0 ? 'bg-red-50' : 'bg-green-50'
          }`}>
            <div className="flex items-center justify-between mb-2">
              {summary.totalVariance >= 0 ? 
                <TrendingUp className="w-6 h-6 text-red-600" /> :
                <TrendingDown className="w-6 h-6 text-green-600" />
              }
              <span className={`text-sm font-medium ${
                summary.totalVariance >= 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                {summary.totalVariance >= 0 ? 'Over' : 'Under'}
              </span>
            </div>
            <div className={`text-2xl font-bold ${
              summary.totalVariance >= 0 ? 'text-red-900' : 'text-green-900'
            }`}>
              {fmt(Math.abs(summary.totalVariance))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 className="w-6 h-6 text-gray-600" />
              <span className="text-sm text-gray-600 font-medium">Categories</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{insights.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.onTrackCategories} on track • {summary.overCategories} over • {summary.underCategories} under
            </div>
          </div>
        </div>
      </div>

      {/* Category Performance Details */}
      <div className="bg-white rounded-2xl border border-gray-200">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Category Performance</h3>
          <p className="text-sm text-gray-500 mt-1">How each budget category performed this month</p>
        </div>
        
        <div className="p-6">
          {insights.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Budget Data</h4>
              <p className="text-gray-600">Set monthly budget amounts for your categories to see performance insights.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {insights.map((insight, idx) => {
                const progressPercent = Math.min(100, (insight.spent / insight.budgeted) * 100);
                
                return (
                  <div key={idx} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{insight.emoji}</span>
                        <div>
                          <h4 className="font-semibold text-gray-900">{insight.name}</h4>
                          <p className="text-sm text-gray-500">
                            {fmt(insight.spent)} of {fmt(insight.budgeted)} budgeted
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                          insight.status === 'on-track' ? 'bg-green-100 text-green-700' :
                          insight.status === 'over' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {insight.status === 'on-track' ? 
                            <CheckCircle2 className="w-4 h-4" /> :
                            insight.status === 'over' ?
                            <TrendingUp className="w-4 h-4" /> :
                            <TrendingDown className="w-4 h-4" />
                          }
                          {insight.variance > 0 ? '+' : ''}{fmt(insight.variance)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {insight.percentVar > 0 ? '+' : ''}{insight.percentVar.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          insight.status === 'over' ? 'bg-red-500' :
                          insight.status === 'on-track' ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                      {/* Overspend indicator */}
                      {insight.spent > insight.budgeted && (
                        <div 
                          className="h-3 bg-red-300 -mt-3"
                          style={{ 
                            width: `${Math.min(50, ((insight.spent - insight.budgeted) / insight.budgeted) * 100)}%`,
                            marginLeft: '100%'
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Insights and Recommendations */}
      {insights.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Insights & Tips</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Biggest overspend */}
            {insights.some(i => i.status === 'over') && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Biggest Challenge
                </h4>
                {(() => {
                  const biggestOverspend = insights
                    .filter(i => i.status === 'over')
                    .sort((a, b) => b.variance - a.variance)[0];
                  
                  return biggestOverspend && (
                    <div>
                      <p className="text-red-700 text-sm mb-2">
                        <strong>{biggestOverspend.name}</strong> went over by {fmt(biggestOverspend.variance)} 
                        ({biggestOverspend.percentVar.toFixed(1)}% over budget)
                      </p>
                      <p className="text-red-600 text-xs">
                        Consider adjusting next month's budget or finding ways to reduce spending.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Best performance */}
            {insights.some(i => i.status === 'under') && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Great Performance
                </h4>
                {(() => {
                  const biggestUnderspend = insights
                    .filter(i => i.status === 'under')
                    .sort((a, b) => a.variance - b.variance)[0];
                  
                  return biggestUnderspend && (
                    <div>
                      <p className="text-green-700 text-sm mb-2">
                        <strong>{biggestUnderspend.name}</strong> came in {fmt(Math.abs(biggestUnderspend.variance))} under budget
                      </p>
                      <p className="text-green-600 text-xs">
                        Excellent control! Consider if this budget can be optimized for other categories.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Overall summary */}
          <div className="mt-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-blue-800 text-sm">
              <strong>Overall:</strong> You {summary.totalVariance >= 0 ? 'overspent' : 'underspent'} by{' '}
              <strong>{fmt(Math.abs(summary.totalVariance))}</strong> this month.{' '}
              {summary.onTrackCategories > 0 && (
                <span>{summary.onTrackCategories} categories stayed on track. </span>
              )}
              {summary.totalVariance < 0 ? 
                'Great job staying under budget!' : 
                'Consider reviewing your spending patterns for next month.'
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
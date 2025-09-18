// components/GroupedBudgetSheet.tsx
// src/components/GroupedBudgetSheet.tsx
// Complete enhanced version with monthly periods support

"use client";

import React, { useState, useMemo } from 'react';
import { useEnhancedBudget } from '@/components/HouseholdBudgetProvider';
import { Calendar, ChevronDown } from 'lucide-react';

const gbp = (n: number) => `£${(n || 0).toFixed(2)}`;

// Month Selector Component
function MonthSelector() {
  const { currentMonth, budgetPeriods, startNewMonth } = useEnhancedBudget();
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [isOpen, setIsOpen] = useState(false);

  // Available months for dropdown
  const monthOptions = useMemo(() => {
    const months = Object.keys(budgetPeriods).sort().slice(-12); // Last 12 months
    if (!months.includes(currentMonth)) {
      months.push(currentMonth);
    }
    return months.sort().reverse(); // Most recent first
  }, [budgetPeriods, currentMonth]);

  const formatMonthName = (monthStr: string) => {
    try {
      return new Date(monthStr + '-01').toLocaleDateString('en-GB', { 
        year: 'numeric', 
        month: 'long' 
      });
    } catch {
      return monthStr;
    }
  };

  // Check if we can start a new month (end of current month)
  const canStartNewMonth = useMemo(() => {
    const now = new Date();
    const isEndOfMonth = now.getDate() > 25; // Last week of month
    const isCurrentMonth = viewMonth === currentMonth;
    return isCurrentMonth && isEndOfMonth;
  }, [viewMonth, currentMonth]);

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-900">Monthly Budget</h2>
        
        {/* Month Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl text-sm border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            <Calendar className="w-4 h-4 text-gray-600" />
            <span>{formatMonthName(viewMonth)}</span>
            <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isOpen && (
            <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 z-10">
              <div className="py-2">
                {monthOptions.map(month => {
                  const isCurrent = month === currentMonth;
                  const isSelected = month === viewMonth;
                  
                  return (
                    <button
                      key={month}
                      onClick={() => {
                        setViewMonth(month);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{formatMonthName(month)}</span>
                        {isCurrent && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            Current
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {viewMonth !== currentMonth && (
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Historical View
          </span>
        )}
      </div>

      {/* New Month Button */}
      {canStartNewMonth && (
        <button
          onClick={startNewMonth}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Start Next Month
        </button>
      )}
    </div>
  );
}

// Summary Cards Component
function MonthlySummaryCards({ viewMonth, isCurrentMonth }: { viewMonth: string; isCurrentMonth: boolean }) {
  const { categories, getMonthData } = useEnhancedBudget();
  
  const monthData = getMonthData(viewMonth);

  const monthCategories = useMemo(() => {
    if (isCurrentMonth) {
      return categories; // Use live data for current month
    }
    
    // Use historical data for past months
    return categories.map(cat => {
      const monthCat = monthData?.categories[cat.id];
      return {
        ...cat,
        spent: monthCat?.spent ?? 0,
        monthlyBudget: monthCat?.budgeted ?? cat.monthlyBudget
      };
    });
  }, [categories, isCurrentMonth, monthData]);

  const totals = useMemo(() => {
    const totalBudgeted = monthCategories.reduce((sum, c) => sum + (c.monthlyBudget || 0), 0);
    const totalSpent = monthCategories.reduce((sum, c) => sum + (c.spent || 0), 0);
    const remaining = totalBudgeted - totalSpent;
    const variance = totalSpent - totalBudgeted;
    
    return { totalBudgeted, totalSpent, remaining, variance };
  }, [monthCategories]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
        <div className="text-sm opacity-90">Budgeted</div>
        <div className="text-xl font-bold">{gbp(totals.totalBudgeted)}</div>
        <div className="text-xs opacity-75">{monthCategories.length} categories</div>
      </div>
      
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-4 text-white">
        <div className="text-sm opacity-90">Spent</div>
        <div className="text-xl font-bold">{gbp(totals.totalSpent)}</div>
        <div className="text-xs opacity-75">
          {totals.totalBudgeted > 0 ? ((totals.totalSpent / totals.totalBudgeted) * 100).toFixed(1) : 0}% used
        </div>
      </div>
      
      <div className={`rounded-xl p-4 text-white ${
        totals.remaining >= 0 
          ? 'bg-gradient-to-r from-green-500 to-green-600' 
          : 'bg-gradient-to-r from-red-500 to-red-600'
      }`}>
        <div className="text-sm opacity-90">Remaining</div>
        <div className="text-xl font-bold">{gbp(totals.remaining)}</div>
        <div className="text-xs opacity-75">
          {totals.remaining >= 0 ? 'Under budget' : 'Over budget'}
        </div>
      </div>
      
      <div className={`rounded-xl p-4 text-white ${
        totals.variance <= 0 
          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' 
          : 'bg-gradient-to-r from-orange-500 to-orange-600'
      }`}>
        <div className="text-sm opacity-90">Variance</div>
        <div className="text-xl font-bold">
          {totals.variance >= 0 ? '+' : ''}{gbp(totals.variance)}
        </div>
        <div className="text-xs opacity-75">vs budget</div>
      </div>
    </div>
  );
}

// Category Group Component
function CategoryGroup({ 
  title, 
  categories, 
  emoji, 
  isCurrentMonth 
}: { 
  title: string; 
  categories: any[]; 
  emoji: string; 
  isCurrentMonth: boolean; 
}) {
  if (categories.length === 0) return null;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <span>{emoji}</span>
        {title}
        <span className="text-xs text-gray-500">({categories.length})</span>
      </h4>
      
      <div className="grid gap-3">
        {categories.map((category: any) => {
          const remaining = (category.monthlyBudget || 0) - (category.spent || 0);
          const percentSpent = category.monthlyBudget > 0 
            ? (category.spent / category.monthlyBudget) * 100 
            : 0;
          
          const getProgressColor = () => {
            if (percentSpent <= 50) return 'bg-green-500';
            if (percentSpent <= 80) return 'bg-yellow-500';
            if (percentSpent <= 100) return 'bg-orange-500';
            return 'bg-red-500';
          };

          return (
            <div key={category.id} className="bg-white rounded-lg p-4 border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{category.emoji}</span>
                  <div>
                    <span className="font-medium text-gray-900">{category.name}</span>
                    {!isCurrentMonth && (
                      <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        Historical
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">
                    {gbp(category.spent)} / {gbp(category.monthlyBudget)}
                  </div>
                  <div className={`text-sm ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {remaining >= 0 ? gbp(remaining) : gbp(Math.abs(remaining))} 
                    {remaining >= 0 ? ' left' : ' over'}
                  </div>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
                  style={{ 
                    width: `${Math.min(percentSpent, 100)}%` 
                  }}
                />
              </div>
              
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>{percentSpent.toFixed(0)}% used</span>
                {category.previousMonths && category.previousMonths.length > 0 && (
                  <span className="text-blue-600">
                    Avg: {gbp(category.previousMonths.reduce((sum: number, m: any) => sum + m.spent, 0) / category.previousMonths.length)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Main Component
export default function GroupedBudgetSheet() {
  const { categories, currentMonth } = useEnhancedBudget();
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const isCurrentMonth = viewMonth === currentMonth;

  // Group categories by type
  const groupedCategories = useMemo(() => {
    const groups = {
      essential: categories.filter(c => c.type === 'essential'),
      lifestyle: categories.filter(c => c.type === 'lifestyle'),
      savings: categories.filter(c => c.type === 'savings'),
      debt: categories.filter(c => c.type === 'debt'),
    };
    return groups;
  }, [categories]);

  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur border border-gray-100 shadow-sm p-5 space-y-6">
      <MonthSelector />
      
      <MonthlySummaryCards viewMonth={viewMonth} isCurrentMonth={isCurrentMonth} />

      {/* Category Groups */}
      <div className="space-y-8">
        <CategoryGroup 
          title="Essential" 
          categories={groupedCategories.essential} 
          emoji="🏠"
          isCurrentMonth={isCurrentMonth}
        />
        <CategoryGroup 
          title="Lifestyle" 
          categories={groupedCategories.lifestyle} 
          emoji="🎯"
          isCurrentMonth={isCurrentMonth}
        />
        <CategoryGroup 
          title="Savings & Goals" 
          categories={groupedCategories.savings} 
          emoji="💰"
          isCurrentMonth={isCurrentMonth}
        />
        <CategoryGroup 
          title="Debt Payments" 
          categories={groupedCategories.debt} 
          emoji="💳"
          isCurrentMonth={isCurrentMonth}
        />
      </div>

      {/* Empty state */}
      {categories.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No budget categories yet</h3>
          <p className="text-gray-600">
            Add your first budget category to get started with monthly planning
          </p>
        </div>
      )}
    </div>
  );
}
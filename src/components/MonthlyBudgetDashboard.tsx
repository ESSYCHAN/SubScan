// src/components/MonthlyBudgetDashboard.tsx
// Complete UI for the monthly budget system

"use client";

import React, { useState } from "react";
import { useMonthlyBudget } from "./MonthlyBudgetProvider";
import { 
  Calendar, ChevronLeft, ChevronRight, Plus, TrendingUp, 
  TrendingDown, Target, AlertTriangle, CheckCircle, 
  PieChart, BarChart3, Settings, Upload
} from "lucide-react";

// Monthly Budget Overview Component
export function MonthlyBudgetOverview() {
  const { 
    selectedPeriod, 
    currentPeriod,
    goToPreviousMonth, 
    goToNextMonth,
    getInsights,
    startNewMonth,
    loading 
  } = useMonthlyBudget();

  const [showNewMonthDialog, setShowNewMonthDialog] = useState(false);
  
  if (loading) {
    return <div className="p-6 text-center">Loading budget data...</div>;
  }

  if (!selectedPeriod) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4">No Budget Period Found</h2>
        <button 
          onClick={() => setShowNewMonthDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 inline mr-2" />
          Start Your First Month
        </button>
      </div>
    );
  }

  const insights = getInsights();
  const isCurrentMonth = selectedPeriod.id === currentPeriod?.id;

  return (
    <div className="space-y-6">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={goToPreviousMonth}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold">{selectedPeriod.name}</h1>
            <p className="text-sm text-gray-600">
              {isCurrentMonth ? "Current Month" : "Historical View"}
            </p>
          </div>
          
          <button 
            onClick={goToNextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight className="w-5 h-5" />
          </button> 
        </div>

        <div className="flex space-x-2">
          {isCurrentMonth && (
            <button 
                onClick={() => {
                    // Switch to SubScan tab
                    const event = new CustomEvent('switchTab', { detail: 'existing' });
                    window.dispatchEvent(event);
                }}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
              <Upload className="w-4 h-4 mr-2" />
              Upload Statement
            </button>
          )}
          
          <button 
            onClick={() => setShowNewMonthDialog(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Month
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Planned"
          amount={selectedPeriod.totalPlanned || 0}
          icon={<Target className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Actual"
          amount={selectedPeriod.totalActual || 0}
          icon={<BarChart3 className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Variance"
          amount={selectedPeriod.totalVariance || 0}
          icon={(selectedPeriod.totalVariance || 0) >= 0 ? 
            <TrendingUp className="w-5 h-5" /> : 
            <TrendingDown className="w-5 h-5" />
          }
          color={(selectedPeriod.totalVariance || 0) >= 0 ? "red" : "green"}
          showSign
        />
        <StatCard
          title="Categories"
          amount={Object.keys(selectedPeriod.categories || {}).length}
          icon={<PieChart className="w-5 h-5" />}
          color="purple"
          isCount
        />
      </div>

      {/* Insights Panel */}
      {insights.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Monthly Insights
          </h3>
          <div className="space-y-2">
            {insights.slice(0, 3).map((insight, index) => (
              <div key={index} className="flex items-center text-sm text-amber-700">
                <div className={`w-2 h-2 rounded-full mr-3 ${
                  insight.severity === 'high' ? 'bg-red-500' :
                  insight.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                {insight.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      <CategoryBreakdown />
      
      {/* Goals Progress */}
      <GoalsProgress />
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  title, 
  amount, 
  icon, 
  color, 
  showSign = false, 
  isCount = false 
}: {
  title: string;
  amount: number;
  icon: React.ReactNode;
  color: string;
  showSign?: boolean;
  isCount?: boolean;
}) {
  const colorClasses = {
    blue: "text-blue-600 bg-blue-100",
    green: "text-green-600 bg-green-100", 
    red: "text-red-600 bg-red-100",
    purple: "text-purple-600 bg-purple-100"
  };

  return (
    <div className="bg-white rounded-lg p-4 border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold">
            {isCount ? amount : 
             `${showSign && amount >= 0 ? '+' : ''}£${Math.abs(amount).toFixed(2)}`}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Category Breakdown Component
function CategoryBreakdown() {
  const { selectedPeriod, updatePlannedAmount } = useMonthlyBudget();
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");

  if (!selectedPeriod) {
    return (
      <div className="bg-white rounded-lg border p-6 text-center">
        <p className="text-gray-500">No budget period selected</p>
      </div>
    );
  }

  const categories = selectedPeriod.categories || {};
  
  if (Object.keys(categories).length === 0) {
    return (
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Category Breakdown</h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-gray-500">No categories found. Start by creating your first budget period.</p>
        </div>
      </div>
    );
  }

  const handleEditStart = (categoryId: string, currentAmount: number) => {
    setEditingCategory(categoryId);
    setEditAmount(currentAmount.toString());
  };

  const handleEditSave = async (categoryId: string) => {
    const amount = parseFloat(editAmount);
    if (!isNaN(amount) && amount >= 0) {
      await updatePlannedAmount(categoryId, amount);
    }
    setEditingCategory(null);
  };

  const handleEditCancel = () => {
    setEditingCategory(null);
    setEditAmount("");
  };

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Category Breakdown</h3>
      </div>
      
      <div className="p-4">
        <div className="space-y-3">
          {Object.entries(categories).map(([categoryId, category]) => {
            // Safe access with fallbacks
            const planned = category?.planned || 0;
            const actual = category?.actual || 0;
            const name = category?.name || 'Unknown Category';
            const emoji = category?.emoji || '💰';
            
            const progressPercent = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
            const variance = actual - planned;
            const isOverBudget = actual > planned;
            
            return (
              <div key={categoryId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{emoji}</span>
                    <div>
                      <h4 className="font-medium">{name}</h4>
                      <p className="text-sm text-gray-600">
                        £{actual.toFixed(2)} of £{planned.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    {editingCategory === categoryId ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-20 px-2 py-1 border rounded text-sm"
                          step="0.01"
                          min="0"
                        />
                        <button
                          onClick={() => handleEditSave(categoryId)}
                          className="text-green-600 hover:text-green-700"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditStart(categoryId, planned)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    )}
                    
                    <div className={`text-sm font-medium ${
                      variance > 0 ? 'text-red-600' : 
                      variance < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {variance >= 0 ? '+' : ''}£{variance.toFixed(2)}
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isOverBudget ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                  {isOverBudget && planned > 0 && (
                    <div
                      className="h-2 bg-red-300 rounded-full -mt-2"
                      style={{ 
                        width: `${Math.min((actual / planned) * 100, 200) - 100}%`,
                        marginLeft: '100%'
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Goals Progress Component
function GoalsProgress() {
  const { selectedPeriod } = useMonthlyBudget();

  if (!selectedPeriod) {
    return null;
  }

  const goals = selectedPeriod.goals || {};
  
  if (Object.keys(goals).length === 0) {
    return (
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Savings Goals</h3>
        </div>
        <div className="p-6 text-center">
          <p className="text-gray-500">No savings goals set for this month</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Savings Goals</h3>
      </div>
      
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(goals).map(([goalId, goal]) => {
            // Safe access with fallbacks
            const target = goal?.target || 0;
            const contributed = goal?.contributed || 0;
            const name = goal?.name || 'Unknown Goal';
            const emoji = goal?.emoji || '🎯';
            
            const progressPercent = target > 0 ? (contributed / target) * 100 : 0;
            
            return (
              <div key={goalId} className="border rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="text-2xl">{emoji}</span>
                  <div className="flex-1">
                    <h4 className="font-medium">{name}</h4>
                    <p className="text-sm text-gray-600">
                      £{contributed.toFixed(2)} of £{target.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600">
                      {progressPercent.toFixed(0)}%
                    </div>
                  </div>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Monthly Review Component (for end-of-month analysis)
export function MonthlyReview() {
  const { allPeriods, getInsights, getCategoryHistory } = useMonthlyBudget();

  const lastMonth = allPeriods[1]; // Second most recent (current is index 0)
  
  if (!lastMonth) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Complete at least one month to see review</p>
      </div>
    );
  }

  const insights = getInsights(lastMonth.id);
  const biggestOverspend = insights
    .filter(i => i.type === 'overspend')
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">{lastMonth.name}</h2>
        <p className="text-gray-600">How did you do last month?</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">
            £{(lastMonth.totalPlanned || 0).toFixed(2)}
          </div>
          <div className="text-gray-600">Total Planned</div>
        </div>
        
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">
            £{(lastMonth.totalActual || 0).toFixed(2)}
          </div>
          <div className="text-gray-600">Total Spent</div>
        </div>
        
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className={`text-3xl font-bold mb-2 ${
            (lastMonth.totalVariance || 0) >= 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {(lastMonth.totalVariance || 0) >= 0 ? '+' : ''}£{Math.abs(lastMonth.totalVariance || 0).toFixed(2)}
          </div>
          <div className="text-gray-600">
            {(lastMonth.totalVariance || 0) >= 0 ? 'Over Budget' : 'Under Budget'}
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Key Insights</h3>
        
        {biggestOverspend && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-red-800 mb-2">Biggest Challenge</h4>
            <p className="text-red-700">{biggestOverspend.message}</p>
            <p className="text-sm text-red-600 mt-1">
              Consider reducing this month's budget or finding ways to cut costs.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {insights.slice(0, 5).map((insight, index) => (
            <div key={index} className="flex items-center text-sm">
              <div className={`w-2 h-2 rounded-full mr-3 ${
                insight.severity === 'high' ? 'bg-red-500' :
                insight.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
              }`} />
              {insight.message}
            </div>
          ))}
        </div>
      </div>

      {/* Action Items */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-4">For This Month</h3>
        <div className="space-y-2 text-blue-700">
          <p>• Upload your latest bank statement to see real spending</p>
          <p>• Review and adjust budgets based on last month's performance</p>
          {biggestOverspend && (
            <p>• Focus on controlling {biggestOverspend.category} spending</p>
          )}
          <p>• Set up any new savings goals or adjust existing ones</p>
        </div>
      </div>
    </div>
  );
}
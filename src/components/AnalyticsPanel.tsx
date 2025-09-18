// src/components/AnalyticsPanel.tsx
// Fixed version with proper type compatibility

import React, { useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Calendar, DollarSign,
  Target, AlertTriangle, CheckCircle2, PieChart, Clock,
  Zap, Award, Eye, RefreshCw, ArrowUp, ArrowDown, X
} from 'lucide-react';

interface BudgetCategory {
  id: string;
  name: string;
  emoji: string;
  monthlyBudget: number;
  spent: number;
}

// Updated to match the Item interface from StreamlinedSubScan
interface Subscription {
  id: string;
  name: string;
  category: string;
  cost: number;
  day?: number;
  emoji?: string;
  type?: 'subscription' | 'planned' | 'budget';
  priority?: 'essential' | 'savings' | 'goals';
  savingOpportunity?: number;
  source?: 'subscription' | 'planned' | 'budget';
  raw?: any;
}

interface AnalyticsPanelProps {
  categories: BudgetCategory[];
  subscriptions: Subscription[];
  isOpen: boolean;
  onClose: () => void;
}

interface SpendingTrend {
  category: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

interface SmartInsight {
  type: 'optimization' | 'trend' | 'alert' | 'opportunity';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
  savings?: number;
  category?: string;
}

interface EfficiencyMetrics {
  efficiency: number;
  accuracy: number;
  totalBudget: number;
  totalSpent: number;
  variance: number;
}

type TabType = 'overview' | 'trends' | 'insights' | 'optimize';

export default function AnalyticsPanel({ 
  categories, 
  subscriptions, 
  isOpen, 
  onClose 
}: AnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Calculate spending trends (simulated for demo - in real app would use historical data)
  const spendingTrends = useMemo((): SpendingTrend[] => {
    return categories.map(cat => {
      const current = cat.spent || 0;
      const budget = cat.monthlyBudget || 0;
      
      // Simulate previous month data for demo
      const variance = (Math.random() - 0.5) * 0.3;
      const previous = current * (1 + variance);
      const change = current - previous;
      const changePercent = previous > 0 ? (change / previous) * 100 : 0;
      
      let trend: SpendingTrend['trend'];
      if (Math.abs(changePercent) < 5) {
        trend = 'stable';
      } else if (changePercent > 0) {
        trend = 'up';
      } else {
        trend = 'down';
      }
      
      return {
        category: cat.name,
        current,
        previous,
        change,
        changePercent,
        trend
      };
    }).filter(trend => trend.current > 0);
  }, [categories]);

  // Generate smart insights
  const smartInsights = useMemo((): SmartInsight[] => {
    const insights: SmartInsight[] = [];

    // Budget optimization insights
    categories.forEach(cat => {
      const spent = cat.spent || 0;
      const budget = cat.monthlyBudget || 0;
      
      if (spent > budget * 1.2 && budget > 0) {
        insights.push({
          type: 'alert',
          title: `${cat.name} Consistently Over Budget`,
          description: `You've exceeded your ${cat.name} budget by £${(spent - budget).toFixed(2)}. Consider increasing the budget or finding cost reductions.`,
          impact: 'high',
          actionable: true,
          category: cat.name
        });
      }

      if (spent < budget * 0.7 && budget > 100) {
        const potential = budget - spent;
        insights.push({
          type: 'opportunity',
          title: `${cat.name} Budget Underutilized`,
          description: `You have £${potential.toFixed(2)} unused in your ${cat.name} budget. Consider reallocating to other categories.`,
          impact: 'medium',
          actionable: true,
          savings: potential,
          category: cat.name
        });
      }
    });

    // Subscription optimization - Fixed to work with the actual data structure
    const lowConfidenceSubs = subscriptions.filter(sub => 
      (sub.savingOpportunity || 0) > 0 || (sub.raw?.confidence || 100) < 70
    );

    if (lowConfidenceSubs.length > 0) {
      const totalSavings = lowConfidenceSubs.reduce((sum, sub) => 
        sum + (sub.savingOpportunity || sub.cost * 0.3), 0
      );
      
      insights.push({
        type: 'optimization',
        title: 'Review Underutilized Subscriptions',
        description: `${lowConfidenceSubs.length} subscriptions appear to be rarely used or have saving opportunities. Review and optimize these services.`,
        impact: 'high',
        actionable: true,
        savings: totalSavings
      });
    }

    // Spending pattern insights
    const totalSpending = categories.reduce((sum, cat) => sum + (cat.spent || 0), 0);
    const totalBudget = categories.reduce((sum, cat) => sum + (cat.monthlyBudget || 0), 0);
    
    if (totalSpending > totalBudget * 1.1 && totalBudget > 0) {
      insights.push({
        type: 'alert',
        title: 'Overall Budget Exceeded',
        description: `You're £${(totalSpending - totalBudget).toFixed(2)} over your total monthly budget. Review your highest spending categories.`,
        impact: 'high',
        actionable: true
      });
    }

    // Category concentration insight
    const highSpendingCategories = categories
      .filter(cat => (cat.spent || 0) > 200)
      .sort((a, b) => (b.spent || 0) - (a.spent || 0));

    if (highSpendingCategories.length > 0) {
      const topCategory = highSpendingCategories[0];
      const topCategoryPercent = totalSpending > 0 ? 
        ((topCategory.spent || 0) / totalSpending) * 100 : 0;
      
      if (topCategoryPercent > 40) {
        insights.push({
          type: 'trend',
          title: `${topCategory.name} Dominates Spending`,
          description: `${topCategory.name} accounts for ${topCategoryPercent.toFixed(0)}% of your spending. Consider if this allocation aligns with your priorities.`,
          impact: 'medium',
          actionable: true,
          category: topCategory.name
        });
      }
    }

    // Subscription density insight
    if (subscriptions.length > 8) {
      const totalSubCost = subscriptions.reduce((sum, sub) => sum + (sub.cost || 0), 0);
      insights.push({
        type: 'optimization',
        title: 'High Subscription Count',
        description: `You have ${subscriptions.length} active subscriptions costing £${totalSubCost.toFixed(2)}/month. Consider consolidating similar services.`,
        impact: 'medium',
        savings: totalSubCost * 0.2, // Assume 20% potential savings from consolidation
        actionable: true
      });
    }

    // Seasonal insights (current date aware)
    const now = new Date();
    if (now.getMonth() === 11) { // December
      insights.push({
        type: 'trend',
        title: 'Holiday Spending Season',
        description: 'December typically sees 40% higher spending. Consider setting aside extra budget for gifts and dining.',
        impact: 'medium',
        actionable: true
      });
    }

    if (now.getDate() <= 5) {
      insights.push({
        type: 'trend',
        title: 'Month Start Optimization',
        description: 'Early month is ideal for reviewing last month\'s performance and adjusting budgets for better control.',
        impact: 'low',
        actionable: true
      });
    }

    return insights.sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  }, [categories, subscriptions]);

  // Budget efficiency metrics
  const efficiencyMetrics = useMemo((): EfficiencyMetrics => {
    const totalBudget = categories.reduce((sum, cat) => sum + (cat.monthlyBudget || 0), 0);
    const totalSpent = categories.reduce((sum, cat) => sum + (cat.spent || 0), 0);
    const onTargetCategories = categories.filter(cat => {
      const spent = cat.spent || 0;
      const budget = cat.monthlyBudget || 0;
      return budget > 0 && Math.abs(spent - budget) / budget < 0.15; // Within 15%
    }).length;

    const efficiency = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
    const accuracy = categories.length > 0 ? (onTargetCategories / categories.length) * 100 : 0;

    return {
      efficiency: Math.round(efficiency),
      accuracy: Math.round(accuracy),
      totalBudget,
      totalSpent,
      variance: totalSpent - totalBudget
    };
  }, [categories]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'trends' as const, label: 'Trends', icon: TrendingUp },
    { id: 'insights' as const, label: 'Insights', icon: Eye },
    { id: 'optimize' as const, label: 'Optimize', icon: Target }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Financial Analytics</h2>
                  <p className="text-sm text-gray-600">Insights and trends from your spending data</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="mt-4 flex space-x-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-purple-600 shadow-sm'
                      : 'text-gray-600 hover:bg-white/50'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-blue-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                        <Target className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-2xl font-bold text-blue-900">
                        {efficiencyMetrics.efficiency}%
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium text-blue-900">Budget Efficiency</div>
                      <div className="text-sm text-blue-700">How much of budget used</div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-green-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="text-2xl font-bold text-green-900">
                        {efficiencyMetrics.accuracy}%
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium text-green-900">Budget Accuracy</div>
                      <div className="text-sm text-green-700">Categories on target</div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-purple-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                        <DollarSign className="h-4 w-4 text-purple-600" />
                      </div>
                      <span className="text-2xl font-bold text-purple-900">
                        £{Math.abs(efficiencyMetrics.variance).toFixed(0)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium text-purple-900">
                        {efficiencyMetrics.variance >= 0 ? 'Over Budget' : 'Under Budget'}
                      </div>
                      <div className="text-sm text-purple-700">This month</div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-orange-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
                        <Award className="h-4 w-4 text-orange-600" />
                      </div>
                      <span className="text-2xl font-bold text-orange-900">
                        {subscriptions.length}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="font-medium text-orange-900">Active Subscriptions</div>
                      <div className="text-sm text-orange-700">Tracked services</div>
                    </div>
                  </div>
                </div>

                {/* Budget vs Spending Chart */}
                <div className="rounded-xl bg-white border p-6">
                  <h3 className="mb-4 text-lg font-semibold">Budget vs Actual Spending</h3>
                  <div className="space-y-4">
                    {categories.filter(cat => (cat.monthlyBudget || 0) > 0).slice(0, 8).map(cat => {
                      const spent = cat.spent || 0;
                      const budget = cat.monthlyBudget || 0;
                      const percentage = budget > 0 ? (spent / budget) * 100 : 0;
                      
                      return (
                        <div key={cat.id} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{cat.emoji}</span>
                              <span className="font-medium">{cat.name}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                £{spent.toFixed(0)} / £{budget.toFixed(0)}
                              </div>
                              <div className={`text-xs font-medium ${
                                percentage > 100 ? 'text-red-600' :
                                percentage > 80 ? 'text-yellow-600' : 'text-green-600'
                              }`}>
                                {percentage.toFixed(0)}%
                              </div>
                            </div>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-200">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                percentage > 100 ? 'bg-red-500' :
                                percentage > 80 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(100, percentage)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'trends' && (
              <div className="space-y-6">
                <div className="rounded-xl bg-white border p-6">
                  <h3 className="mb-4 text-lg font-semibold">Spending Trends</h3>
                  {spendingTrends.length === 0 ? (
                    <div className="py-8 text-center">
                      <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                      <h4 className="mt-4 font-medium text-gray-900">No Trend Data</h4>
                      <p className="text-gray-600">Spending trends will appear here after you have more data.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {spendingTrends.map(trend => (
                        <div key={trend.category} className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              trend.trend === 'up' ? 'bg-red-100' :
                              trend.trend === 'down' ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                              {trend.trend === 'up' ? (
                                <ArrowUp className="h-4 w-4 text-red-600" />
                              ) : trend.trend === 'down' ? (
                                <ArrowDown className="h-4 w-4 text-green-600" />
                              ) : (
                                <RefreshCw className="h-4 w-4 text-gray-600" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{trend.category}</div>
                              <div className="text-sm text-gray-600">
                                £{trend.previous.toFixed(0)} → £{trend.current.toFixed(0)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-semibold ${
                              trend.change > 0 ? 'text-red-600' :
                              trend.change < 0 ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              {trend.change > 0 ? '+' : ''}£{trend.change.toFixed(0)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {Math.abs(trend.changePercent).toFixed(0)}% change
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="space-y-6">
                <div className="rounded-xl bg-white border p-6">
                  <h3 className="mb-4 text-lg font-semibold">Smart Insights</h3>
                  {smartInsights.length === 0 ? (
                    <div className="py-8 text-center">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
                      <h4 className="mt-4 font-medium text-gray-900">All Good!</h4>
                      <p className="text-gray-600">No significant insights to report this month. Your finances look well-managed.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {smartInsights.map((insight, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg border-l-4 p-4 transition-all hover:shadow-sm ${
                            insight.impact === 'high'
                              ? 'border-red-400 bg-red-50 hover:bg-red-100/50'
                              : insight.impact === 'medium'
                              ? 'border-yellow-400 bg-yellow-50 hover:bg-yellow-100/50'
                              : 'border-blue-400 bg-blue-50 hover:bg-blue-100/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex h-6 w-6 items-center justify-center rounded ${
                              insight.type === 'alert' ? 'bg-red-100' :
                              insight.type === 'optimization' ? 'bg-purple-100' :
                              insight.type === 'opportunity' ? 'bg-green-100' : 'bg-blue-100'
                            }`}>
                              {insight.type === 'alert' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                              {insight.type === 'optimization' && <Target className="h-4 w-4 text-purple-600" />}
                              {insight.type === 'opportunity' && <Zap className="h-4 w-4 text-green-600" />}
                              {insight.type === 'trend' && <TrendingUp className="h-4 w-4 text-blue-600" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-gray-900">{insight.title}</h4>
                                {insight.savings && (
                                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                                    Save £{insight.savings.toFixed(0)}/mo
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-gray-700">{insight.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'optimize' && (
              <div className="space-y-6">
                <div className="rounded-xl bg-white border p-6">
                  <h3 className="mb-4 text-lg font-semibold">Budget Optimization</h3>
                  
                  {/* Quick Actions */}
                  <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button className="rounded-lg bg-green-50 p-4 text-left transition-colors hover:bg-green-100 border border-green-200">
                      <div className="flex items-center gap-3">
                        <Target className="h-6 w-6 text-green-600" />
                        <div>
                          <div className="font-medium text-green-900">Rebalance Categories</div>
                          <div className="text-sm text-green-700">Optimize budget allocation based on spending</div>
                        </div>
                      </div>
                    </button>

                    <button className="rounded-lg bg-purple-50 p-4 text-left transition-colors hover:bg-purple-100 border border-purple-200">
                      <div className="flex items-center gap-3">
                        <Zap className="h-6 w-6 text-purple-600" />
                        <div>
                          <div className="font-medium text-purple-900">Cancel Unused Services</div>
                          <div className="text-sm text-purple-700">Review and optimize subscriptions</div>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Optimization Recommendations */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Recommended Actions</h4>
                    {smartInsights.filter(i => i.actionable).slice(0, 4).length === 0 ? (
                      <div className="py-6 text-center">
                        <Award className="mx-auto h-8 w-8 text-green-500" />
                        <p className="mt-2 text-sm text-gray-600">No optimization needed - your budget looks well-balanced!</p>
                      </div>
                    ) : (
                      smartInsights.filter(i => i.actionable).slice(0, 4).map((insight, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              insight.type === 'alert' ? 'bg-red-100' :
                              insight.type === 'optimization' ? 'bg-purple-100' :
                              insight.type === 'opportunity' ? 'bg-green-100' : 'bg-blue-100'
                            }`}>
                              {insight.type === 'alert' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                              {insight.type === 'optimization' && <Target className="h-4 w-4 text-purple-600" />}
                              {insight.type === 'opportunity' && <Zap className="h-4 w-4 text-green-600" />}
                              {insight.type === 'trend' && <TrendingUp className="h-4 w-4 text-blue-600" />}
                            </div>
                            <div>
                              <div className="font-medium">{insight.title}</div>
                              {insight.category && (
                                <div className="text-sm text-gray-600">{insight.category}</div>
                              )}
                            </div>
                          </div>
                          {insight.savings && (
                            <div className="text-right">
                              <div className="font-semibold text-green-600">
                                £{insight.savings.toFixed(0)}
                              </div>
                              <div className="text-xs text-gray-500">potential saving</div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
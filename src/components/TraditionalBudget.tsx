import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Clock, Target, Zap } from 'lucide-react';
import { useEnhancedBudget } from '@/components/HouseholdBudgetProvider';

const TraditionalBudget = () => {
  const { categories, updateCategory, deleteCategory, createCategory } = useEnhancedBudget();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'problems' | 'healthy'>('all');
  const [newCategory, setNewCategory] = useState({
    name: '',
    emoji: '💰',
    monthlyBudget: 0,
    type: 'essential' as const
  });

  // Enhanced category grouping with health status
  const categorizedData = useMemo(() => {
    const groups = {
      essential: categories.filter(c => c.type === 'essential'),
      lifestyle: categories.filter(c => c.type === 'lifestyle'),
      savings: categories.filter(c => c.type === 'savings'),
      debt: categories.filter(c => c.type === 'debt')
    };

    // Add health status to each category
    const enhancedCategories = categories.map(cat => {
      const spent = cat.spent || 0;
      const budgeted = cat.monthlyBudget || 0;
      const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;
      
      let status: 'critical' | 'warning' | 'healthy' | 'unused' = 'healthy';
      if (percentage > 100) status = 'critical';
      else if (percentage > 80) status = 'warning';
      else if (percentage < 20 && budgeted > 50) status = 'unused';
      
      return { ...cat, status, percentage };
    });

    return { groups, enhancedCategories };
  }, [categories]);

  // Quick insights for the user
  const insights = useMemo(() => {
    const results = [];
    const { enhancedCategories } = categorizedData;
    
    const overbudget = enhancedCategories.filter(c => c.status === 'critical');
    const nearLimit = enhancedCategories.filter(c => c.status === 'warning');
    const unused = enhancedCategories.filter(c => c.status === 'unused');
    
    if (overbudget.length > 0) {
      const totalOverage = overbudget.reduce((sum, cat) => sum + ((cat.spent || 0) - (cat.monthlyBudget || 0)), 0);
      results.push({
        type: 'critical',
        message: `${overbudget.length} categories over budget by £${Math.round(totalOverage)} total`,
        action: 'Increase budgets or reduce spending'
      });
    }
    
    if (nearLimit.length > 0) {
      results.push({
        type: 'warning',
        message: `${nearLimit.length} categories approaching their limits`,
        action: 'Monitor spending closely'
      });
    }
    
    if (unused.length > 0) {
      const totalUnused = unused.reduce((sum, cat) => sum + ((cat.monthlyBudget || 0) - (cat.spent || 0)), 0);
      results.push({
        type: 'opportunity',
        message: `£${Math.round(totalUnused)} unused across ${unused.length} categories`,
        action: 'Reallocate to other priorities'
      });
    }
    
    return results;
  }, [categorizedData]);
  
const handleDelete = async (categoryId: string) => {
  if (confirm('Are you sure you want to delete this category?')) {
    try {
      await deleteCategory(categoryId);
    } catch (error) {
      alert('Failed to delete category');
    }
  }
};
  // Calculate totals with variance tracking
  const totals = useMemo(() => {
    const totalBudgeted = categories.reduce((sum, cat) => sum + (cat.monthlyBudget || 0), 0);
    const totalSpent = categories.reduce((sum, cat) => sum + (cat.spent || 0), 0);
    const totalRemaining = totalBudgeted - totalSpent;
    const percentUsed = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    
    // Month progress calculation (assumes spending is proportional to days passed)
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();
    const monthProgress = (daysPassed / daysInMonth) * 100;
    
    const expectedSpending = (totalBudgeted * monthProgress) / 100;
    const spendingPace = totalBudgeted > 0 ? (totalSpent / expectedSpending) * 100 : 0;
    
    return {
      budgeted: totalBudgeted,
      spent: totalSpent,
      remaining: totalRemaining,
      percentUsed,
      monthProgress,
      spendingPace,
      onTrack: Math.abs(spendingPace - 100) < 20 // Within 20% of expected pace
    };
  }, [categories]);

  const handleEdit = (categoryId: string, currentBudget: number) => {
    setEditingId(categoryId);
    setEditValue(currentBudget);
  };

  const handleSave = async (categoryId: string) => {
    try {
      await updateCategory(categoryId, { monthlyBudget: editValue });
      setEditingId(null);
    } catch (error) {
      alert('Failed to update category');
    }
  };

  const handleQuickAdjust = async (categoryId: string, adjustment: 'match' | 'buffer' | 'reduce') => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    const spent = category.spent || 0;
    let newBudget = 0;
    
    switch (adjustment) {
      case 'match':
        newBudget = Math.ceil(spent);
        break;
      case 'buffer':
        newBudget = Math.ceil(spent * 1.2);
        break;
      case 'reduce':
        newBudget = Math.max(0, Math.floor(spent * 0.8));
        break;
    }
    
    try {
      await updateCategory(categoryId, { monthlyBudget: newBudget });
    } catch (error) {
      alert('Failed to adjust budget');
    }
  };

  const getProgressColor = (spent: number, budgeted: number) => {
    if (budgeted === 0) return 'bg-gray-300';
    const percentage = (spent / budgeted) * 100;
    if (percentage > 100) return 'bg-red-500';
    if (percentage > 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'critical': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning': return <TrendingUp className="w-4 h-4 text-yellow-500" />;
      case 'unused': return <Target className="w-4 h-4 text-blue-500" />;
      default: return <TrendingDown className="w-4 h-4 text-green-500" />;
    }
  };

  const CategoryRow = ({ category }: { category: any }) => {
    const isEditing = editingId === category.id;
    const spent = category.spent || 0;
    const budgeted = category.monthlyBudget || 0;
    const remaining = budgeted - spent;
    const progressPercentage = budgeted > 0 ? Math.min(100, (spent / budgeted) * 100) : 0;

    // Filter by view mode
    if (viewMode === 'problems' && !['critical', 'warning'].includes(category.status)) return null;
    if (viewMode === 'healthy' && category.status !== 'healthy') return null;

    return (
      <div className={`group grid grid-cols-12 gap-3 items-center py-4 px-4 hover:bg-gray-50 border-b border-gray-100 ${
        category.status === 'critical' ? 'bg-red-25 border-red-100' : 
        category.status === 'warning' ? 'bg-yellow-25 border-yellow-100' : ''
      }`}>
        {/* Category Info */}
        <div className="col-span-4 flex items-center gap-3">
          <span className="text-xl">{category.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 flex items-center gap-2">
              {category.name}
              {getStatusIcon(category.status)}
            </div>
            <div className="text-xs text-gray-500 capitalize flex items-center gap-2">
              {category.type}
              {category.status === 'critical' && (
                <span className="text-red-600 font-medium">Over budget</span>
              )}
              {category.status === 'unused' && (
                <span className="text-blue-600 font-medium">Underused</span>
              )}
            </div>
            {progressPercentage > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className={`h-2 rounded-full transition-all ${getProgressColor(spent, budgeted)}`}
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>

        {/* Budget Amount with Quick Actions */}
        <div className="col-span-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(Number(e.target.value))}
                className="w-20 px-2 py-1 border rounded text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave(category.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <button
                onClick={() => handleSave(category.id)}
                className="text-green-600 hover:text-green-800 p-1"
              >
                ✓
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">£{Math.round(budgeted)}</span>
                <button
                  onClick={() => handleEdit(category.id, budgeted)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
              
              {/* Quick adjust buttons for problem categories */}
              {['critical', 'warning', 'unused'].includes(category.status) && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  {category.status === 'critical' && (
                    <button
                      onClick={() => handleQuickAdjust(category.id, 'buffer')}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      title="Set budget to 120% of current spending"
                    >
                      Fix
                    </button>
                  )}
                  {category.status === 'unused' && (
                    <button
                      onClick={() => handleQuickAdjust(category.id, 'reduce')}
                      className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                      title="Reduce budget to 80% of spending"
                    >
                      Trim
                    </button>
                  )}
                  <button
                    onClick={() => handleQuickAdjust(category.id, 'match')}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    title="Match current spending exactly"
                  >
                    Match
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Spent */}
        <div className="col-span-2">
          <span className="font-medium text-gray-700">£{Math.round(spent)}</span>
          {budgeted > 0 && (
            <div className="text-xs text-gray-500">{Math.round(progressPercentage)}% used</div>
          )}
        </div>

        {/* Remaining */}
        <div className="col-span-2">
          <span className={`font-medium ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {remaining >= 0 ? '£' : '-£'}{Math.round(Math.abs(remaining))}
          </span>
          {remaining < 0 && (
            <div className="text-xs text-red-500">Over by £{Math.round(Math.abs(remaining))}</div>
          )}
        </div>

        {/* Trend */}
        <div className="col-span-1 text-center">
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            category.status === 'critical' ? 'bg-red-100 text-red-800' :
            category.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
            category.status === 'unused' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {category.status === 'critical' ? 'Over' :
             category.status === 'warning' ? 'High' :
             category.status === 'unused' ? 'Low' : 'Good'}
          </div>
        </div>

        {/* Actions */}
        <div className="col-span-1 text-right">
          <button
            onClick={() => handleDelete(category.id)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const filteredCategories = categorizedData.enhancedCategories.filter(cat => {
    if (viewMode === 'problems') return ['critical', 'warning'].includes(cat.status);
    if (viewMode === 'healthy') return cat.status === 'healthy';
    return true;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Enhanced Header with Insights */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Budget Manager</h2>
              <p className="text-sm text-gray-600">Smart budget tracking with spending insights</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View filters */}
            <div className="flex rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                All ({categories.length})
              </button>
              <button
                onClick={() => setViewMode('problems')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'problems' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                Issues ({categorizedData.enhancedCategories.filter(c => ['critical', 'warning'].includes(c.status)).length})
              </button>
              <button
                onClick={() => setViewMode('healthy')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'healthy' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                Healthy ({categorizedData.enhancedCategories.filter(c => c.status === 'healthy').length})
              </button>
            </div>
            
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Category
            </button>
          </div>
        </div>

        {/* Insights Panel */}
        {insights.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Budget Insights
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {insights.map((insight, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${
                  insight.type === 'critical' ? 'bg-red-50 border-red-200' :
                  insight.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-blue-50 border-blue-200'
                }`}>
                  <div className={`text-sm font-medium mb-1 ${
                    insight.type === 'critical' ? 'text-red-800' :
                    insight.type === 'warning' ? 'text-yellow-800' :
                    'text-blue-800'
                  }`}>
                    {insight.message}
                  </div>
                  <div className={`text-xs ${
                    insight.type === 'critical' ? 'text-red-600' :
                    insight.type === 'warning' ? 'text-yellow-600' :
                    'text-blue-600'
                  }`}>
                    {insight.action}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600">Total Budget</div>
            <div className="text-2xl font-bold text-blue-900">£{Math.round(totals.budgeted)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-red-600">Spent</div>
            <div className="text-2xl font-bold text-red-900">£{Math.round(totals.spent)}</div>
            <div className="text-xs text-red-600">{Math.round(totals.percentUsed)}% used</div>
          </div>
          <div className={`rounded-lg p-4 ${totals.remaining >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`text-sm ${totals.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totals.remaining >= 0 ? 'Remaining' : 'Over Budget'}
            </div>
            <div className={`text-2xl font-bold ${totals.remaining >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              £{Math.round(Math.abs(totals.remaining))}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-purple-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Month Progress
            </div>
            <div className="text-2xl font-bold text-purple-900">{Math.round(totals.monthProgress)}%</div>
            <div className="w-full bg-purple-200 rounded-full h-1.5 mt-1">
              <div 
                className="bg-purple-600 h-1.5 rounded-full"
                style={{ width: `${totals.monthProgress}%` }}
              ></div>
            </div>
          </div>
          <div className={`rounded-lg p-4 ${totals.onTrack ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className={`text-sm flex items-center gap-1 ${totals.onTrack ? 'text-green-600' : 'text-yellow-600'}`}>
              <Target className="w-3 h-3" />
              Spending Pace
            </div>
            <div className={`text-2xl font-bold ${totals.onTrack ? 'text-green-900' : 'text-yellow-900'}`}>
              {Math.round(totals.spendingPace)}%
            </div>
            <div className={`text-xs ${totals.onTrack ? 'text-green-600' : 'text-yellow-600'}`}>
              {totals.onTrack ? 'On track' : totals.spendingPace > 100 ? 'Too fast' : 'Under pace'}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Table Header */}
      <div className="grid grid-cols-12 gap-3 items-center py-3 px-4 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
        <div className="col-span-4">Category</div>
        <div className="col-span-2">Budget</div>
        <div className="col-span-2">Spent</div>
        <div className="col-span-2">Remaining</div>
        <div className="col-span-1">Status</div>
        <div className="col-span-1">Actions</div>
      </div>

      {/* Categories List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredCategories.map(category => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </div>

      {/* Rest of your existing add form and empty state code... */}
      {/* Add Category Form */}
      {showAddForm && (
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Category name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
              <input
                type="text"
                value={newCategory.emoji}
                onChange={(e) => setNewCategory(prev => ({ ...prev, emoji: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="💰"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
              <input
                type="number"
                value={newCategory.monthlyBudget}
                onChange={(e) => setNewCategory(prev => ({ ...prev, monthlyBudget: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={newCategory.type}
                onChange={(e) => setNewCategory(prev => ({ ...prev, type: e.target.value as any }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="essential">Essential</option>
                <option value="lifestyle">Lifestyle</option>
                <option value="savings">Savings</option>
                <option value="debt">Debt</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => {
                if (!newCategory.name.trim()) return;
                createCategory({
                  name: newCategory.name,
                  emoji: newCategory.emoji,
                  monthlyBudget: newCategory.monthlyBudget,
                  type: newCategory.type,
                  color: '#6366f1',
                  description: ''
                });
                setNewCategory({
                  name: '',
                  emoji: '💰',
                  monthlyBudget: 0,
                  type: 'essential'
                });
                setShowAddForm(false);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Add Category
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {categories.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No budget categories yet</h3>
          <p className="text-gray-600 mb-4">Create your first budget category to start tracking spending</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Create First Category
          </button>
        </div>
      )}
    </div>
  );
};

export default TraditionalBudget;
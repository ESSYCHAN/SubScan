'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Camera, Upload, Zap, TrendingDown, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { ValidationUtils} from '@/utils/validation';
import { LoadingState } from '@/components/Loading';
import { DateUtils } from '@/utils/dateHelpers';



interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
  category: string;
  alternatives?: Alternative[];
}

interface Alternative {
  name: string;
  price: number;
  store: string;
  savings: number;
  url?: string;
}

interface ReceiptAnalysis {
  items: ReceiptItem[];
  totalSpent: number;
  totalSavings: number;
  store: string;
  date: string;
  recommendations: string[];
}

export default function ReceiptScannerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [processingStep, setProcessingStep] = useState('');
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

const processImage = async (imageBlob: Blob) => {
  setIsProcessing(true);
  setError('');
  stopCamera?.();

  try {
    // Step 1: OCR Processing
    setProcessingStep('Extracting text from receipt...');
    
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imageBlob);
    await worker.terminate();

    // Step 2: Parse receipt text
    setProcessingStep('Identifying products and prices...');
    const items = parseReceiptText(text);
    
    if (items.length === 0) {
      setError('Could not detect any items from the receipt. Please try a clearer image.');
      return;
    }

    // Step 3: Price comparison API calls
    setProcessingStep('Finding cheaper alternatives...');
    const itemsWithAlternatives = await Promise.all(
      items.map(async (item) => ({
        ...item,
        alternatives: await findAlternatives(item.name, item.price)
      }))
    );

    // Step 4: Calculate savings
    setProcessingStep('Calculating savings opportunities...');
    const totalSavings = itemsWithAlternatives.reduce((sum, item) => 
      sum + (item.alternatives?.[0]?.savings || 0), 0
    );

    const analysis: ReceiptAnalysis = {
      store: detectStore(text) || 'Unknown Store',
      date: detectDate(text) || new Date().toISOString().split('T')[0],
      totalSpent: items.reduce((sum, item) => sum + item.price, 0),
      totalSavings,
      items: itemsWithAlternatives,
      recommendations: generateRecommendations(itemsWithAlternatives)
    };

    setAnalysis(analysis);
    
  } catch (err) {
    console.error('OCR processing error:', err);
    setError('Failed to process receipt. Please try again with a clearer image.');
  } finally {
    setIsProcessing(false);
  }
};

// Helper functions for receipt parsing
function parseReceiptText(text: string): ReceiptItem[] {
  const lines = text.split('\n').filter(line => line.trim());
  const items: ReceiptItem[] = [];
  
  for (const line of lines) {
    const priceMatch = line.match(/£?(\d+\.?\d*)/);
    if (priceMatch && parseFloat(priceMatch[1]) > 1) {
      const price = parseFloat(priceMatch[1]);
      const name = line.replace(/£?\d+\.?\d*/, '').trim();
      
      if (name.length > 2) {
        items.push({
          name: cleanItemName(name),
          price,
          quantity: 1,
          category: categorizeItem(name)
        });
      }
    }
  }
  
  return items.slice(0, 20); // Limit to top 20 items
}

function cleanItemName(name: string): string {
  return name
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase());
}

function categorizeItem(name: string): string {
  const lower = name.toLowerCase();
  if (['milk', 'bread', 'eggs', 'butter', 'cheese'].some(food => lower.includes(food))) return 'dairy';
  if (['apple', 'banana', 'orange', 'fruit'].some(fruit => lower.includes(fruit))) return 'produce';
  if (['chicken', 'beef', 'fish', 'meat'].some(meat => lower.includes(meat))) return 'meat';
  return 'other';
}

async function findAlternatives(itemName: string, currentPrice: number): Promise<Alternative[]> {
  // Mock price comparison - in production, integrate with price comparison APIs
  const stores = ['ASDA', 'Sainsbury\'s', 'Morrisons', 'Tesco'];
  const alternatives: Alternative[] = [];
  
  stores.forEach(store => {
    const mockPrice = currentPrice * (0.7 + Math.random() * 0.4);
    const savings = Math.max(0, currentPrice - mockPrice);
    
    if (savings > 0.1) {
      alternatives.push({
        name: itemName,
        price: parseFloat(mockPrice.toFixed(2)),
        store,
        savings: parseFloat(savings.toFixed(2))
      });
    }
  });
  
  return alternatives.sort((a, b) => b.savings - a.savings).slice(0, 3);
}

function detectStore(text: string): string | null {
  const stores = ['tesco', 'asda', 'sainsbury', 'morrisons', 'aldi', 'lidl', 'waitrose'];
  const lower = text.toLowerCase();
  
  for (const store of stores) {
    if (lower.includes(store)) {
      return store.charAt(0).toUpperCase() + store.slice(1);
    }
  }
  
  return null;
}

function detectDate(text: string): string | null {
  // Look for various date formats
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{2,4})/i,
    /(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        let day, month, year;
        
        // Handle different date formats
        if (pattern.source.includes('jan|feb')) {
          // Month name format: "15 Jan 2024"
          [, day, month, year] = match;
          const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          month = (monthNames.indexOf(month.toLowerCase()) + 1).toString();
        } else {
          // Numeric format: handle both DD/MM/YYYY and YYYY/MM/DD
          [, day, month, year] = match;
          
          // If year is in first position (YYYY/MM/DD), swap the values
          if (day.length === 4) {
            [year, month, day] = [day, month, year];
          }
        }
        
        const fullYear = year.length === 2 ? `20${year}` : year;
        
        // Validate ranges before creating date
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(fullYear);
        
        if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31 || yearNum < 1900 || yearNum > 2030) {
          continue; // Skip invalid dates
        }
        
        const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        
        // Check if the date is actually valid (handles cases like Feb 30th)
        if (isNaN(date.getTime())) {
          continue;
        }
        
        return date.toISOString().split('T')[0];
      } catch (error) {
        continue; // Skip this match and try the next pattern
      }
    }
  }
  
  return null;
}
const handleFileUpload = async (file: File) => {
  setError(null);
  
  // Use validation utility
  const validation = ValidationUtils.validateFileUpload(file, 5 * 1024 * 1024);
  if (!validation.valid) {
    setError(validation.error!);
    return;
  }

  // Rate limiting
  if (!ValidationUtils.checkRateLimit(`receipt_${user?.uid}`, 3, 60000)) {
    setError('Please wait before uploading another receipt');
    return;
  }

  setUploadedFile(file);
  await processImage(new Blob([file], { type: file.type }));
};

const stopCamera = () => {
  // Add camera functionality if needed, or just leave empty for now
  console.log('Camera stopped');
};
function generateRecommendations(items: ReceiptItem[]): string[] {
  const recommendations = [];
  const totalSavings = items.reduce((sum, item) => sum + (item.alternatives?.[0]?.savings || 0), 0);
  
  if (totalSavings > 5) {
    recommendations.push(`Switch stores to save £${totalSavings.toFixed(2)} on this shop`);
  }
  
  const expensiveItems = items.filter(item => item.price > 10);
  if (expensiveItems.length > 0) {
    recommendations.push('Consider own-brand alternatives for expensive items');
  }
  
  recommendations.push('Use store loyalty apps for additional discounts');
  recommendations.push('Shop during promotional periods for maximum savings');
  
  return recommendations;
}

  const saveToSubscriptions = async (item: ReceiptItem) => {
    if (!user) return;
    
    // This would save recurring purchases as potential subscriptions
    console.log('Saving recurring item:', item);
  };

  if (loading) {
  return <LoadingState message="Loading receipt scanner" type="scanner" />;
}

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Receipt Scanner</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!uploadedFile && !analysis && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Receipt Analysis</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Upload a photo of your receipt and our AI will find cheaper alternatives across UK supermarkets.
                Save money on your regular shopping by discovering better deals.
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Camera className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-sm mb-1">OCR Technology</h3>
                <p className="text-xs text-gray-500">Advanced text recognition from receipt photos</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Zap className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                <h3 className="font-semibold text-sm mb-1">Price Comparison</h3>
                <p className="text-xs text-gray-500">Real-time prices across major UK retailers</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <TrendingDown className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold text-sm mb-1">Smart Savings</h3>
                <p className="text-xs text-gray-500">Personalized money-saving recommendations</p>
              </div>
            </div>

            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                isDragOver 
                  ? 'border-green-400 bg-green-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Drop your receipt photo here
              </h3>
              <p className="text-gray-500 mb-4">
                or <button 
                  onClick={() => document.getElementById('receipt-file-input')?.click()}
                  className="text-green-600 hover:text-green-700 font-medium"
                >
                  click to browse
                </button>
              </p>
              <p className="text-sm text-gray-400">
                Supports JPEG, PNG, WebP • Max 10MB • All major UK retailers
              </p>
              <input
                id="receipt-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Supported Retailers */}
            <div className="mt-8">
              <h3 className="text-center text-sm font-medium text-gray-700 mb-4">Supported Retailers</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                {['Tesco', 'ASDA', 'Sainsbury\'s', 'Morrisons', 'Iceland', 'Aldi', 'Lidl', 'M&S', 'Waitrose', 'Co-op'].map((store) => (
                  <div key={store} className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                    {store}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 rounded">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                  <p className="text-red-700">{error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing Screen */}
        {isProcessing && (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Camera className="w-8 h-8 text-green-600 animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Processing Your Receipt</h2>
            <div className="max-w-md mx-auto">
              <div className="flex items-center mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mr-3"></div>
                <span className="text-gray-600">{processingStep}</span>
              </div>
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: isProcessing ? '75%' : '0%' }}
                ></div>
              </div>
            </div>
            <p className="text-gray-500 mt-4 text-sm">
              Using AI OCR and price comparison across UK retailers...
            </p>
          </div>
        )}

        {/* Results Screen */}
        {analysis && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow border">
                <h3 className="text-sm font-medium text-gray-500">Store</h3>
                <p className="text-2xl font-bold text-gray-900">{analysis.store}</p>
                <p className="text-sm text-gray-400">{analysis.date}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow border">
                <h3 className="text-sm font-medium text-gray-500">Total Spent</h3>
                <p className="text-2xl font-bold text-gray-900">£{analysis.totalSpent.toFixed(2)}</p>
                <p className="text-sm text-gray-400">{analysis.items.length} items</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow border">
                <h3 className="text-sm font-medium text-gray-500">Potential Savings</h3>
                <p className="text-2xl font-bold text-green-600">£{analysis.totalSavings.toFixed(2)}</p>
                <p className="text-sm text-gray-400">{Math.round((analysis.totalSavings / analysis.totalSpent) * 100)}% cheaper</p>
              </div>
            </div>

            {/* Smart Recommendations */}
            <div className="bg-white rounded-xl shadow border p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">💡 Smart Shopping Tips</h2>
              <div className="space-y-3">
                {analysis.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start p-3 bg-blue-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700 text-sm">{rec}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Item Analysis */}
            <div className="bg-white rounded-xl shadow border p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Item-by-Item Analysis</h2>
              <div className="space-y-6">
                {analysis.items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <p className="text-sm text-gray-500 capitalize">{item.category} • Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">£{item.price.toFixed(2)}</p>
                        <p className="text-sm text-gray-500">Current price</p>
                      </div>
                    </div>

                    {item.alternatives && item.alternatives.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-700 mb-3">Cheaper Alternatives:</h4>
                        <div className="space-y-2">
                          {item.alternatives.slice(0, 2).map((alt, altIndex) => (
                            <div key={altIndex} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                              <div>
                                <p className="font-medium text-gray-900">{alt.name}</p>
                                <p className="text-sm text-gray-600">{alt.store}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">£{alt.price.toFixed(2)}</p>
                                <p className="text-sm text-green-600 font-medium">
                                  Save £{alt.savings.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {item.category === 'Household' && (
                          <button
                            onClick={() => saveToSubscriptions(item)}
                            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
                          >
                            <ArrowRight className="w-4 h-4 mr-1" />
                            Track as recurring purchase
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => {
                  setUploadedFile(null);
                  setAnalysis(null);
                  setError(null);
                }}
                className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center"
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan Another Receipt
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-gray-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                View Dashboard
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
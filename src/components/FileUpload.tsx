// components/FileUpload.tsx
'use client';
import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onDataParsed: (data: any[]) => void;
}

export default function FileUpload({ onDataParsed }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFiles = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    setFile(file);
    setError('');
    setSuccess('');
    
    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(csv|xlsx?|txt)$/i)) {
      setError('Please upload a CSV, Excel, or TXT file');
      return;
    }

    await parseFile(file);
  }, []);

  const parseFile = async (file: File) => {
    setLoading(true);
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          let data: any[] = [];
          
          if (file.name.endsWith('.csv') || file.type === 'text/csv') {
            // Parse CSV
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim());
            const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
            
            data = lines.slice(1).map(line => {
              const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
              const row: any = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              return row;
            });
          } else {
            // Parse plain text as transactions
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim());
            
            data = lines.map((line, index) => ({
              id: index + 1,
              description: line.trim(),
              amount: extractAmount(line),
              date: extractDate(line) || new Date().toISOString().split('T')[0],
              category: 'Unknown'
            }));
          }

          // Process and detect subscriptions
          const processedData = await detectSubscriptions(data);
          
          setSuccess(`Successfully parsed ${processedData.length} transactions`);
          onDataParsed?.(processedData);
          
        } catch (parseError) {
          console.error('Parse error:', parseError);
          setError('Error parsing file. Please check the format.');
        } finally {
          setLoading(false);
        }
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      console.error('File read error:', error);
      setError('Error reading file');
      setLoading(false);
    }
  };

  const extractAmount = (text: string): number => {
    const amountMatch = text.match(/[-+]?[\d,]+\.?\d*/);
    return amountMatch ? parseFloat(amountMatch[0].replace(',', '')) : 0;
  };

  const extractDate = (text: string): string | null => {
    const dateMatch = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
    if (dateMatch) {
      const date = new Date(dateMatch[0]);
      return date.toISOString().split('T')[0];
    }
    return null;
  };

  const detectSubscriptions = async (data: any[]): Promise<any[]> => {
    const subscriptionKeywords = [
      'netflix', 'spotify', 'amazon', 'apple', 'google', 'microsoft',
      'adobe', 'dropbox', 'youtube', 'hulu', 'disney', 'subscription',
      'monthly', 'recurring', 'auto-pay', 'direct debit'
    ];

    return data.map(row => {
      const description = (row.description || row.Description || '').toLowerCase();
      const isSubscription = subscriptionKeywords.some(keyword => 
        description.includes(keyword)
      );

      return {
        ...row,
        id: row.id || Math.random().toString(36).substr(2, 9),
        isSubscription,
        confidence: isSubscription ? 0.8 : 0.2,
        merchantName: extractMerchantName(description),
        amount: Math.abs(parseFloat(row.amount || row.Amount || 0)),
        date: row.date || row.Date || new Date().toISOString().split('T')[0],
        status: 'active'
      };
    });
  };

  const extractMerchantName = (description: string): string => {
    // Simple merchant name extraction
    const cleanDesc = description.replace(/[^a-zA-Z\s]/g, ' ').trim();
    const words = cleanDesc.split(/\s+/).filter(word => word.length > 2);
    return words.slice(0, 2).join(' ') || 'Unknown Merchant';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Your Bank Statement</h2>
        <p className="text-gray-600">We'll analyze it to find your subscriptions</p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleChange}
          accept=".csv,.xlsx,.xls,.txt"
          disabled={loading}
        />

        <div className="space-y-4">
          {loading ? (
            <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
          ) : (
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
          )}

          <div>
            <p className="text-lg font-medium text-gray-900">
              {loading ? 'Processing your file...' : 'Drop your file here, or click to browse'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Supports CSV, Excel (XLSX/XLS), and TXT files
            </p>
          </div>

          {file && (
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              <span>{file.name}</span>
              <span>({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <CheckCircle className="h-5 w-5" />
          <span>{success}</span>
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>📱 Your data stays private - everything is processed locally</p>
      </div>
    </div>
  );
}
// utils/validation.ts
import { useState } from 'react';
import { z } from 'zod';

// Schemas for data validation
export const subscriptionSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  cost: z.number().min(0).max(10000),
  billingDate: z.number().min(1).max(31),
  category: z.enum(['streaming', 'software', 'fitness', 'housing', 'food', 'savings', 'insurance', 'transport', 'utilities', 'entertainment', 'other']),
  frequency: z.enum(['monthly', 'weekly', 'annual', 'unknown']).optional()
});

export const transactionSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number().min(0).max(100000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  merchantName: z.string().min(1).max(200).optional()
});

export const fileUploadSchema = z.object({
  file: z.instanceof(File),
  maxSize: z.number().default(10 * 1024 * 1024), // 10MB
  allowedTypes: z.array(z.string()).default(['image/jpeg', 'image/png', 'application/pdf', 'text/csv'])
});

// Type inference from schemas
export type SubscriptionData = z.infer<typeof subscriptionSchema>;
export type TransactionData = z.infer<typeof transactionSchema>;
export type FileUploadData = z.infer<typeof fileUploadSchema>;

// Validation functions
export class ValidationUtils {
  /**
   * Sanitize string input to prevent XSS
   */
  static sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .slice(0, 1000); // Limit length
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate UK currency amount
   */
 static isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0 && amount <= 100000;
}

  /**
   * Validate file upload
   */
  static validateFileUpload(file: File, maxSize = 10 * 1024 * 1024): { valid: boolean; error?: string } {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf', 'text/csv', 'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'File type not supported' };
    }

    if (file.size > maxSize) {
      return { valid: false, error: `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit` };
    }

    // Check for suspicious file names
    if (/[<>:"/\\|?*]/.test(file.name)) {
      return { valid: false, error: 'Invalid file name' };
    }

    return { valid: true };
  }

  /**
   * Validate date string
   */
  static isValidDate(dateStr: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && 
           date.getFullYear() >= 2020 && 
           date.getFullYear() <= 2030;
  }

  /**
   * Sanitize merchant name from bank statements
   */
  static sanitizeMerchantName(name: string): string {
    return name
      .replace(/CARD PAYMENT TO\s*/i, '')
      .replace(/DIRECT DEBIT PAYMENT TO\s*/i, '')
      .replace(/\(VIA APPLE PAY\)/i, '')
      .replace(/[^a-zA-Z0-9\s&.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  /**
   * Rate limit checker (simple in-memory implementation)
   */
  private static rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  static checkRateLimit(key: string, maxRequests = 10, windowMs = 60000): boolean {
    const now = Date.now();
    const record = this.rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (record.count >= maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Validate subscription data using Zod schema
   */
  static validateSubscription(data: unknown): { valid: boolean; data?: SubscriptionData; errors?: string[] } {
    try {
      const validData = subscriptionSchema.parse(data);
      return { valid: true, data: validData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          valid: false, 
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  /**
   * Validate transaction data using Zod schema
   */
  static validateTransaction(data: unknown): { valid: boolean; data?: TransactionData; errors?: string[] } {
    try {
      const validData = transactionSchema.parse(data);
      return { valid: true, data: validData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          valid: false, 
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }
}

// Custom error types
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class FileValidationError extends Error {
  constructor(message: string, public file?: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

// Hook for form validation with Zod
export function useFormValidation<T extends Record<string, any>>(schema: z.ZodSchema<T>) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (data: any): data is T => {
    try {
      schema.parse(data);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          const field = err.path.join('.');
          newErrors[field] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const getFieldError = (field: string) => errors[field];
  const hasErrors = Object.keys(errors).length > 0;
  const clearErrors = () => setErrors({});

  return { validate, getFieldError, hasErrors, errors, clearErrors };
}

// Safe parsing utilities
export const safeParseSubscription = (data: unknown) => subscriptionSchema.safeParse(data);
export const safeParseTransaction = (data: unknown) => transactionSchema.safeParse(data);
export const safeParseFileUpload = (data: unknown) => fileUploadSchema.safeParse(data);
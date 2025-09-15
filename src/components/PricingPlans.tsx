
// =============================================================================
// src/components/PricingPlans.tsx
// =============================================================================

'use client';

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Zap, Brain, Crown, CreditCard } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: <CheckCircle className="w-6 h-6" />,
    features: [
      'Manual subscription tracking',
      'Basic insights',
      'Email reminders',
      'Up to 10 subscriptions',
      'Monthly spending reports'
    ]
  },
  {
    id: 'smart',
    name: 'Smart',
    description: 'AI-powered subscription management',
    monthlyPrice: 4.99,
    yearlyPrice: 49.99,
    popular: true,
    icon: <Brain className="w-6 h-6" />,
    features: [
      'Everything in Free',
      'AI bank statement analysis',
      'Smart subscription detection',
      'Advanced insights & recommendations',
      'Unlimited subscriptions',
      'Receipt scanning',
      'Price comparison across retailers',
      'Cancellation assistance',
      'Priority email support'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Complete financial optimization',
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    icon: <Crown className="w-6 h-6" />,
    features: [
      'Everything in Smart',
      'Bill negotiation service',
      'Family plan management',
      'Custom spending categories',
      'API access for developers',
      'White-label dashboard',
      'Advanced analytics & reporting',
      'Phone support',
      'Personal finance consultant calls'
    ]
  }
];

function CheckoutForm({ plan, billingCycle, onSuccess }: { plan: string; billingCycle: 'monthly' | 'yearly'; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // Get user token
      const token = await user?.getIdToken();
      
      // Create payment intent
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan, billingCycle })
      });

      const { clientSecret, amount } = await response.json();

      // Confirm payment
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {
            email: user?.email || '',
          },
        }
      });

      if (result.error) {
        setError(result.error.message || 'Payment failed');
      } else {
        // Payment succeeded
        onSuccess();
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 border border-gray-200 rounded-lg">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {isProcessing ? (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Processing...
          </div>
        ) : (
          <>
            <CreditCard className="w-5 h-5 mr-2" />
            Complete Purchase
          </>
        )}
      </button>
    </form>
  );
}

export default function PricingPlans() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const { user } = useAuth();

  const handlePlanSelect = (planId: string) => {
    if (planId === 'free') {
      // Handle free plan signup
      console.log('Free plan selected');
      return;
    }
    
    if (!user) {
      // Redirect to login
      window.location.href = '/login';
      return;
    }

    setSelectedPlan(planId);
    setShowCheckout(true);
  };

  const handlePaymentSuccess = () => {
    setShowCheckout(false);
    // Redirect to dashboard or success page
    window.location.href = '/dashboard?upgraded=true';
  };

  if (showCheckout && selectedPlan) {
    const plan = plans.find(p => p.id === selectedPlan)!;
    const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Complete Your Purchase</h2>
              <div className="flex items-center justify-center text-blue-600 mb-4">
                {plan.icon}
                <span className="ml-2 font-semibold">{plan.name} Plan</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                £{price.toFixed(2)}
                <span className="text-lg font-normal text-gray-600">/{billingCycle}</span>
              </p>
              {billingCycle === 'yearly' && (
                <p className="text-green-600 text-sm mt-1">
                  Save £{((plan.monthlyPrice * 12) - plan.yearlyPrice).toFixed(2)} per year!
                </p>
              )}
            </div>

            <Elements stripe={stripePromise}>
              <CheckoutForm 
                plan={selectedPlan} 
                billingCycle={billingCycle} 
                onSuccess={handlePaymentSuccess}
              />
            </Elements>

            <button
              onClick={() => setShowCheckout(false)}
              className="w-full mt-4 text-gray-600 hover:text-gray-800 text-sm"
            >
              ← Back to plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Stop wasting money on forgotten subscriptions. Start saving with SubScan's AI-powered analysis.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center mb-8">
            <div className="bg-gray-200 p-1 rounded-lg flex">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <span className="ml-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                  Save 17%
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const monthlySavings = billingCycle === 'yearly' && plan.monthlyPrice > 0 
              ? (plan.monthlyPrice * 12) - plan.yearlyPrice 
              : 0;

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl shadow-lg p-8 ${
                  plan.popular ? 'ring-2 ring-blue-500 transform scale-105' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className="flex items-center justify-center text-blue-600 mb-4">
                    {plan.icon}
                    <span className="ml-2 text-xl font-bold">{plan.name}</span>
                  </div>
                  
                  <p className="text-gray-600 mb-4">{plan.description}</p>
                  
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900">
                      £{price.toFixed(2)}
                    </span>
                    {plan.monthlyPrice > 0 && (
                      <span className="text-gray-600">/{billingCycle}</span>
                    )}
                  </div>

                  {monthlySavings > 0 && (
                    <p className="text-green-600 text-sm mb-4">
                      Save £{monthlySavings.toFixed(2)} per year!
                    </p>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePlanSelect(plan.id)}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : plan.id === 'free'
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {plan.id === 'free' ? 'Get Started Free' : `Choose ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <p className="text-gray-600 mb-4">
            All plans include a 30-day money-back guarantee
          </p>
          <div className="flex justify-center space-x-8 text-sm text-gray-500">
            <span>✓ Secure payments by Stripe</span>
            <span>✓ Cancel anytime</span>
            <span>✓ UK VAT included</span>
          </div>
        </div>
      </div>
    </div>
  );
}
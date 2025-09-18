// src/app/pricing/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Zap, Brain, TrendingUp, Users, Shield, Star } from 'lucide-react';

export default function PricingPage() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: { monthly: 0, yearly: 0 },
      description: 'Perfect for getting started',
      features: [
        'Track up to 5 subscriptions',
        'Basic subscription insights',
        'Manual subscription entry',
        'Email reminders',
        'Mobile responsive'
      ],
      limitations: [
        'No bank statement upload',
        'No receipt scanning',
        'No budget planning',
        'Basic support only'
      ],
      cta: 'Get Started Free',
      popular: false,
      color: 'bg-gray-50 border-gray-200'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: { monthly: 9.99, yearly: 99.99 },
      description: 'Everything you need to save money',
      features: [
        'Unlimited subscriptions',
        'AI bank statement analysis',
        'Receipt scanning with OCR',
        'Smart budgeting with % allocation',
        'Advanced insights & recommendations',
        'Cancellation assistance',
        'Priority email support',
        'Data export',
        'All scanner features'
      ],
      limitations: [],
      cta: 'Start Pro Trial',
      popular: true,
      color: 'bg-blue-50 border-blue-200'
    },
    {
      id: 'business',
      name: 'Business',
      price: { monthly: 19.99, yearly: 199.99 },
      description: 'For families and small teams',
      features: [
        'Everything in Pro',
        'Up to 5 user accounts',
        'Shared household budgets',
        'Team analytics dashboard',
        'API access',
        'Custom categories',
        'White-label options',
        'Phone support',
        'Advanced reporting'
      ],
      limitations: [],
      cta: 'Start Business Trial',
      popular: false,
      color: 'bg-purple-50 border-purple-200'
    }
  ];

  const handleGetStarted = (planId: string) => {
    if (planId === 'free') {
      router.push('/login');
    } else {
      // For now, redirect to signup with plan parameter
      router.push(`/login?plan=${planId}&billing=${billingCycle}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">SubScan</h1>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>

      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Choose Your Plan
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Stop wasting money on forgotten subscriptions. SubScan helps UK households 
              save hundreds of pounds per year with AI-powered financial insights.
            </p>

            {/* Social Proof */}
            <div className="flex justify-center items-center space-x-6 mb-8">
              <div className="flex items-center">
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <span className="ml-2 text-gray-600">Trusted by 1000+ UK users</span>
              </div>
            </div>

            {/* Billing Toggle */}
            <div className="flex justify-center mb-12">
              <div className="bg-gray-200 p-1 rounded-lg">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-gray-900 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingCycle === 'yearly'
                      ? 'bg-white text-gray-900 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Yearly
                  <span className="ml-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    Save 17%
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-8 ${plan.color} ${
                  plan.popular ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-gray-600 mb-4">{plan.description}</p>
                  
                  <div className="mb-4">
                    <span className="text-5xl font-bold text-gray-900">
                      £{plan.price[billingCycle]}
                    </span>
                    {plan.price[billingCycle] > 0 && (
                      <span className="text-gray-500 ml-2">
                        /{billingCycle === 'monthly' ? 'month' : 'year'}
                      </span>
                    )}
                  </div>
                  
                  {billingCycle === 'yearly' && plan.price.yearly > 0 && (
                    <p className="text-sm text-green-600 font-medium">
                      £{((plan.price.monthly * 12 - plan.price.yearly) / 12).toFixed(2)} saved per month
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleGetStarted(plan.id)}
                  className={`w-full py-3 px-6 rounded-lg font-medium transition-colors mb-8 ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {plan.cta}
                </button>

                {/* Features */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900 flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-2" />
                    What's Included:
                  </h4>
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  {plan.limitations.length > 0 && (
                    <>
                      <h4 className="font-semibold text-gray-900 mt-6">Not Included:</h4>
                      <ul className="space-y-2">
                        {plan.limitations.map((limitation, index) => (
                          <li key={index} className="flex items-start">
                            <span className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0">×</span>
                            <span className="text-gray-500 text-sm">{limitation}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Feature Comparison */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
              Why Choose SubScan?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">AI-Powered Analysis</h3>
                <p className="text-gray-600">
                  Our advanced AI scans your bank statements and receipts to automatically 
                  detect subscriptions you might have forgotten about.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Smart Budgeting</h3>
                <p className="text-gray-600">
                  Set percentage-based budgets that automatically adjust to your income, 
                  with intelligent spending insights and recommendations.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Privacy First</h3>
                <p className="text-gray-600">
                  Your financial data is processed locally and encrypted. We never store 
                  your bank details or sell your information to third parties.
                </p>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
              Frequently Asked Questions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  How does bank statement analysis work?
                </h3>
                <p className="text-gray-600">
                  Simply export a CSV from your online banking and upload it to SubScan. 
                  Our AI analyzes transaction patterns to identify recurring subscriptions.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Which UK banks are supported?
                </h3>
                <p className="text-gray-600">
                  We support all major UK banks including Lloyds, Barclays, HSBC, Santander, 
                  Monzo, Starling, and many more.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Can I cancel anytime?
                </h3>
                <p className="text-gray-600">
                  Yes, absolutely. Cancel your subscription at any time from your account 
                  settings. No contracts or cancellation fees.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  How much money can I save?
                </h3>
                <p className="text-gray-600">
                  Our users typically save £200-500 per year by identifying and cancelling 
                  unused subscriptions and optimizing their spending.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Start Saving?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join thousands of UK users who have already saved hundreds of pounds.
            </p>
            <button
              onClick={() => handleGetStarted('pro')}
              className="bg-white text-blue-600 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors"
            >
              Start Your Free Trial
            </button>
            <p className="mt-4 text-sm opacity-80">
              14-day free trial • No credit card required • Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
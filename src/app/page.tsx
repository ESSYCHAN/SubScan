'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { 
  Upload, 
  Shield, 
  Zap, 
  DollarSign, 
  CheckCircle, 
  ArrowRight,
  Star,
  Users,
  TrendingUp
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const handleGetStarted = () => {
    router.push('/scanner');
  };

  const handleLogin = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-sm z-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="text-xl font-bold text-gray-900">SubScan</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/pricing')}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Pricing
              </button>
              <button
                onClick={handleLogin}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Login
              </button>
              <button
                onClick={handleGetStarted}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Get Started Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="mb-8">
            <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              <span>AI-Powered Subscription Detection</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Find Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Hidden</span><br />
              Subscriptions Instantly
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Upload your bank statement and let our AI discover forgotten subscriptions. 
              No account linking required. Keep 100% of your savings.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center space-x-2"
            >
              <Upload className="h-5 w-5" />
              <span>Upload Statement Free</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>No registration required</span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-8 text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>10,000+ users</span>
            </div>
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4" />
              <span>£2.3M saved</span>
            </div>
            <div className="flex items-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="ml-2">4.9/5 rating</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How SubScan Works</h2>
            <p className="text-gray-600 text-lg">Three simple steps to financial freedom</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">1. Upload Your Statement</h3>
              <p className="text-gray-600">
                Simply drag and drop your bank statement (CSV, Excel, or PDF). 
                Your data never leaves your device.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Zap className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">2. AI Analysis</h3>
              <p className="text-gray-600">
                Our smart AI scans every transaction to identify recurring payments 
                and potential subscriptions you might have forgotten.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">3. Start Saving</h3>
              <p className="text-gray-600">
                Get a complete overview of all your subscriptions and cancel the ones 
                you don't need. Keep 100% of your savings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Why Choose SubScan?
              </h2>
              
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <Shield className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">100% Private & Secure</h3>
                    <p className="text-gray-600">Your financial data stays on your device. No cloud storage, no data sharing.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <Zap className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Instant Results</h3>
                    <p className="text-gray-600">Get your subscription analysis in seconds, not hours.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <TrendingUp className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Smart Detection</h3>
                    <p className="text-gray-600">Advanced AI finds subscriptions other tools miss.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircle className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">No Hidden Fees</h3>
                    <p className="text-gray-600">Free analysis. No signup required. Keep all your savings.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-8 rounded-2xl">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Average User Saves</h3>
                <div className="text-5xl font-bold text-blue-600 mb-2">£284</div>
                <p className="text-gray-600 mb-6">per year on unused subscriptions</p>
                
                <div className="bg-white p-6 rounded-xl">
                  <h4 className="font-semibold text-gray-900 mb-4">What users typically find:</h4>
                  <div className="space-y-3 text-left">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Streaming services</span>
                      <span className="font-semibold">£45/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cloud storage</span>
                      <span className="font-semibold">£12/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Forgotten apps</span>
                      <span className="font-semibold">£18/mo</span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between font-bold">
                      <span>Total potential savings</span>
                      <span className="text-green-600">£75/mo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Find Your Hidden Subscriptions?
          </h2>
          <p className="text-blue-100 text-lg mb-8">
            Join thousands of users who've already saved money with SubScan
          </p>
          
          <button
            onClick={handleGetStarted}
            className="bg-white text-blue-600 px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transform hover:scale-105 transition-all duration-200 inline-flex items-center space-x-2"
          >
            <Upload className="h-5 w-5" />
            <span>Start Free Analysis Now</span>
            <ArrowRight className="h-5 w-5" />
          </button>
          
          <p className="text-blue-100 text-sm mt-4">
            ✓ No registration ✓ 100% free ✓ Results in seconds
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="text-xl font-bold">SubScan</span>
            </div>
            
            <div className="text-gray-400 text-sm">
              © 2024 SubScan. Find your hidden subscriptions.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';

export interface Subscription {
  id?: string;
  userId: string;
  name: string;
  cleanName?: string;           // ADDED - for AI cleaned names
  originalName?: string;        // ADDED - original transaction description
  cost: number;
  billingCycle: 'monthly' | 'yearly';
  nextBilling: string;
  category: string;
  lastUsed: string;
  usageFrequency: 'daily' | 'weekly' | 'monthly' | 'rarely';
  signUpDate: string;
  source: 'manual' | 'bank_scan' | 'receipt_scan';
  confidence?: number;          // ADDED - AI confidence score
  risk?: 'low' | 'medium' | 'high';  // ADDED - risk assessment
  daysSinceUsed?: number;       // ADDED - calculated days
  isNewYearSignup?: boolean;    // ADDED - New Year detection
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Insight {
  id?: string;
  userId: string;
  type: 'warning' | 'alert' | 'tip' | 'info';
  title: string;
  message: string;
  subscriptionId?: string;
  saving?: number;
  priority: 'high' | 'medium' | 'low';
  dismissed: boolean;
  createdAt: Timestamp;
}

class SubscriptionService {
  // Subscription CRUD operations
  async createSubscription(userId: string, subscriptionData: Omit<Subscription, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Timestamp.now();
    const subscription: Omit<Subscription, 'id'> = {
      ...subscriptionData,
      userId,
      createdAt: now,
      updatedAt: now
    };

    const docRef = await addDoc(collection(db, 'subscriptions'), subscription);
    return docRef.id;
  }

  async getSubscriptions(userId: string): Promise<Subscription[]> {
    const q = query(
      collection(db, 'subscriptions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Subscription));
  }

  async updateSubscription(subscriptionId: string, updates: Partial<Subscription>): Promise<void> {
    const docRef = doc(db, 'subscriptions', subscriptionId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    const docRef = doc(db, 'subscriptions', subscriptionId);
    await deleteDoc(docRef);
  }

  // Insights operations
  async createInsight(userId: string, insightData: Omit<Insight, 'id' | 'userId' | 'createdAt'>): Promise<string> {
    const insight: Omit<Insight, 'id'> = {
      ...insightData,
      userId,
      createdAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, 'insights'), insight);
    return docRef.id;
  }

  async getInsights(userId: string): Promise<Insight[]> {
    const q = query(
      collection(db, 'insights'),
      where('userId', '==', userId),
      where('dismissed', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Insight));
  }

  async dismissInsight(insightId: string): Promise<void> {
    const docRef = doc(db, 'insights', insightId);
    await updateDoc(docRef, { dismissed: true });
  }

  // Smart insights generation
  generateSmartInsights(subscriptions: Subscription[]): Omit<Insight, 'id' | 'userId' | 'createdAt'>[] {
    const insights: Omit<Insight, 'id' | 'userId' | 'createdAt'>[] = [];
    const today = new Date();

    subscriptions.forEach(sub => {
      const daysSinceUsed = sub.daysSinceUsed || Math.floor((today.getTime() - new Date(sub.lastUsed).getTime()) / (1000 * 60 * 60 * 24));
      const monthlyValue = sub.billingCycle === 'yearly' ? sub.cost / 12 : sub.cost;
      const signUpMonth = new Date(sub.signUpDate).getMonth();

      // Gym membership detection
      if (sub.category === 'fitness') {
        if (signUpMonth === 0 && today.getMonth() > 2 && daysSinceUsed > 30) {
          insights.push({
            type: 'warning',
            title: 'New Year Resolution Alert',
            message: `${sub.name} membership from January (£${monthlyValue.toFixed(2)}/month) - 80% abandon by April. Last visit: ${daysSinceUsed} days ago. Annual waste: £${(monthlyValue * 12).toFixed(2)}`,
            subscriptionId: sub.id,
            saving: monthlyValue * 12,
            priority: 'high',
            dismissed: false
          });
        }

        if (monthlyValue > 30 && daysSinceUsed > 21) {
          insights.push({
            type: 'alert',
            title: 'Expensive Unused Gym',
            message: `Paying £${monthlyValue.toFixed(2)}/month but last visit was ${daysSinceUsed} days ago. You could save £${(monthlyValue * 12).toFixed(2)}/year by canceling!`,
            subscriptionId: sub.id,
            saving: monthlyValue * 12,
            priority: 'high',
            dismissed: false
          });
        }
      }

      // Streaming service detection
      if (sub.category === 'entertainment' && daysSinceUsed > 30) {
        insights.push({
          type: 'warning',
          title: 'Forgotten Streaming Service',
          message: `${sub.name} unused for ${daysSinceUsed} days but still paying £${monthlyValue.toFixed(2)}/month. Cancel now to save £${(monthlyValue * 12).toFixed(2)} this year!`,
          subscriptionId: sub.id,
          saving: monthlyValue * 12,
          priority: 'high',
          dismissed: false
        });
      }

      // General unused subscription
      if (daysSinceUsed > 45 && sub.usageFrequency === 'rarely') {
        insights.push({
          type: 'warning',
          title: 'Long-Term Unused Subscription',
          message: `${sub.name} hasn't been used in ${daysSinceUsed} days and marked as rarely used. Consider canceling to save £${(monthlyValue * 12).toFixed(2)}/year.`,
          subscriptionId: sub.id,
          saving: monthlyValue * 12,
          priority: 'medium',
          dismissed: false
        });
      }
    });

    return insights.sort((a, b) => {
      const priority = { high: 3, medium: 2, low: 1 };
      return priority[b.priority] - priority[a.priority];
    });
  }

  // Calculate analytics
  getAnalytics(subscriptions: Subscription[]) {
    const totalMonthly = subscriptions.reduce((sum, sub) => 
      sum + (sub.billingCycle === 'monthly' ? sub.cost : sub.cost / 12), 0
    );

    const unusedSubs = subscriptions.filter(sub => {
      const daysSinceUsed = sub.daysSinceUsed || Math.floor((Date.now() - new Date(sub.lastUsed).getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceUsed > 30 || sub.usageFrequency === 'rarely';
    });

    const potentialSavings = unusedSubs.reduce((sum, sub) => 
      sum + (sub.billingCycle === 'monthly' ? sub.cost : sub.cost / 12), 0
    ) * 12;

    // Risk-based analytics
    const highRiskSubs = subscriptions.filter(sub => sub.risk === 'high');
    const mediumRiskSubs = subscriptions.filter(sub => sub.risk === 'medium');
    const lowRiskSubs = subscriptions.filter(sub => sub.risk === 'low');

    return {
      totalMonthly: parseFloat(totalMonthly.toFixed(2)),
      totalYearly: parseFloat((totalMonthly * 12).toFixed(2)),
      activeSubscriptions: subscriptions.length,
      unusedSubscriptions: unusedSubs.length,
      potentialSavings: parseFloat(potentialSavings.toFixed(2)),
      optimizedMonthly: parseFloat((totalMonthly - (potentialSavings / 12)).toFixed(2)),
      highRiskSubscriptions: highRiskSubs.length,
      mediumRiskSubscriptions: mediumRiskSubs.length,
      lowRiskSubscriptions: lowRiskSubs.length,
      bankProcessedCount: subscriptions.filter(s => s.source === 'bank_scan').length
    };
  }
}

export const subscriptionService = new SubscriptionService();
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import * as nodemailer from 'nodemailer';

admin.initializeApp();

const openai = new OpenAI({
  apiKey: functions.config().openai?.key || process.env.OPENAI_API_KEY
});

// Email transporter with proper typing
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().email?.user || process.env.EMAIL_USER,
    pass: functions.config().email?.pass || process.env.EMAIL_PASS
  }
});

// Define types for better TypeScript support
interface BankTransaction {
  date: string;
  description: string;
  amount: number;
  type: string;
  category?: string;
  isSubscription?: boolean;
  cleanName?: string;
}

interface DetectedSubscription {
  name: string;
  cleanName: string;
  originalName: string;
  cost: number;
  billingCycle: 'monthly' | 'yearly';
  nextBilling: string;
  category: string;
  lastUsed: string;
  usageFrequency: 'daily' | 'weekly' | 'monthly' | 'rarely';
  signUpDate: string;
  source: 'bank_scan';
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  daysSinceUsed: number;
  isNewYearSignup: boolean;
}

interface SmartInsight {
  type: 'warning' | 'alert' | 'tip' | 'info';
  title: string;
  message: string;
  subscriptionId?: string;
  saving?: number;
  priority: 'high' | 'medium' | 'low';
  dismissed: boolean;
}

// AI BANK STATEMENT PROCESSING
export const processStatement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { transactions, bankFormat } = data;
  
  try {
    functions.logger.info('Processing bank statement', { 
      userId: context.auth.uid, 
      transactionCount: transactions.length,
      bankFormat 
    });

    // Clean merchant names with AI
    const cleanedTransactions: BankTransaction[] = await Promise.all(
      transactions.map(async (txn: any) => {
        const cleanName = await cleanMerchantNameWithAI(txn.description);
        const category = await categorizeMerchantWithAI(cleanName);
        
        return {
          ...txn,
          cleanName,
          category,
          isSubscription: isLikelySubscription(txn.description, Math.abs(txn.amount))
        };
      })
    );

    const detectedSubscriptions = detectSubscriptionPatterns(cleanedTransactions);
    
    // Save to Firestore
    const batch = admin.firestore().batch();
    detectedSubscriptions.forEach((sub: DetectedSubscription) => {
      const docRef = admin.firestore().collection('subscriptions').doc();
      batch.set(docRef, {
        ...sub,
        userId: context.auth!.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active'
      });
    });
    await batch.commit();
    
    // Generate insights with proper typing
    const insights: SmartInsight[] = generateSmartInsights(detectedSubscriptions);
    const insightsBatch = admin.firestore().batch();
    insights.forEach((insight: SmartInsight) => {
      const docRef = admin.firestore().collection('insights').doc();
      insightsBatch.set(docRef, {
        ...insight,
        userId: context.auth!.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        dismissed: false
      });
    });
    await insightsBatch.commit();
    
    return { 
      success: true, 
      subscriptions: detectedSubscriptions,
      insights: insights,
      totalProcessed: cleanedTransactions.length,
      bankFormat: bankFormat
    };
  } catch (error) {
    functions.logger.error('Error processing statement:', error);
    throw new functions.https.HttpsError('internal', 'Failed to process statement');
  }
});

// AI MERCHANT NAME CLEANUP
async function cleanMerchantNameWithAI(description: string): Promise<string> {
  try {
    const prompt = `Clean this bank transaction description into a proper service name: "${description}"
    
    Examples:
    "NETFLIX.COM AMSTERDAM" -> "Netflix"
    "SPOTIFY UK LONDON" -> "Spotify Premium"
    "ADOBE CREATIVE CLOUD" -> "Adobe Creative Cloud"
    "AMZN PRIME UK MEMBERSHIP" -> "Amazon Prime"
    "MSFT*OFFICE365 PERSONAL" -> "Microsoft 365"
    "GYM GROUP PLC MONTHLY" -> "The Gym Group"
    "HELLOFRESH UK LIMITED" -> "HelloFresh"
    "DISNEY PLUS UK" -> "Disney+"
    "ZOOM.US 888-799-9666" -> "Zoom Pro"
    "APPLE.COM/BILL ITUNES" -> "Apple Services"
    
    Return only the clean name, no explanation:`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50,
      temperature: 0
    });

    const cleanName = response.choices[0].message.content?.trim();
    return cleanName || cleanMerchantNameFallback(description);
  } catch (error) {
    functions.logger.error('OpenAI error:', error);
    return cleanMerchantNameFallback(description);
  }
}

// FALLBACK MERCHANT NAME CLEANUP
function cleanMerchantNameFallback(description: string): string {
  const cleanupRules = [
    { pattern: /SPOTIFY.*/, replacement: 'Spotify Premium' },
    { pattern: /NETFLIX.*/, replacement: 'Netflix' },
    { pattern: /ADOBE.*/, replacement: 'Adobe Creative Cloud' },
    { pattern: /AMAZON.*PRIME.*/, replacement: 'Amazon Prime' },
    { pattern: /MICROSOFT.*365.*|MSFT.*OFFICE.*/, replacement: 'Microsoft 365' },
    { pattern: /APPLE.*/, replacement: 'Apple Services' },
    { pattern: /DISNEY.*/, replacement: 'Disney+' },
    { pattern: /ZOOM.*/, replacement: 'Zoom' },
    { pattern: /GYM.*GROUP.*/, replacement: 'The Gym Group' },
    { pattern: /HELLO.*FRESH.*/, replacement: 'HelloFresh' },
    { pattern: /GOOGLE.*/, replacement: 'Google Services' },
    { pattern: /DROPBOX.*/, replacement: 'Dropbox' }
  ];
  
  let cleaned = description.toUpperCase();
  
  for (const rule of cleanupRules) {
    if (rule.pattern.test(cleaned)) {
      return rule.replacement;
    }
  }
  
  // Generic cleanup
  cleaned = cleaned.replace(/[0-9]{4,}/g, ''); // Remove long numbers
  cleaned = cleaned.replace(/\*+/g, ''); // Remove asterisks
  cleaned = cleaned.replace(/\b(LTD|PLC|LIMITED|INC|CORP)\b/g, '');
  cleaned = cleaned.replace(/\b(LONDON|UK|GB|AMSTERDAM|DUBLIN)\b/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return titleCase(cleaned);
}

// AI CATEGORIZATION
async function categorizeMerchantWithAI(name: string): Promise<string> {
  try {
    const categories = ['streaming', 'software', 'fitness', 'food', 'cloud', 'news', 'gaming', 'shopping', 'other'];
    
    const prompt = `Categorize this service: "${name}"
    
    Categories: ${categories.join(', ')}
    
    Examples:
    Netflix -> streaming
    Adobe Creative Cloud -> software
    The Gym Group -> fitness
    HelloFresh -> food
    Dropbox -> cloud
    The Times -> news
    Xbox Live -> gaming
    
    Return only the category name:`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
      temperature: 0
    });

    const category = response.choices[0].message.content?.trim().toLowerCase();
    return categories.includes(category || '') ? category! : 'other';
  } catch (error) {
    functions.logger.error('Category AI error:', error);
    return categorizeFallback(name);
  }
}

function categorizeFallback(name: string): string {
  const patterns = {
    streaming: ['NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'APPLE MUSIC', 'YOUTUBE'],
    software: ['ADOBE', 'MICROSOFT', 'OFFICE', 'ZOOM', 'SLACK', 'CANVA'],
    fitness: ['GYM', 'FITNESS', 'PELOTON'],
    food: ['HELLOFRESH', 'UBER EATS', 'DELIVEROO', 'GOUSTO'],
    cloud: ['GOOGLE DRIVE', 'DROPBOX', 'ICLOUD', 'ONEDRIVE'],
    news: ['TIMES', 'GUARDIAN', 'FT', 'ECONOMIST'],
    gaming: ['XBOX', 'PLAYSTATION', 'STEAM', 'NINTENDO']
  };
  
  const upperName = name.toUpperCase();
  for (const [category, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => upperName.includes(keyword))) {
      return category;
    }
  }
  
  return 'other';
}

// SUBSCRIPTION DETECTION
function isLikelySubscription(description: string, amount: number): boolean {
  const desc = description.toUpperCase();
  
  // Known subscription patterns
  const subscriptionPatterns = [
    'NETFLIX', 'SPOTIFY', 'ADOBE', 'AMAZON PRIME', 'MICROSOFT',
    'APPLE', 'DISNEY', 'ZOOM', 'GYM', 'HELLOFRESH', 'GOOGLE'
  ];
  
  if (subscriptionPatterns.some(pattern => desc.includes(pattern))) {
    return true;
  }
  
  // Subscription indicators
  const indicators = [
    'MONTHLY', 'SUBSCRIPTION', 'PREMIUM', 'PRO', 'PLUS',
    'MEMBERSHIP', 'LICENSE', '.COM', 'RECURRING'
  ];
  
  return indicators.some(indicator => desc.includes(indicator));
}

// PATTERN DETECTION
function detectSubscriptionPatterns(transactions: BankTransaction[]): DetectedSubscription[] {
  const subscriptionMap = new Map<string, BankTransaction[]>();
  
  // Group by clean name
  transactions.filter(t => t.isSubscription).forEach(txn => {
    const key = txn.cleanName || txn.description;
    if (!subscriptionMap.has(key)) {
      subscriptionMap.set(key, []);
    }
    subscriptionMap.get(key)!.push(txn);
  });
  
  const subscriptions: DetectedSubscription[] = [];
  
  for (const [name, txns] of subscriptionMap) {
    if (txns.length >= 1) { // At least one transaction
      const latest = txns[0]; // Most recent
      const amounts = txns.map(t => Math.abs(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      
      // Determine billing cycle
      let billingCycle: 'monthly' | 'yearly' = 'monthly';
      if (txns.length >= 2) {
        const daysBetween = (new Date(txns[0].date).getTime() - new Date(txns[1].date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysBetween > 300) billingCycle = 'yearly';
      }
      
      const today = new Date();
      const lastUsed = new Date(latest.date);
      const daysSinceUsed = Math.floor((today.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate next billing
      const nextBilling = new Date(lastUsed);
      if (billingCycle === 'monthly') {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      } else {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      }
      
      subscriptions.push({
        name: name,
        cleanName: name,
        originalName: latest.description,
        cost: parseFloat(avgAmount.toFixed(2)),
        billingCycle,
        nextBilling: nextBilling.toISOString().split('T')[0],
        category: latest.category || 'other',
        lastUsed: latest.date,
        usageFrequency: estimateUsageFrequency(latest.category || 'other', daysSinceUsed),
        signUpDate: txns[txns.length - 1].date, // Earliest transaction
        source: 'bank_scan',
        confidence: calculateConfidence(txns),
        risk: calculateRisk(daysSinceUsed, avgAmount),
        daysSinceUsed,
        isNewYearSignup: new Date(txns[txns.length - 1].date).getMonth() === 0
      });
    }
  }
  
  return subscriptions;
}

function estimateUsageFrequency(category: string, daysSinceUsed: number): 'daily' | 'weekly' | 'monthly' | 'rarely' {
  if (daysSinceUsed > 60) return 'rarely';
  
  switch (category) {
    case 'streaming':
    case 'news':
      return daysSinceUsed < 7 ? 'daily' : 'weekly';
    case 'software':
    case 'cloud':
      return daysSinceUsed < 3 ? 'daily' : 'weekly';
    case 'fitness':
      return daysSinceUsed < 14 ? 'weekly' : 'monthly';
    case 'food':
      return daysSinceUsed < 7 ? 'weekly' : 'monthly';
    default:
      return daysSinceUsed < 30 ? 'monthly' : 'rarely';
  }
}

function calculateConfidence(transactions: BankTransaction[]): number {
  if (transactions.length === 1) return 0.7;
  if (transactions.length >= 3) return 0.95;
  return 0.85;
}

function calculateRisk(daysSinceUsed: number, cost: number): 'low' | 'medium' | 'high' {
  if (daysSinceUsed > 45 || (cost > 30 && daysSinceUsed > 21)) {
    return 'high';
  } else if (daysSinceUsed > 21 || cost > 50) {
    return 'medium';
  }
  return 'low';
}

// SMART INSIGHTS GENERATION
function generateSmartInsights(subscriptions: DetectedSubscription[]): SmartInsight[] {
  const insights: SmartInsight[] = [];
  
  subscriptions.forEach(sub => {
    const yearlyValue = sub.billingCycle === 'monthly' ? sub.cost * 12 : sub.cost;
    
    // New Year gym alert
    if (sub.isNewYearSignup && sub.category === 'fitness' && sub.daysSinceUsed > 30) {
      insights.push({
        type: 'warning',
        title: 'New Year Resolution Alert',
        message: `${sub.name} membership from January but unused for ${sub.daysSinceUsed} days. 80% of people abandon gym memberships by April. Save £${yearlyValue.toFixed(2)}/year by canceling.`,
        saving: yearlyValue,
        priority: 'high',
        dismissed: false
      });
    }
    
    // High cost unused
    if (sub.cost > 30 && sub.daysSinceUsed > 21) {
      insights.push({
        type: 'alert',
        title: 'Expensive Unused Service',
        message: `Paying £${sub.cost}/month for ${sub.name} but unused for ${sub.daysSinceUsed} days. Cancel to save £${yearlyValue.toFixed(2)}/year!`,
        saving: yearlyValue,
        priority: 'high',
        dismissed: false
      });
    }
    
    // Streaming overlap
    if (sub.category === 'streaming' && sub.daysSinceUsed > 30) {
      insights.push({
        type: 'warning',
        title: 'Forgotten Streaming Service',
        message: `${sub.name} unused for ${sub.daysSinceUsed} days. Cancel to save £${yearlyValue.toFixed(2)}/year!`,
        saving: yearlyValue,
        priority: 'high',
        dismissed: false
      });
    }
  });
  
  return insights.slice(0, 5); // Top 5 insights
}

// EMAIL NOTIFICATIONS
// Replace the sendBillingReminders function with this v2 version:
// export const sendBillingReminders = functions.scheduler.onSchedule(
//   {
//     schedule: '0 9 * * *',
//     timeZone: 'Europe/London'
//   },
//   async (event) => {
//     const tomorrow = new Date();
//     tomorrow.setDate(tomorrow.getDate() + 1);
//     const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
//     const subscriptionsSnapshot = await admin.firestore()
//       .collectionGroup('subscriptions')
//       .where('nextBilling', '==', tomorrowStr)
//       .get();
    
//     for (const doc of subscriptionsSnapshot.docs) {
//       const subscription = doc.data();
//       const userDoc = await admin.firestore().doc(`users/${subscription.userId}`).get();
//       const user = userDoc.data();
      
//       if (user && user.email && user.emailNotifications !== false) {
//         await sendBillingReminderEmail(user.email, subscription);
//       }
//     }
    
//     functions.logger.info(`Sent ${subscriptionsSnapshot.size} billing reminders`);
//   }
// );

// @ts-ignore
async function sendBillingReminderEmail(email: string, subscription: any): Promise<void> {
  const mailOptions: nodemailer.SendMailOptions = {
    from: 'SubScan <noreply@subscan.co>',
    to: email,
    subject: `${subscription.name} bills tomorrow - £${subscription.cost}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Billing Reminder</h2>
        <p>Hi there!</p>
        <p>Just a friendly reminder that your <strong>${subscription.name}</strong> subscription will be charged tomorrow.</p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">Subscription Details:</h3>
          <p><strong>Service:</strong> ${subscription.name}</p>
          <p><strong>Amount:</strong> £${subscription.cost}</p>
          <p><strong>Billing Date:</strong> ${subscription.nextBilling}</p>
          <p><strong>Frequency:</strong> ${subscription.billingCycle}</p>
        </div>
        
        ${subscription.risk === 'high' ? `
          <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
            <h4 style="color: #dc2626; margin: 0 0 10px 0;">Unused Service Alert</h4>
            <p>This subscription hasn't been used in ${subscription.daysSinceUsed} days. Consider canceling to save £${(subscription.billingCycle === 'monthly' ? subscription.cost * 12 : subscription.cost).toFixed(2)}/year.</p>
          </div>
        ` : ''}
        
        <p>Want to manage this subscription? <a href="https://subscan-aedbc.web.app/dashboard" style="color: #1e40af;">Visit your SubScan dashboard</a></p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 14px; color: #6b7280;">
          This email was sent by SubScan. To stop receiving billing reminders, 
          <a href="https://subscan-aedbc.web.app/unsubscribe" style="color: #1e40af;">click here</a>.
        </p>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
}

// UTILITY FUNCTIONS
function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}
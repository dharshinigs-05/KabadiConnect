import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'hi' | 'mr';
export const languageKey = 'kc-language';

const text = {
  en: {
    home: 'Home', lots: 'Lots', create: 'New lot', offers: 'Offers', earnings: 'Earnings', safety: 'Safety', profile: 'Profile',
    hello: 'Hello, collector', createLot: 'Create an e-waste lot', photo: 'Take a photo', material: 'Material', weight: 'Approximate weight (kg)', location: 'Capture location', saved: 'Saved safely', save: 'Save lot on device', sync: 'Sync', pending: 'Waiting to sync', synced: 'Synced', syncing: 'Syncing', failed: 'Sync failed',
    noLots: 'No lots yet.', noOffers: 'No offers yet.', noTransactions: 'No transactions yet.', retry: 'Try again', loading: 'Loading...', accept: 'Accept offer', accepted: 'Offer accepted', pickup: 'Schedule pickup', date: 'Pickup date', time: 'Time window', place: 'Pickup place', note: 'Note (optional)', submit: 'Submit', scheduled: 'Pickup scheduled', estimated: 'Estimated weight', verified: 'Verified weight', history: 'Transaction history', payment: 'Payment', trace: 'Traceability', paid: 'Paid', notPaid: 'Not paid yet', totalEarned: 'Total earned', safetyTitle: 'Work safely', logout: 'Log out', language: 'Language', chooseLanguage: 'Choose language', gpsRequired: 'Current location is required. Please allow location access.', captured: 'Location captured', offerTotal: 'Offered amount', rate: 'Rate per kg', pickupAvailable: 'Pickup available', selfDelivery: 'Self delivery', status: 'Status', created: 'Created', recycler: 'Recycler', reference: 'Reference', noInternet: 'No internet connection. Your saved lot is safe on this device.', sessionExpired: 'Your session has expired. Please sign in again.',
  },
  hi: {
    home: 'होम', lots: 'लॉट', create: 'नया लॉट', offers: 'ऑफ़र', earnings: 'कमाई', safety: 'सुरक्षा', profile: 'प्रोफ़ाइल',
    hello: 'नमस्ते, कलेक्टर', createLot: 'ई-कचरे का लॉट बनाएं', photo: 'फोटो लें', material: 'सामग्री', weight: 'लगभग वजन (किलो)', location: 'लोकेशन लें', saved: 'सुरक्षित सेव हुआ', save: 'डिवाइस पर सेव करें', sync: 'सिंक', pending: 'सिंक होना बाकी', synced: 'सिंक हुआ', syncing: 'सिंक हो रहा है', failed: 'सिंक नहीं हुआ',
    noLots: 'अभी कोई लॉट नहीं है।', noOffers: 'अभी कोई ऑफ़र नहीं है।', noTransactions: 'अभी कोई लेन-देन नहीं है।', retry: 'फिर कोशिश करें', loading: 'लोड हो रहा है...', accept: 'ऑफ़र स्वीकार करें', accepted: 'ऑफ़र स्वीकार हुआ', pickup: 'पिकअप तय करें', date: 'पिकअप तारीख', time: 'समय', place: 'पिकअप जगह', note: 'नोट (वैकल्पिक)', submit: 'जमा करें', scheduled: 'पिकअप तय हुआ', estimated: 'अनुमानित वजन', verified: 'पक्का वजन', history: 'लेन-देन इतिहास', payment: 'भुगतान', trace: 'रिकॉर्ड', paid: 'भुगतान हुआ', notPaid: 'अभी भुगतान नहीं हुआ', totalEarned: 'कुल कमाई', safetyTitle: 'सुरक्षित काम करें', logout: 'लॉग आउट', language: 'भाषा', chooseLanguage: 'भाषा चुनें', gpsRequired: 'वर्तमान लोकेशन जरूरी है। लोकेशन की अनुमति दें।', captured: 'लोकेशन मिल गई', offerTotal: 'ऑफ़र राशि', rate: 'प्रति किलो भाव', pickupAvailable: 'पिकअप उपलब्ध', selfDelivery: 'खुद पहुंचाएं', status: 'स्थिति', created: 'बनाया गया', recycler: 'रीसायकलर', reference: 'रेफरेंस', noInternet: 'इंटरनेट नहीं है। आपका लॉट डिवाइस में सुरक्षित है।', sessionExpired: 'सेशन खत्म हो गया। फिर लॉगिन करें।',
  },
  mr: {
    home: 'मुख्य', lots: 'लॉट', create: 'नवा लॉट', offers: 'ऑफर', earnings: 'कमाई', safety: 'सुरक्षा', profile: 'प्रोफाइल',
    hello: 'नमस्कार, कलेक्टर', createLot: 'ई-कचऱ्याचा लॉट तयार करा', photo: 'फोटो काढा', material: 'साहित्य', weight: 'अंदाजे वजन (किलो)', location: 'लोकेशन घ्या', saved: 'सुरक्षित सेव झाले', save: 'डिव्हाइसवर सेव करा', sync: 'सिंक', pending: 'सिंक बाकी', synced: 'सिंक झाले', syncing: 'सिंक होत आहे', failed: 'सिंक अयशस्वी',
    noLots: 'अजून लॉट नाही.', noOffers: 'अजून ऑफर नाही.', noTransactions: 'अजून व्यवहार नाही.', retry: 'पुन्हा प्रयत्न करा', loading: 'लोड होत आहे...', accept: 'ऑफर स्वीकारा', accepted: 'ऑफर स्वीकारली', pickup: 'पिकअप ठरवा', date: 'पिकअप तारीख', time: 'वेळ', place: 'पिकअप ठिकाण', note: 'नोंद (ऐच्छिक)', submit: 'पाठवा', scheduled: 'पिकअप ठरला', estimated: 'अंदाजे वजन', verified: 'तपासलेले वजन', history: 'व्यवहार इतिहास', payment: 'पेमेंट', trace: 'नोंद', paid: 'पेमेंट झाले', notPaid: 'पेमेंट झालेले नाही', totalEarned: 'एकूण कमाई', safetyTitle: 'सुरक्षित काम करा', logout: 'लॉग आउट', language: 'भाषा', chooseLanguage: 'भाषा निवडा', gpsRequired: 'सध्याचे लोकेशन आवश्यक आहे. लोकेशनची परवानगी द्या.', captured: 'लोकेशन मिळाले', offerTotal: 'ऑफर रक्कम', rate: 'प्रति किलो दर', pickupAvailable: 'पिकअप उपलब्ध', selfDelivery: 'स्वतः पोहोचवा', status: 'स्थिती', created: 'तयार केले', recycler: 'रीसायकलर', reference: 'रेफरन्स', noInternet: 'इंटरनेट नाही. तुमचा लॉट डिव्हाइसवर सुरक्षित आहे.', sessionExpired: 'सेशन संपले. पुन्हा लॉगिन करा.',
  },
} as const;

export type Copy = (typeof text)[Language];
export const copy = (language: Language): Copy => text[language];
export const getLanguage = async (): Promise<Language> => (await AsyncStorage.getItem(languageKey) as Language | null) ?? 'en';
export const setLanguage = (language: Language) => AsyncStorage.setItem(languageKey, language);

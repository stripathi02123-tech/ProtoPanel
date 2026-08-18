export type LanguageCode = "en" | "hi" | "bn" | "fr";

export interface LanguageInfo {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", flag: "🇧🇩" },
  { code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷" }
];

// Core strings for the login / front page. More screens can extend this
// dictionary the same way over time — the key set is the contract, and any
// language missing a key silently falls back to English (see useLanguage.t).
export const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    "login.title": "Login",
    "login.subtitle": "Welcome back — sign in to manage your servers",
    "login.username": "Username",
    "login.password": "Password",
    "login.signIn": "Sign In",
    "login.authenticating": "Authenticating...",
    "login.or": "OR",
    "login.googleSignIn": "Sign in with Google",
    "login.noAccount": "Don't have an account?",
    "login.register": "Register",
    "login.tagline": "Game Server & Workload Control Panel",
    "login.errorGeneric": "Login failed",
    "login.errorGoogleNotConfigured": "Google Login is not configured by the administrator yet.",
    "login.errorGoogleNoEmail": "No email associated with this Google account",
    "login.errorGooglePopupClosed": "Google Login popup was closed before completing.",
    "login.errorGoogleUnauthorizedDomain": "This domain is not authorized in the Firebase console's Auth settings.",
    "login.errorTooManyRequests": "Too many login requests. Please wait a minute and try again.",
    "login.errorGoogleGeneric": "Google Authentication failed. Please check your Firebase configuration.",
    "login.language": "Language"
  },
  hi: {
    "login.title": "लॉग इन करें",
    "login.subtitle": "वापसी पर स्वागत है — अपने सर्वर प्रबंधित करने के लिए साइन इन करें",
    "login.username": "यूज़रनेम",
    "login.password": "पासवर्ड",
    "login.signIn": "साइन इन करें",
    "login.authenticating": "प्रमाणित किया जा रहा है...",
    "login.or": "या",
    "login.googleSignIn": "Google से साइन इन करें",
    "login.noAccount": "खाता नहीं है?",
    "login.register": "रजिस्टर करें",
    "login.tagline": "गेम सर्वर एवं वर्कलोड नियंत्रण पैनल",
    "login.errorGeneric": "लॉगिन विफल रहा",
    "login.errorGoogleNotConfigured": "प्रशासक द्वारा Google लॉगिन अभी कॉन्फ़िगर नहीं किया गया है।",
    "login.errorGoogleNoEmail": "इस Google खाते से कोई ईमेल जुड़ा नहीं है",
    "login.errorGooglePopupClosed": "पूरा होने से पहले Google लॉगिन पॉपअप बंद कर दिया गया।",
    "login.errorGoogleUnauthorizedDomain": "यह डोमेन Firebase कंसोल की Auth सेटिंग्स में अधिकृत नहीं है।",
    "login.errorTooManyRequests": "बहुत अधिक लॉगिन अनुरोध। कृपया एक मिनट प्रतीक्षा करें और पुनः प्रयास करें।",
    "login.errorGoogleGeneric": "Google प्रमाणीकरण विफल रहा। कृपया अपनी Firebase कॉन्फ़िगरेशन जाँचें।",
    "login.language": "भाषा"
  },
  bn: {
    "login.title": "লগ ইন করুন",
    "login.subtitle": "ফিরে আসার জন্য স্বাগতম — আপনার সার্ভার পরিচালনা করতে সাইন ইন করুন",
    "login.username": "ইউজারনেম",
    "login.password": "পাসওয়ার্ড",
    "login.signIn": "সাইন ইন",
    "login.authenticating": "যাচাই করা হচ্ছে...",
    "login.or": "অথবা",
    "login.googleSignIn": "Google দিয়ে সাইন ইন করুন",
    "login.noAccount": "অ্যাকাউন্ট নেই?",
    "login.register": "রেজিস্টার করুন",
    "login.tagline": "গেম সার্ভার ও ওয়ার্কলোড কন্ট্রোল প্যানেল",
    "login.errorGeneric": "লগইন ব্যর্থ হয়েছে",
    "login.errorGoogleNotConfigured": "প্রশাসক এখনও Google লগইন কনফিগার করেননি।",
    "login.errorGoogleNoEmail": "এই Google অ্যাকাউন্টের সাথে কোনো ইমেইল যুক্ত নেই",
    "login.errorGooglePopupClosed": "সম্পন্ন হওয়ার আগেই Google লগইন পপআপ বন্ধ হয়ে গেছে।",
    "login.errorGoogleUnauthorizedDomain": "এই ডোমেইনটি Firebase কনসোলের Auth সেটিংসে অনুমোদিত নয়।",
    "login.errorTooManyRequests": "অনেক বেশি লগইন অনুরোধ। অনুগ্রহ করে এক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।",
    "login.errorGoogleGeneric": "Google প্রমাণীকরণ ব্যর্থ হয়েছে। অনুগ্রহ করে আপনার Firebase কনফিগারেশন পরীক্ষা করুন।",
    "login.language": "ভাষা"
  },
  fr: {
    "login.title": "Connexion",
    "login.subtitle": "Bon retour — connectez-vous pour gérer vos serveurs",
    "login.username": "Nom d'utilisateur",
    "login.password": "Mot de passe",
    "login.signIn": "Se connecter",
    "login.authenticating": "Authentification...",
    "login.or": "OU",
    "login.googleSignIn": "Se connecter avec Google",
    "login.noAccount": "Vous n'avez pas de compte ?",
    "login.register": "S'inscrire",
    "login.tagline": "Panneau de contrôle de serveurs de jeu",
    "login.errorGeneric": "Échec de la connexion",
    "login.errorGoogleNotConfigured": "La connexion Google n'est pas encore configurée par l'administrateur.",
    "login.errorGoogleNoEmail": "Aucun e-mail associé à ce compte Google",
    "login.errorGooglePopupClosed": "La fenêtre de connexion Google a été fermée avant la fin.",
    "login.errorGoogleUnauthorizedDomain": "Ce domaine n'est pas autorisé dans les paramètres Auth de la console Firebase.",
    "login.errorTooManyRequests": "Trop de tentatives de connexion. Veuillez patienter une minute puis réessayer.",
    "login.errorGoogleGeneric": "L'authentification Google a échoué. Veuillez vérifier votre configuration Firebase.",
    "login.language": "Langue"
  }
};

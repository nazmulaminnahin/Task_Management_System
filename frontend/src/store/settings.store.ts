import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type LanguageCode = 'default' | 'en' | 'bn' | 'hi' | 'ru' | 'zh' | 'ar' | 'fr' | 'it' | 'de' | 'es';

interface SettingsState {
  theme: ThemeMode;
  language: LanguageCode;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (lang: LanguageCode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'default',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);

        // Notify mounted components that listen for theme changes.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('themechange'));
          window.dispatchEvent(new StorageEvent('storage', { key: 'taskforge-settings' }));
        }
      },
      setLanguage: (language) => {
        set({ language });

        // Notify mounted components that listen for language changes.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('languagechange'));
          window.dispatchEvent(new StorageEvent('storage', { key: 'taskforge-settings' }));
        }
      },
    }),
    {
      name: 'taskforge-settings',
      onRehydrateStorage: () => (state) => {
        // Apply the persisted theme once settings have loaded from storage.
        if (state && typeof window !== 'undefined') {
          applyTheme(state.theme);
        }
      },
    }
  )
);

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (systemDark) {
      root.classList.add('dark');
    }
  }
}

// Localization dictionary for app UI elements (Dashboard, Navigation, Login)
const TRANSLATIONS: Record<string, Record<LanguageCode, string>> = {
  // Navigation
  'Dashboard': {
    default: 'Dashboard',
    en: 'Dashboard',
    bn: 'ড্যাশবোর্ড',
    hi: 'डैशबोर्ड',
    ru: 'Панель приборов',
    zh: '仪表板',
    ar: 'لوحة القيادة',
    fr: 'Tableau de bord',
    it: 'Dashboard',
    de: 'Dashboard',
    es: 'Tablero',
  },
  'My work': {
    default: 'My work',
    en: 'My work',
    bn: 'আমার কাজ',
    hi: 'मेरा काम',
    ru: 'Моя работа',
    zh: '我的工作',
    ar: 'عملي',
    fr: 'Mon travail',
    it: 'Il mio lavoro',
    de: 'Meine Arbeit',
    es: 'Mi trabajo',
  },
  'Projects': {
    default: 'Projects',
    en: 'Projects',
    bn: 'প্রজেক্টসমূহ',
    hi: 'परियोजनाएं',
    ru: 'Проекты',
    zh: '项目',
    ar: 'المشاريع',
    fr: 'Projets',
    it: 'Progetti',
    de: 'Projekte',
    es: 'Proyectos',
  },
  'Calendar': {
    default: 'Calendar',
    en: 'Calendar',
    bn: 'ক্যালেন্ডার',
    hi: 'कैलेंडर',
    ru: 'Календарь',
    zh: '日历',
    ar: 'التقويم',
    fr: 'Calendrier',
    it: 'Calendario',
    de: 'Kalender',
    es: 'Calendario',
  },
  // Administration
  'Administration': {
    default: 'Administration',
    en: 'Administration',
    bn: 'প্রশাসন',
    hi: 'प्रशासन',
    ru: 'Администрирование',
    zh: '管理',
    ar: 'الإدارة',
    fr: 'Administration',
    it: 'Amministrazione',
    de: 'Verwaltung',
    es: 'Administración',
  },
  'Users & roles': {
    default: 'Users & roles',
    en: 'Users & roles',
    bn: 'ব্যবহারকারী ও রোল',
    hi: 'उपयोगकर्ता और भूमिकाएँ',
    ru: 'Пользователи и роли',
    zh: '用户与角色',
    ar: 'المستخدمون والأدوار',
    fr: 'Utilisateurs et rôles',
    it: 'Utenti e ruoli',
    de: 'Benutzer & Rollen',
    es: 'Usuarios y roles',
  },
  'Audit log': {
    default: 'Audit log',
    en: 'Audit log',
    bn: 'অডিট লগ',
    hi: 'ऑडिट लॉग',
    ru: 'Журнал аудита',
    zh: '审计日志',
    ar: 'سجل التدقيق',
    fr: 'Journal d’audit',
    it: 'Log di audit',
    de: 'Audit-Protokoll',
    es: 'Registro de auditoría',
  },
  'Platform analytics': {
    default: 'Platform analytics',
    en: 'Platform analytics',
    bn: 'প্ল্যাটফর্ম অ্যানালিটিক্স',
    hi: 'प्लेटफ़ॉर्म एनालिटिक्स',
    ru: 'Аналитика платформы',
    zh: '平台分析',
    ar: 'تحليلات المنصة',
    fr: 'Analyses de la plate-forme',
    it: 'Analisi della piattaforma',
    de: 'Plattform-Analytik',
    es: 'Análisis de la plataforma',
  },
  // Headers & metrics
  'Platform overview': {
    default: 'Platform overview',
    en: 'Platform overview',
    bn: 'প্ল্যাটফর্ম ওভারভিউ',
    hi: 'प्लेटफ़ॉर्म अवलोकन',
    ru: 'Обзор платформы',
    zh: '平台概览',
    ar: 'نظرة عامة على المنصة',
    fr: 'Aperçu de la plate-forme',
    it: 'Panoramica della piattaforma',
    de: 'Plattformübersicht',
    es: 'Resumen de la plataforma',
  },
  'System-wide activity, adoption and health across every workspace.': {
    default: 'System-wide activity, adoption and health across every workspace.',
    en: 'System-wide activity, adoption and health across every workspace.',
    bn: 'প্রতিটি ওয়ার্কস্পেসে সিস্টেমব্যাপী কার্যকলাপ, গ্রহণ এবং স্বাস্থ্য।',
    hi: 'हर कार्यक्षेत्र में सिस्टम-व्यापी गतिविधि, अपनाना और स्वास्थ्य।',
    ru: 'Общесистемная активность, внедрение и работоспособность во всех рабочих пространствах.',
    zh: '各个工作区的全系统活动、采用率和运行状况。',
    ar: 'النشاط على مستوى النظام، والاعتماد، والصحة عبر كل مساحة عمل.',
    fr: 'Activité, adoption et santé à l’échelle du système dans chaque espace de travail.',
    it: 'Attività, adozione e stato di salute a livello di sistema in ogni spazio di lavoro.',
    de: 'Systemweite Aktivität, Einführung und Integrität in jedem Arbeitsbereich.',
    es: 'Actividad, adopción y salud en todo el sistema en cada espacio de trabajo.',
  },
  'Total users': {
    default: 'Total users',
    en: 'Total users',
    bn: 'মোট ব্যবহারকারী',
    hi: 'कुल उपयोगकर्ता',
    ru: 'Всего пользователей',
    zh: '总用户数',
    ar: 'إجمالي المستخدمين',
    fr: 'Utilisateurs totaux',
    it: 'Utenti totali',
    de: 'Gesamtbenutzer',
    es: 'Usuarios totales',
  },
  'Tasks': {
    default: 'Tasks',
    en: 'Tasks',
    bn: 'টাস্কসমূহ',
    hi: 'कार्य',
    ru: 'Задачи',
    zh: '任务',
    ar: 'المهام',
    fr: 'Tâches',
    it: 'Attività',
    de: 'Aufgaben',
    es: 'Tareas',
  },
  'Completion rate': {
    default: 'Completion rate',
    en: 'Completion rate',
    bn: 'সম্পন্নতার হার',
    hi: 'पूर्णता दर',
    ru: 'Процент выполнения',
    zh: '完成率',
    ar: 'معدل الإكمال',
    fr: 'Taux de réalisation',
    it: 'Tasso di completamento',
    de: 'Abschlussrate',
    es: 'Tasa de finalización',
  },
  'Signups (30d)': {
    default: 'Signups (30d)',
    en: 'Signups (30d)',
    bn: 'সাইনআপ (৩০ দিন)',
    hi: 'साइन अप (30 दिन)',
    ru: 'Регистрации (30д)',
    zh: '注册 (30天)',
    ar: 'التسجيلات (30 يوم)',
    fr: 'Inscriptions (30j)',
    it: 'Registrazioni (30g)',
    de: 'Anmeldungen (30T)',
    es: 'Registros (30d)',
  },
  'Signups & logins': {
    default: 'Signups & logins',
    en: 'Signups & logins',
    bn: 'সাইনআপ ও লগইন',
    hi: 'साइन अप और लॉगिन',
    ru: 'Регистрации и входы',
    zh: '注册与登录',
    ar: 'التسجيلات وتسجيل الدخول',
    fr: 'Inscriptions et connexions',
    it: 'Registrazioni e accessi',
    de: 'Anmeldungen & Logins',
    es: 'Registros e inicios de sesión',
  },
  'Role distribution': {
    default: 'Role distribution',
    en: 'Role distribution',
    bn: 'রোল বিতরণ',
    hi: 'भूमिका वितरण',
    ru: 'Распределение ролей',
    zh: '角色分布',
    ar: 'توزيع الأدوار',
    fr: 'Distribution des rôles',
    it: 'Distribuzione dei ruoli',
    de: 'Rollenverteilung',
    es: 'Distribución de roles',
  },
  'Largest projects': {
    default: 'Largest projects',
    en: 'Largest projects',
    bn: 'বৃহত্তম প্রজেক্টসমূহ',
    hi: 'सबसे बड़ी परियोजनाएं',
    ru: 'Крупнейшие проекты',
    zh: '最大项目',
    ar: 'أكبر المشاريع',
    fr: 'Plus grands projets',
    it: 'Progetti più grandi',
    de: 'Größte Projekte',
    es: 'Proyectos más grandes',
  },
  'Workload watch': {
    default: 'Workload watch',
    en: 'Workload watch',
    bn: 'ওয়ার্কলোড ওয়াচ',
    hi: 'वर्कलोड वॉच',
    ru: 'Контроль нагрузки',
    zh: '工作量监视',
    ar: 'مراقبة عبء العمل',
    fr: 'Suivi de la charge de travail',
    it: 'Monitoraggio del carico di lavoro',
    de: 'Arbeitslastüberwachung',
    es: 'Control de carga de trabajo',
  },
  'Search tasks, projects…': {
    default: 'Search tasks, projects…',
    en: 'Search tasks, projects…',
    bn: 'টাস্ক, প্রজেক্ট খুঁজুন...',
    hi: 'कार्य, परियोजनाएं खोजें...',
    ru: 'Поиск задач, проектов...',
    zh: '搜索任务、项目...',
    ar: 'بحث عن المهام والمشاريع...',
    fr: 'Rechercher des tâches, projets...',
    it: 'Cerca attività, progetti...',
    de: 'Aufgaben, Projekte suchen...',
    es: 'Buscar tareas, proyectos...',
  },
  'Collapse': {
    default: 'Collapse',
    en: 'Collapse',
    bn: 'সংকুচিত করুন',
    hi: 'छोटा करें',
    ru: 'Свернуть',
    zh: '折叠',
    ar: 'طي',
    fr: 'Réduire',
    it: 'Comprimi',
    de: 'Einklappen',
    es: 'Contraer',
  },
  'Welcome back': {
    default: 'Welcome back',
    en: 'Welcome back',
    bn: 'স্বাগতম ফিরে আসার জন্য',
    hi: 'वापसी पर स्वागत है',
    ru: 'С возвращением',
    zh: '欢迎回来',
    ar: 'مرحباً بك مجدداً',
    fr: 'Bon retour',
    it: 'Bentornato',
    de: 'Willkommen zurück',
    es: 'Bienvenido de nuevo',
  },
  'Sign in to your workspace to continue.': {
    default: 'Sign in to your workspace to continue.',
    en: 'Sign in to your workspace to continue.',
    bn: 'চালিয়ে যেতে আপনার ওয়ার্কস্পেসে সাইন ইন করুন।',
    hi: 'जारी रखने ਲਈ ਆਪਣੇ कार्यक्षेत्र में साइन इन करें।',
    ru: 'Войдите в рабочее пространство, чтобы продолжить.',
    zh: '登录您的工作区以继续。',
    ar: 'تسجيل الدخول إلى مساحة العمل الخاصة بك للمتابعة.',
    fr: 'Connectez-vous à votre espace de travail pour continuer.',
    it: 'Accedi al tuo spazio di lavoro per continuare.',
    de: 'Melden Sie sich in Ihrem Arbeitsbereich an, um fortzufahren.',
    es: 'Inicia sesión en tu espacio de trabajo para continuar.',
  },
  'WORK EMAIL': {
    default: 'WORK EMAIL',
    en: 'WORK EMAIL',
    bn: 'ওয়ার্ক ইমেল',
    hi: 'कार्य ईमेल',
    ru: 'РАБОЧИЙ EMAIL',
    zh: '工作邮箱',
    ar: 'البريد الإلكتروني للعمل',
    fr: 'E-MAIL PROFESSIONNEL',
    it: 'EMAIL LAVORATIVA',
    de: 'GESCHÄFTS-E-MAIL',
    es: 'CORREO ELECTRÓNICO DE TRABAJO',
  },
  'PASSWORD': {
    default: 'PASSWORD',
    en: 'PASSWORD',
    bn: 'পাসওয়ার্ড',
    hi: 'पासवर्ड',
    ru: 'ПАРОЛЬ',
    zh: '密码',
    ar: 'كلمة المرور',
    fr: 'MOT DE PASSE',
    it: 'PASSWORD',
    de: 'PASSWORT',
    es: 'CONTRASEÑA',
  },
  'Sign in': {
    default: 'Sign in',
    en: 'Sign in',
    bn: 'সাইন ইন করুন',
    hi: 'साइन इन करें',
    ru: 'Войти',
    zh: '登录',
    ar: 'تسجيل الدخول',
    fr: 'Se connecter',
    it: 'Accedi',
    de: 'Anmelden',
    es: 'Iniciar sesión',
  },
  'Create account': {
    default: 'Create account',
    en: 'Create account',
    bn: 'অ্যাকাউন্ট তৈরি করুন',
    hi: 'खाता बनाएँ',
    ru: 'Создать аккаунт',
    zh: '创建账户',
    ar: 'إنشاء حساب',
    fr: 'Créer un compte',
    it: 'Crea account',
    de: 'Konto erstellen',
    es: 'Crear cuenta',
  },
  'Accounts': {
    default: 'Accounts',
    en: 'Accounts',
    bn: 'অ্যাকাউন্টসমূহ',
    hi: 'खाते',
    ru: 'Аккаунты',
    zh: '账户',
    ar: 'الحسابات',
    fr: 'Comptes',
    it: 'Account',
    de: 'Konten',
    es: 'Cuentas',
  },
};

export function t(key: string, lang: LanguageCode): string {
  if (lang === 'default' || !TRANSLATIONS[key]) return key;
  return TRANSLATIONS[key][lang] || TRANSLATIONS[key]['en'] || key;
}
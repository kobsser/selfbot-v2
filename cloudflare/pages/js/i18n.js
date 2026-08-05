(function() {
  const LANG_KEY = 'sb_lang';

  const translations = {
    en: {
      'login.title': 'Login',
      'login.password': 'Password',
      'login.confirm_password': 'Confirm Password',
      'login.submit': 'Login',
      'login.setup': 'Create Account',
      'login.new_account': 'New Account',
      'login.existing': 'Returning User',
      'dashboard.title': 'Dashboard',
      'dashboard.logout': 'Logout',
      'dashboard.add_account': 'Add Account',
      'dashboard.phone': 'Phone Number',
      'dashboard.display_name': 'Display Name',
      'dashboard.session_string': 'Session String',
      'dashboard.session_hint': 'The session string will be encrypted before storage.',
      'dashboard.settings': 'Settings',
      'dashboard.features': 'Features',
      'dashboard.groups': 'Selected Groups',
      'dashboard.timing': 'Timing',
      'dashboard.meow_interval': 'Meow Interval (seconds)',
      'dashboard.delete_account': 'Delete Account',
      'game.meow': 'Meow',
      'game.pishi': 'Pishi',
      'game.smuggle': 'Smuggle',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.active': 'Active',
      'common.inactive': 'Inactive',
      'common.accounts': 'accounts'
    },
    fa: {
      'login.title': 'ورود',
      'login.password': 'رمز عبور',
      'login.confirm_password': 'تایید رمز عبور',
      'login.submit': 'ورود',
      'login.setup': 'ساخت حساب',
      'login.new_account': 'حساب جدید',
      'login.existing': 'کاربر قدیمی',
      'dashboard.title': 'داشبورد',
      'dashboard.logout': 'خروج',
      'dashboard.add_account': 'افزودن حساب',
      'dashboard.phone': 'شماره تلفن',
      'dashboard.display_name': 'نام نمایشی',
      'dashboard.session_string': 'رشته نشست',
      'dashboard.session_hint': 'رشته نشست قبل از ذخیره رمزنگاری می\u200cشود.',
      'dashboard.settings': 'تنظیمات',
      'dashboard.features': 'قابلیت‌ها',
      'dashboard.groups': 'گروه‌های انتخاب شده',
      'dashboard.timing': 'زمان‌بندی',
      'dashboard.meow_interval': 'فاصله میو (ثانیه)',
      'dashboard.delete_account': 'حذف حساب',
      'game.meow': 'میو',
      'game.pishi': 'پیشی',
      'game.smuggle': 'قاچاق',
      'common.cancel': 'انصراف',
      'common.save': 'ذخیره',
      'common.active': 'فعال',
      'common.inactive': 'غیرفعال',
      'common.accounts': 'حساب'
    }
  };

  function getLang() {
    return localStorage.getItem(LANG_KEY) || 'en';
  }

  function setLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
    applyTranslations();
    document.documentElement.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  }

  function t(key) {
    const lang = getLang();
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
  }

  function toggleLang() {
    setLang(getLang() === 'en' ? 'fa' : 'en');
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    document.documentElement.setAttribute('dir', getLang() === 'fa' ? 'rtl' : 'ltr');
    document.querySelectorAll('#langToggle').forEach(btn => {
      btn.addEventListener('click', toggleLang);
    });
  });

  window.i18n = { t, getLang, setLang, toggleLang, applyTranslations };
})();
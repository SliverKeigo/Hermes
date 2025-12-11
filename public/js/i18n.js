class I18n {
    constructor() {
        this.supportedLocales = ['zh-CN', 'zh-TW', 'en-US'];
        this.locale = localStorage.getItem('hermes_locale') || navigator.language || 'zh-CN';

        // Normalize locale (e.g., 'zh-HK' -> 'zh-TW', 'en-GB' -> 'en-US')
        if (!this.supportedLocales.includes(this.locale)) {
            if (this.locale.startsWith('zh')) {
                // If it's Traditional Chinese (TW, HK, MO), fallback to zh-TW, else zh-CN
                if (['zh-TW', 'zh-HK', 'zh-MO'].includes(this.locale)) this.locale = 'zh-TW';
                else this.locale = 'zh-CN';
            } else if (this.locale.startsWith('en')) {
                this.locale = 'en-US';
            } else {
                this.locale = 'zh-CN'; // Default fallback
            }
        }

        this.translations = {};
    }

    async init() {
        await this.loadTranslations(this.locale);
        this.updatePage();
        this.renderLanguageSwitcher();
    }

    async loadTranslations(locale) {
        try {
            const res = await fetch(`/locales/${locale}.json`);
            this.translations = await res.json();
        } catch (e) {
            console.error(`Failed to load translations for ${locale}`, e);
        }
    }

    t(key) {
        const keys = key.split('.');
        let value = this.translations;
        for (const k of keys) {
            value = value?.[k];
        }
        return value || key;
    }

    updatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const target = el.getAttribute('data-i18n-target') || 'text'; // 'text', 'placeholder', 'title'
            const value = this.t(key);

            if (target === 'text') {
                el.innerText = value;
            } else if (target === 'placeholder') {
                el.placeholder = value;
            } else if (target === 'title') {
                el.title = value;
            }
        });
    }

    setLocale(locale) {
        this.locale = locale;
        localStorage.setItem('hermes_locale', locale);
        this.init(); // Reload
    }

    renderLanguageSwitcher() {
        const container = document.getElementById('lang-switcher');
        if (!container) return;

        container.innerHTML = `
            <select onchange="window.i18n.setLocale(this.value)" class="bg-transparent text-sm border-none focus:ring-0 cursor-pointer text-gray-500 hover:text-gray-700">
                <option value="zh-CN" ${this.locale === 'zh-CN' ? 'selected' : ''}>简体中文</option>
                <option value="zh-TW" ${this.locale === 'zh-TW' ? 'selected' : ''}>繁體中文</option>
                <option value="en-US" ${this.locale === 'en-US' ? 'selected' : ''}>English</option>
            </select>
        `;
    }
}

window.i18n = new I18n();
document.addEventListener('DOMContentLoaded', () => window.i18n.init());

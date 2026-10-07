// Carregado no <head> para aplicar o tema antes da página aparecer (evita "piscar" claro)
const THEME_KEY = 'theme';

function getSavedTheme() {
    try {
        return localStorage.getItem(THEME_KEY);
    } catch (error) {
        return null;
    }
}

function getTheme() {
    return document.documentElement.dataset.theme;
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
    const theme = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
        // Sem localStorage o tema só não fica salvo
    }
    document.dispatchEvent(new CustomEvent('themechange'));
}

applyTheme(getSavedTheme() ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

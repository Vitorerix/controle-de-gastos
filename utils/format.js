function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Número sem o "R$": 1234.5 -> "1.234,50"
function formatAmount(value) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

// Texto do campo com máscara -> número: "1.234,50" -> 1234.5 (vazio vira 0)
function parseAmount(text) {
    return Number(String(text).replace(/\./g, '').replace(',', '.')) || 0;
}

// Máscara de moeda: os dígitos entram pela direita, como numa maquininha.
// Digitar 1, 2, 3, 4, 5, 6 mostra 0,01 → 0,12 → 1,23 → 12,34 → 123,45 → 1.234,56
function maskCurrency(input) {
    const digits = input.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
    input.value = digits ? formatAmount(Number(digits) / 100) : '';
}

// Qualquer campo com o atributo data-currency recebe a máscara.
// Fase de captura: a máscara roda antes do oninput do próprio campo.
document.addEventListener('input', event => {
    if (event.target.matches('[data-currency]')) {
        maskCurrency(event.target);
    }
}, true);

// Recebe "2026-10-07" (valor do input date) e devolve "07/10/2026"
function formatDate(date) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

// Recebe "2026-10" e devolve "Outubro de 2026"
function formatMonth(month) {
    const [year, monthNumber] = month.split('-');
    const text = new Date(year, monthNumber - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
}

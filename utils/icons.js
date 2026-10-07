// Ícones da biblioteca Lucide (https://lucide.dev), carregados pelo CDN
const ICON_BASE_URL = 'https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/';

const PRESET_ICONS = [
    { name: 'utensils', label: 'Restaurante' },
    { name: 'shopping-cart', label: 'Mercado' },
    { name: 'coffee', label: 'Café' },
    { name: 'car', label: 'Carro' },
    { name: 'bus', label: 'Ônibus' },
    { name: 'fuel', label: 'Combustível' },
    { name: 'plane', label: 'Viagem' },
    { name: 'house', label: 'Casa' },
    { name: 'zap', label: 'Energia' },
    { name: 'droplets', label: 'Água' },
    { name: 'wifi', label: 'Internet' },
    { name: 'smartphone', label: 'Celular' },
    { name: 'heart-pulse', label: 'Saúde' },
    { name: 'pill', label: 'Farmácia' },
    { name: 'dumbbell', label: 'Academia' },
    { name: 'graduation-cap', label: 'Estudos' },
    { name: 'book-open', label: 'Livros' },
    { name: 'gamepad-2', label: 'Jogos' },
    { name: 'film', label: 'Cinema' },
    { name: 'music', label: 'Música' },
    { name: 'shirt', label: 'Roupas' },
    { name: 'gift', label: 'Presentes' },
    { name: 'dog', label: 'Pet' },
    { name: 'baby', label: 'Filhos' },
    { name: 'wrench', label: 'Manutenção' },
    { name: 'receipt', label: 'Contas' },
    { name: 'credit-card', label: 'Cartão' },
    { name: 'landmark', label: 'Banco' },
    { name: 'wallet', label: 'Salário' },
    { name: 'banknote', label: 'Dinheiro' },
    { name: 'piggy-bank', label: 'Poupança' },
    { name: 'trending-up', label: 'Investimentos' },
    { name: 'briefcase', label: 'Trabalho' },
    { name: 'tag', label: 'Outros' }
];

function iconUrl(name) {
    return `${ICON_BASE_URL}${name}.svg`;
}

// Monta o círculo colorido com a imagem da categoria (ícone da galeria ou foto enviada)
function createCategoryIcon(category, size = '') {
    const wrapper = document.createElement('span');
    wrapper.className = `category-icon ${size}`.trim();
    wrapper.style.backgroundColor = category.color;
    wrapper.title = category.name;

    if (category.imageType === 'photo') {
        wrapper.classList.add('photo');
        wrapper.style.backgroundImage = `url("${category.image}")`;
    } else {
        const glyph = document.createElement('span');
        glyph.className = 'icon-glyph';
        glyph.style.setProperty('--icon', `url("${iconUrl(category.image || 'tag')}")`);
        wrapper.appendChild(glyph);
    }
    return wrapper;
}

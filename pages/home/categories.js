// Categorias: seleção no formulário, painel de orçamentos e janela de criar/editar

const UNCATEGORIZED = { name: 'Sem categoria', imageType: 'icon', image: 'tag', color: '#757575' };
const UPLOAD_IMAGE_SIZE = 96;

// Categoria sendo criada/editada na janela
let categoryDraft = null;

function findCategory(id) {
    return state.categories.find(category => category.id === id) || UNCATEGORIZED;
}

function getSortedCategories() {
    return [...state.categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function renderCategoryOptions() {
    const categories = getSortedCategories();
    fillSelect(categoryPage.select(), categories);
    fillSelect(categoryPage.filter(), [{ id: '', name: 'Todas as categorias' }, ...categories]);
    renderSelectedCategoryIcon();
}

function fillSelect(select, categories) {
    const selected = select.value;
    select.innerHTML = '';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });
    if (categories.some(category => category.id === selected)) {
        select.value = selected;
    }
}

function renderSelectedCategoryIcon() {
    const holder = categoryPage.selectedIcon();
    holder.innerHTML = '';
    holder.appendChild(createCategoryIcon(findCategory(categoryPage.select().value)));
}

function getMonthSpentByCategory(categoryId) {
    return getMonthTransactions()
        .filter(transaction => transaction.type === 'expense' && transaction.categoryId === categoryId)
        .reduce((total, transaction) => total + transaction.value, 0);
}

function renderCategoriesPanel() {
    const list = categoryPage.list();
    list.innerHTML = '';

    getSortedCategories().forEach(category => {
        const spent = getMonthSpentByCategory(category.id);
        const item = document.createElement('li');
        item.className = 'budget-item';
        item.innerHTML = `
            <div class="budget-info">
                <div class="budget-title"><strong></strong><span class="budget-status"></span></div>
                <small class="muted"></small>
            </div>
            <button type="button" class="clear row-action" title="Editar categoria" aria-label="Editar categoria"><svg class="icon"><use href="#i-pencil"/></svg></button>
        `;
        item.prepend(createCategoryIcon(category));
        item.querySelector('strong').textContent = category.name;
        item.querySelector('button').onclick = () => openCategoryDialog(category.id);

        const details = item.querySelector('small');
        if (category.budget) {
            const percent = spent / category.budget * 100;
            const status = percent > 100 ? 'over' : percent >= 80 ? 'warning' : 'ok';
            const statusLabel = { over: '⚠️ Limite estourado', warning: '⚠️ Perto do limite', ok: '' }[status];

            item.querySelector('.budget-status').textContent = statusLabel;
            item.querySelector('.budget-status').className = `budget-status ${status}`;
            details.textContent = `${formatCurrency(spent)} de ${formatCurrency(category.budget)} (${Math.round(percent)}%)`;
            details.insertAdjacentHTML('beforebegin',
                `<div class="progress"><div class="progress-bar ${status}" style="width: ${Math.min(percent, 100)}%"></div></div>`);
        } else {
            details.textContent = `Sem limite · ${formatCurrency(spent)} gastos no mês`;
        }

        list.appendChild(item);
    });
}

function openCategoryDialog(id) {
    const category = id ? findCategory(id) : null;
    categoryDraft = category
        ? { id: category.id, imageType: category.imageType, image: category.image }
        : { id: null, imageType: 'icon', image: 'tag' };

    categoryPage.title().textContent = category ? 'Editar categoria' : 'Nova categoria';
    categoryPage.name().value = category ? category.name : '';
    categoryPage.color().value = category ? category.color : '#2a7566';
    categoryPage.budget().value = category && category.budget ? formatAmount(category.budget) : '';
    categoryPage.deleteButton().style.display = category ? 'block' : 'none';
    categoryPage.error().style.display = 'none';

    renderIconGallery();
    renderCategoryPreview();
    categoryPage.dialog().showModal();
}

function closeCategoryDialog() {
    categoryPage.dialog().close();
}

function renderIconGallery() {
    const gallery = categoryPage.gallery();
    gallery.innerHTML = '';

    PRESET_ICONS.forEach(icon => {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = icon.label;
        button.className = 'icon-option';
        button.classList.toggle('selected', categoryDraft.imageType === 'icon' && categoryDraft.image === icon.name);
        button.appendChild(createCategoryIcon({ name: icon.label, imageType: 'icon', image: icon.name, color: categoryPage.color().value }));
        button.onclick = () => selectCategoryImage('icon', icon.name);
        gallery.appendChild(button);
    });
}

function selectCategoryImage(imageType, image) {
    categoryDraft.imageType = imageType;
    categoryDraft.image = image;
    renderIconGallery();
    renderCategoryPreview();
}

function renderCategoryPreview() {
    const preview = categoryPage.preview();
    preview.innerHTML = '';
    preview.appendChild(createCategoryIcon({
        name: categoryPage.name().value,
        imageType: categoryDraft.imageType,
        image: categoryDraft.image,
        color: categoryPage.color().value
    }, 'big'));

    // A cor escolhida também aparece nos ícones da galeria
    categoryPage.gallery().querySelectorAll('.category-icon').forEach(icon => {
        icon.style.backgroundColor = categoryPage.color().value;
    });
}

function onUploadCategoryImage(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) {
        return;
    }
    if (!file.type.startsWith('image/')) {
        return showCategoryError('Escolha um arquivo de imagem');
    }
    if (file.size > MAX_UPLOAD_SIZE) {
        return showCategoryError('A imagem deve ter no máximo 5 MB');
    }

    resizeImage(file, UPLOAD_IMAGE_SIZE)
        .then(dataUrl => {
            categoryPage.error().style.display = 'none';
            selectCategoryImage('photo', dataUrl);
        })
        .catch(() => showCategoryError('Não foi possível ler essa imagem'));
}

async function saveCategory(event) {
    event.preventDefault();
    const name = categoryPage.name().value.trim();
    const budget = parseAmount(categoryPage.budget().value);

    if (!name) {
        return showCategoryError('Informe o nome da categoria');
    }
    if (state.categories.some(category =>
        category.id !== categoryDraft.id && category.name.toLowerCase() === name.toLowerCase())) {
        return showCategoryError('Essa categoria já existe');
    }
    if (budget < 0) {
        return showCategoryError('O limite não pode ser negativo');
    }

    const category = {
        id: categoryDraft.id || createId(),
        name,
        imageType: categoryDraft.imageType,
        image: categoryDraft.image,
        color: categoryPage.color().value,
        budget: budget || null
    };

    categoryPage.saveButton().disabled = true;
    try {
        await saveItem('categories', category);
    } catch (error) {
        return showCategoryError('Não foi possível salvar. Tente novamente.');
    } finally {
        categoryPage.saveButton().disabled = false;
    }

    state.categories = state.categories.filter(item => item.id !== category.id);
    state.categories.push(category);
    closeCategoryDialog();
    render();

    // Categoria nova já fica selecionada no formulário de transação
    if (!categoryDraft.id) {
        categoryPage.select().value = category.id;
        renderSelectedCategoryIcon();
    }
}

async function deleteCategory() {
    if (state.categories.length === 1) {
        return showCategoryError('É preciso ter pelo menos uma categoria');
    }
    const category = findCategory(categoryDraft.id);
    if (!confirm(`Excluir a categoria "${category.name}"? As transações dela ficarão como "Sem categoria".`)) {
        return;
    }
    try {
        await removeItem('categories', category.id);
    } catch (error) {
        return showCategoryError('Não foi possível excluir. Tente novamente.');
    }
    state.categories = state.categories.filter(item => item.id !== category.id);
    closeCategoryDialog();
    render();
}

function showCategoryError(message) {
    categoryPage.error().textContent = message;
    categoryPage.error().style.display = 'block';
}

const categoryPage = {
    select: () => document.getElementById('category'),
    filter: () => document.getElementById('filter-category'),
    selectedIcon: () => document.getElementById('selected-category-icon'),
    list: () => document.getElementById('categories-list'),
    dialog: () => document.getElementById('category-dialog'),
    title: () => document.getElementById('category-dialog-title'),
    preview: () => document.getElementById('category-preview'),
    name: () => document.getElementById('category-name'),
    gallery: () => document.getElementById('icon-gallery'),
    color: () => document.getElementById('category-color'),
    budget: () => document.getElementById('category-budget'),
    error: () => document.getElementById('category-error'),
    deleteButton: () => document.getElementById('delete-category-button'),
    saveButton: () => document.getElementById('save-category-button')
}

// Exportar (CSV e JSON) e importar dados

const CSV_HEADER = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Forma de pagamento'];
const TYPE_LABELS = { income: 'Receita', expense: 'Despesa' };

function downloadFile(content, fileName, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

function backupFileName(extension) {
    const account = getActiveAccount().name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    return `controle-${account}-${today()}.${extension}`;
}

// CSV ------------------------------------------------------------------------

// Ponto e vírgula + vírgula decimal é o formato que o Excel em português abre direto
function toCsvField(value) {
    const text = String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
    const rows = [...state.transactions]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(transaction => [
            formatDate(transaction.date),
            TYPE_LABELS[transaction.type],
            findCategory(transaction.categoryId).name,
            transaction.description,
            transaction.value.toFixed(2).replace('.', ','),
            transaction.paymentMethod || ''
        ]);

    const csv = [CSV_HEADER, ...rows].map(row => row.map(toCsvField).join(';')).join('\r\n');
    // O "﻿" (BOM) faz o Excel reconhecer os acentos
    downloadFile('﻿' + csv, backupFileName('csv'), 'text/csv;charset=utf-8');
    showBackupMessage(`Planilha exportada com ${rows.length} transações.`);
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    // Planilhas em português usam ";"; as em inglês, ","
    const delimiter = text.split('\n')[0].includes(';') ? ';' : ',';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === delimiter) {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') {
                i++;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(cells => cells.some(cell => cell.trim()));
}

// "07/10/2026" -> "2026-10-07"; também aceita "2026-10-07"
function parseCsvDate(text) {
    const value = text.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

// Aceita "1.234,56", "1234,56" e "1234.56"
function parseCsvValue(text) {
    const value = text.replace(/[R$\s]/g, '');
    const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
    return Math.abs(Number(normalized));
}

function parseCsvType(text, rawValue) {
    const type = text.trim().toLowerCase();
    if (type.startsWith('rec') || type === 'income' || type === 'entrada') {
        return 'income';
    }
    if (type.startsWith('desp') || type === 'expense' || type.startsWith('sa')) {
        return 'expense';
    }
    // Sem tipo: valor negativo é despesa
    return rawValue.trim().startsWith('-') ? 'expense' : 'income';
}

function readCsvTransactions(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (!rows.length) {
        throw new Error('A planilha está vazia.');
    }
    const header = rows.shift().map(cell => cell.trim().toLowerCase());
    const column = name => header.findIndex(cell => cell.startsWith(name));
    const columns = {
        date: column('data'),
        type: column('tipo'),
        category: column('categ'),
        description: column('descr'),
        value: column('valor'),
        payment: header.findIndex(cell => cell.includes('pagamento'))
    };
    if (columns.date < 0 || columns.value < 0) {
        throw new Error('A planilha precisa ter pelo menos as colunas "Data" e "Valor".');
    }

    const newCategories = [];
    const transactions = [];
    const errors = [];
    let duplicates = 0;

    // A planilha não tem identificador, então uma linha igual a uma transação existente
    // (mesma data, tipo, valor, categoria e descrição) é tratada como repetida.
    // Conta quantas existem de cada, para não descartar duas compras iguais legítimas.
    const existing = {};
    state.transactions.forEach(transaction => {
        const key = transactionKey(transaction);
        existing[key] = (existing[key] || 0) + 1;
    });

    rows.forEach((row, index) => {
        const date = parseCsvDate(row[columns.date] || '');
        const rawValue = row[columns.value] || '';
        const value = parseCsvValue(rawValue);
        if (!date || !(value > 0)) {
            errors.push(index + 2);
            return;
        }

        const categoryName = (row[columns.category] || '').trim() || 'Outros';
        let category = [...state.categories, ...newCategories]
            .find(item => item.name.toLowerCase() === categoryName.toLowerCase());
        if (!category) {
            category = { id: createId(), name: categoryName, imageType: 'icon', image: 'tag', color: '#757575', budget: null };
            newCategories.push(category);
        }

        const transaction = {
            id: createId(),
            type: parseCsvType(row[columns.type] || '', rawValue),
            value,
            date,
            categoryId: category.id,
            paymentMethod: (row[columns.payment] || '').trim() || null,
            description: (row[columns.description] || '').trim()
        };

        const key = transactionKey(transaction);
        if (existing[key]) {
            existing[key]--;
            duplicates++;
            return;
        }
        transactions.push(transaction);
    });

    // Só cria as categorias novas que alguma transação importada usa
    const usedCategories = newCategories.filter(category =>
        transactions.some(transaction => transaction.categoryId === category.id));

    return { transactions, categories: usedCategories, goals: [], clients: [], errors, duplicates };
}

function transactionKey(transaction) {
    return [transaction.date, transaction.type, transaction.value.toFixed(2),
        transaction.categoryId, transaction.description].join('|');
}

function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

// JSON -----------------------------------------------------------------------

function exportJson() {
    const backup = {
        app: 'controle-de-gastos',
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions: state.transactions,
        categories: state.categories,
        goals: state.goals,
        clients: state.clients || []
    };
    downloadFile(JSON.stringify(backup, null, 2), backupFileName('json'), 'application/json');
    showBackupMessage('Backup exportado.');
}

function readJsonBackup(text) {
    const backup = JSON.parse(text);
    if (backup.app !== 'controle-de-gastos' || !Array.isArray(backup.transactions)) {
        throw new Error('Este arquivo não é um backup do Controle de gastos.');
    }

    const isValidTransaction = item => item && item.id &&
        (item.type === 'income' || item.type === 'expense') &&
        typeof item.value === 'number' && item.value > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date);

    return {
        transactions: backup.transactions.filter(isValidTransaction)
            .map(item => ({ ...item, description: String(item.description || '') })),
        categories: (backup.categories || []).filter(item => item && item.id && item.name),
        goals: (backup.goals || []).filter(item => item && item.id && item.name && item.target > 0),
        clients: (backup.clients || []).filter(item => item && item.id && item.name),
        errors: []
    };
}

// Importar -------------------------------------------------------------------

async function importFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) {
        return;
    }

    let data;
    try {
        const text = await file.text();
        data = file.name.toLowerCase().endsWith('.json') ? readJsonBackup(text) : readCsvTransactions(text);
    } catch (error) {
        return showBackupMessage(error instanceof SyntaxError ? 'O arquivo JSON está corrompido.' : error.message, true);
    }

    const notes = [
        data.duplicates ? `${plural(data.duplicates, 'linha já existia e foi ignorada', 'linhas já existiam e foram ignoradas')}.` : '',
        data.errors.length ? `${plural(data.errors.length, 'linha ignorada', 'linhas ignoradas')} por data ou valor inválido (${data.errors.length === 1 ? 'linha' : 'linhas'} ${data.errors.slice(0, 5).join(', ')}${data.errors.length > 5 ? '…' : ''}).` : ''
    ].filter(Boolean).join(' ');

    if (!data.transactions.length && !data.categories.length && !data.goals.length && !data.clients.length) {
        return showBackupMessage(`Nada novo para importar. ${notes}`.trim(), !data.duplicates);
    }

    const summary = [
        plural(data.transactions.length, 'transação', 'transações'),
        data.categories.length ? plural(data.categories.length, 'categoria', 'categorias') : '',
        data.goals.length ? plural(data.goals.length, 'meta', 'metas') : '',
        data.clients.length ? plural(data.clients.length, (getTerms(getActiveAccount()).client || 'Cliente').toLowerCase(), (getTerms(getActiveAccount()).clientPlural || 'Clientes').toLowerCase()) : ''
    ].filter(Boolean).join(', ');
    if (!confirm(`Importar ${summary}? Itens com o mesmo identificador serão substituídos.`)) {
        return;
    }

    showBackupMessage('Importando…');
    try {
        await saveItems('categories', data.categories);
        await saveItems('goals', data.goals);
        if (data.clients.length) {
            await saveItems('clients', data.clients);
        }
        await saveItems('transactions', data.transactions);
    } catch (error) {
        return showBackupMessage('Não foi possível importar. Tente novamente.', true);
    }

    mergeById('categories', data.categories);
    mergeById('goals', data.goals);
    mergeById('clients', data.clients);
    mergeById('transactions', data.transactions);
    render();

    showBackupMessage(`Importação concluída: ${summary}. ${notes}`.trim());
}

function mergeById(collection, items) {
    const ids = items.map(item => item.id);
    state[collection] = state[collection].filter(item => !ids.includes(item.id)).concat(items);
}

function showBackupMessage(message, isError = false) {
    const element = document.getElementById('backup-message');
    element.textContent = message;
    element.classList.toggle('expense', isError);
    element.hidden = false;
}

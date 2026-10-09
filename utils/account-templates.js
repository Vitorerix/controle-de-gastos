// Modelos de conta profissional. Ao criar a conta, uma cópia do modelo é salva nela,
// então mudar este arquivo depois não altera contas já criadas.

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Outro'];

// Cada campo extra é guardado em transaction.details[key].
// appliesTo: 'income' (atendimentos/serviços) ou 'expense' (gastos).
// showWhen: o campo só aparece quando outro campo tem um certo valor.
// type: text | textarea | select | client | receipt
const ACCOUNT_TEMPLATES = {
    vet: {
        label: 'Veterinário(a)',
        description: 'Atendimentos em clínicas e a domicílio, com paciente e tutor.',
        terms: {
            income: 'Atendimento', incomePlural: 'Atendimentos',
            expense: 'Gasto', expensePlural: 'Gastos',
            client: 'Clínica', clientPlural: 'Clínicas', clientFeminine: true
        },
        fields: [
            { key: 'location', label: 'Local', type: 'select', options: ['Clínica', 'Domicílio'], appliesTo: 'income', required: true },
            { key: 'clientId', label: 'Clínica', type: 'client', appliesTo: 'income', required: true, showWhen: { field: 'location', equals: 'Clínica' } },
            { key: 'patient', label: 'Paciente', type: 'text', appliesTo: 'income' },
            { key: 'tutor', label: 'Tutor', type: 'text', appliesTo: 'income' },
            { key: 'address', label: 'Endereço / Bairro', type: 'text', appliesTo: 'income', showWhen: { field: 'location', equals: 'Domicílio' } },
            { key: 'serviceType', label: 'Tipo de atendimento', type: 'text', appliesTo: 'income', suggestions: true },
            { key: 'km', label: 'Km / Local', type: 'text', appliesTo: 'expense' },
            { key: 'receipt', label: 'Comprovante', type: 'receipt', appliesTo: 'expense' },
            { key: 'notes', label: 'Observações', type: 'textarea', appliesTo: 'both' }
        ],
        categories: [
            { id: 'atendimentos', name: 'Atendimentos', kind: 'income', imageType: 'icon', image: 'stethoscope', color: '#1f6b5f' },
            { id: 'combustivel', name: 'Combustível', kind: 'expense', imageType: 'icon', image: 'fuel', color: '#e0592a' },
            { id: 'manutencao-carro', name: 'Manutenção do carro', kind: 'expense', imageType: 'icon', image: 'wrench', color: '#6d4c41' },
            { id: 'alimentacao', name: 'Alimentação', kind: 'expense', imageType: 'icon', image: 'utensils', color: '#f57c00' },
            { id: 'investimento-profissao', name: 'Investimento na profissão', kind: 'expense', imageType: 'icon', image: 'graduation-cap', color: '#3949ab' },
            { id: 'outros', name: 'Outros', kind: 'expense', imageType: 'icon', image: 'tag', color: '#757575' }
        ]
    },
    generic: {
        label: 'Prestador de serviço',
        description: 'Serviços para clientes, para qualquer profissão autônoma.',
        terms: {
            income: 'Serviço', incomePlural: 'Serviços',
            expense: 'Gasto', expensePlural: 'Gastos',
            client: 'Cliente', clientPlural: 'Clientes', clientFeminine: false
        },
        fields: [
            { key: 'clientId', label: 'Cliente', type: 'client', appliesTo: 'income', required: true },
            { key: 'serviceType', label: 'Serviço', type: 'text', appliesTo: 'income', suggestions: true },
            { key: 'km', label: 'Km / Local', type: 'text', appliesTo: 'expense' },
            { key: 'receipt', label: 'Comprovante', type: 'receipt', appliesTo: 'expense' },
            { key: 'notes', label: 'Observações', type: 'textarea', appliesTo: 'both' }
        ],
        categories: [
            { id: 'servicos', name: 'Serviços prestados', kind: 'income', imageType: 'icon', image: 'briefcase', color: '#1f6b5f' },
            { id: 'transporte', name: 'Transporte', kind: 'expense', imageType: 'icon', image: 'car', color: '#1976d2' },
            { id: 'material', name: 'Material de trabalho', kind: 'expense', imageType: 'icon', image: 'wrench', color: '#6d4c41' },
            { id: 'alimentacao', name: 'Alimentação', kind: 'expense', imageType: 'icon', image: 'utensils', color: '#f57c00' },
            { id: 'impostos', name: 'Impostos e taxas', kind: 'expense', imageType: 'icon', image: 'receipt', color: '#8e24aa' },
            { id: 'investimento-profissao', name: 'Investimento na profissão', kind: 'expense', imageType: 'icon', image: 'graduation-cap', color: '#3949ab' },
            { id: 'outros', name: 'Outros', kind: 'expense', imageType: 'icon', image: 'tag', color: '#757575' }
        ]
    }
};

const PERSONAL_TERMS = {
    income: 'Receita', incomePlural: 'Receitas',
    expense: 'Despesa', expensePlural: 'Despesas'
};

function getTemplate(templateId) {
    return ACCOUNT_TEMPLATES[templateId] || ACCOUNT_TEMPLATES.generic;
}

// Palavras usadas na tela para a conta ativa ("Atendimento" x "Receita", etc.)
function getTerms(account) {
    return account.type === 'professional' ? (account.terms || getTemplate(account.template).terms) : PERSONAL_TERMS;
}

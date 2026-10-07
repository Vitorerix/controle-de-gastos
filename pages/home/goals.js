// Metas de economia: { id, name, target, saved }

function renderGoals() {
    const list = goalPage.list();
    list.innerHTML = '';
    goalPage.empty().style.display = state.goals.length ? 'none' : 'block';

    [...state.goals]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .forEach(goal => list.appendChild(createGoalItem(goal)));
}

function createGoalItem(goal) {
    const percent = goal.saved / goal.target * 100;
    const done = goal.saved >= goal.target;

    const item = document.createElement('li');
    item.className = 'goal-item';
    item.innerHTML = `
        <div class="goal-header">
            <strong></strong>
            <button type="button" class="clear row-action danger-action" title="Excluir meta" aria-label="Excluir meta"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>
        <div class="progress"><div class="progress-bar ${done ? 'done' : 'ok'}" style="width: ${Math.min(percent, 100)}%"></div></div>
        <small class="muted">${formatCurrency(goal.saved)} de ${formatCurrency(goal.target)} (${Math.round(percent)}%)${done ? ' · 🎉 Meta atingida!' : ''}</small>
        <div class="goal-actions">
            <input type="text" inputmode="numeric" data-currency placeholder="Valor (R$)">
            <button type="button" class="outline-dark">+ Guardar</button>
            <button type="button" class="outline-dark">− Retirar</button>
        </div>
    `;
    item.querySelector('strong').textContent = goal.name;

    const input = item.querySelector('input');
    const [deleteButton, depositButton, withdrawButton] = item.querySelectorAll('button');
    deleteButton.onclick = () => deleteGoal(goal.id);
    depositButton.onclick = () => changeGoalSaved(goal.id, parseAmount(input.value));
    withdrawButton.onclick = () => changeGoalSaved(goal.id, -parseAmount(input.value));

    return item;
}

async function addGoal(event) {
    event.preventDefault();
    const name = goalPage.name().value.trim();
    const target = parseAmount(goalPage.target().value);

    if (!name) {
        return showGoalError('Informe o nome da meta');
    }
    if (!(target > 0)) {
        return showGoalError('O valor da meta deve ser maior que zero');
    }

    const goal = { id: createId(), name, target, saved: 0 };
    try {
        await saveItem('goals', goal);
    } catch (error) {
        return showGoalError('Não foi possível criar a meta. Tente novamente.');
    }

    state.goals.push(goal);
    goalPage.name().value = '';
    goalPage.target().value = '';
    goalPage.error().style.display = 'none';
    renderGoals();
}

async function changeGoalSaved(id, amount) {
    if (!amount || Number.isNaN(amount)) {
        return;
    }
    const goal = state.goals.find(item => item.id === id);
    const updated = { ...goal, saved: Math.max(0, goal.saved + amount) };

    try {
        await saveItem('goals', updated);
    } catch (error) {
        alert('Não foi possível atualizar a meta. Tente novamente.');
        return;
    }
    state.goals = state.goals.map(item => item.id === id ? updated : item);
    renderGoals();
}

async function deleteGoal(id) {
    const goal = state.goals.find(item => item.id === id);
    if (!confirm(`Excluir a meta "${goal.name}"?`)) {
        return;
    }
    try {
        await removeItem('goals', id);
    } catch (error) {
        alert('Não foi possível excluir a meta. Tente novamente.');
        return;
    }
    state.goals = state.goals.filter(item => item.id !== id);
    renderGoals();
}

function showGoalError(message) {
    goalPage.error().textContent = message;
    goalPage.error().style.display = 'block';
}

const goalPage = {
    list: () => document.getElementById('goals-list'),
    empty: () => document.getElementById('goals-empty'),
    name: () => document.getElementById('goal-name'),
    target: () => document.getElementById('goal-target'),
    error: () => document.getElementById('goal-error')
}

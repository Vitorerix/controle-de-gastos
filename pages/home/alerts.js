// Avisos do mês exibidos abaixo dos cards: saldo negativo e orçamentos no limite

function getAlerts() {
    const alerts = [];
    const transactions = getMonthTransactions();
    const balance = sumByType(transactions, 'income') - sumByType(transactions, 'expense');
    const monthName = formatMonth(currentMonth).split(' ')[0].toLowerCase();

    if (balance < 0) {
        alerts.push({
            level: 'critical',
            text: `Seu saldo de ${monthName} está negativo: ${formatCurrency(balance)}. As despesas passaram das receitas.`
        });
    }

    getSortedCategories()
        .filter(category => category.budget)
        .forEach(category => {
            const spent = getMonthSpentByCategory(category.id);
            const percent = spent / category.budget * 100;
            if (percent > 100) {
                alerts.push({
                    level: 'critical',
                    text: `${category.name} passou do limite: ${formatCurrency(spent)} de ${formatCurrency(category.budget)} (${formatCurrency(spent - category.budget)} acima).`
                });
            } else if (percent >= 80) {
                alerts.push({
                    level: 'warning',
                    text: `${category.name} está perto do limite: ${Math.round(percent)}% usado, restam ${formatCurrency(category.budget - spent)}.`
                });
            }
        });

    return alerts;
}

function renderAlerts() {
    const list = document.getElementById('alerts');
    list.innerHTML = '';

    getAlerts().forEach(alert => {
        const item = document.createElement('li');
        item.className = `alert ${alert.level}`;
        item.setAttribute('role', 'status');
        item.innerHTML = `<span class="alert-icon">${alert.level === 'critical' ? '⛔' : '⚠️'}</span><span></span>`;
        item.lastChild.textContent = alert.text;
        list.appendChild(item);
    });
}

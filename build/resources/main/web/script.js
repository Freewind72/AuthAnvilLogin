// 全局变量
let accessToken = localStorage.getItem('authToken');
let historyChart = null;

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
    if (accessToken) {
        hideAuthPrompt();
        loadAllData();
        startAutoRefresh();
    }
});

// 认证
function authenticate() {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) {
        alert('请输入访问令牌');
        return;
    }

    accessToken = token;
    localStorage.setItem('authToken', token);

    // 测试令牌
    fetchAPI('/api/stats')
        .then(() => {
            hideAuthPrompt();
            loadAllData();
            startAutoRefresh();
        })
        .catch(err => {
            alert('令牌无效，请重试');
            accessToken = null;
            localStorage.removeItem('authToken');
        });
}

function hideAuthPrompt() {
    document.getElementById('authPrompt').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

// API 请求
async function fetchAPI(endpoint) {
    const response = await fetch(endpoint, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem('authToken');
            location.reload();
        }
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

// 加载所有数据
async function loadAllData() {
    try {
        await Promise.all([
            loadStats(),
            loadHistory(),
            loadPlayers(),
            loadEvents()
        ]);
        updateLastUpdateTime();
    } catch (err) {
        console.error('加载数据失败:', err);
    }
}

// 加载统计数据
async function loadStats() {
    const data = await fetchAPI('/api/stats');

    // 今日数据
    document.getElementById('todayRegistrations').textContent = data.today.registrations;
    document.getElementById('todayLogins').textContent = data.today.logins;
    document.getElementById('todayFailures').textContent = data.today.failures;
    document.getElementById('todayRateLimits').textContent = data.today.rateLimits;

    // 总数据
    document.getElementById('totalRegistrations').textContent = data.total.registrations;
    document.getElementById('totalLogins').textContent = data.total.logins;
    document.getElementById('totalFailures').textContent = data.total.failures;
    document.getElementById('totalPlayers').textContent = data.total.players;

    // 性能指标
    document.getElementById('avgLoginTime').textContent = `${data.averageLoginTime} ms`;
    document.getElementById('successRate').textContent = `${data.successRate.toFixed(2)}%`;
}

// 加载历史数据
async function loadHistory() {
    const data = await fetchAPI('/api/history');

    // 反转数据以按时间顺序显示
    const sortedData = data.sort((a, b) => a.date.localeCompare(b.date));

    const labels = sortedData.map(d => d.date);
    const registrations = sortedData.map(d => d.registrations);
    const logins = sortedData.map(d => d.logins);
    const failures = sortedData.map(d => d.failures);

    // 销毁旧图表
    if (historyChart) {
        historyChart.destroy();
    }

    // 创建新图表
    const ctx = document.getElementById('historyChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '注册',
                    data: registrations,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '登录',
                    data: logins,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '失败',
                    data: failures,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#f1f5f9',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#475569' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#475569' },
                    beginAtZero: true
                }
            }
        }
    });
}

// 加载玩家排行
async function loadPlayers() {
    const data = await fetchAPI('/api/players');
    const tbody = document.getElementById('playersTableBody');

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">暂无数据</td></tr>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    tbody.innerHTML = data.slice(0, 10).map((player, index) => {
        const rank = index < 3 ? medals[index] : `#${index + 1}`;
        return `
            <tr>
                <td><span class="rank-medal">${rank}</span></td>
                <td><strong>${escapeHtml(player.playerName)}</strong></td>
                <td><span style="color: #10b981">${player.totalLogins}</span></td>
                <td><span style="color: #ef4444">${player.failedAttempts}</span></td>
                <td>${escapeHtml(player.lastLoginTime || '-')}</td>
                <td><code>${escapeHtml(player.lastLoginIP || '-')}</code></td>
            </tr>
        `;
    }).join('');
}

// 加载安全事件
async function loadEvents() {
    const data = await fetchAPI('/api/events');
    const container = document.getElementById('eventsContainer');

    if (data.length === 0) {
        container.innerHTML = '<p class="loading">暂无事件</p>';
        return;
    }

    const eventIcons = {
        'LOGIN_SUCCESS': '✅',
        'LOGIN_FAILURE': '❌',
        'REGISTER': '📝',
        'RATE_LIMIT': '⚠️',
        'LOCKOUT': '🔒'
    };

    const eventNames = {
        'LOGIN_SUCCESS': '登录成功',
        'LOGIN_FAILURE': '登录失败',
        'REGISTER': '账号注册',
        'RATE_LIMIT': '速率限制',
        'LOCKOUT': '账户锁定'
    };

    // 显示最近20条，倒序
    container.innerHTML = data.slice(-20).reverse().map(event => `
        <div class="event-item ${event.type}">
            <div class="event-info">
                <div class="event-type">
                    ${eventIcons[event.type] || '📌'} ${eventNames[event.type] || event.type}
                </div>
                <div class="event-details">
                    玩家: ${escapeHtml(event.playerName)} |
                    IP: ${escapeHtml(event.ip)} |
                    ${escapeHtml(event.details)}
                </div>
            </div>
            <div class="event-time">${escapeHtml(event.timestamp)}</div>
        </div>
    `).join('');
}

// 更新最后更新时间
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = `最后更新: ${timeStr}`;
}

// 自动刷新
function startAutoRefresh() {
    setInterval(() => {
        loadAllData();
    }, 5000); // 每5秒刷新
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 键盘事件
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('authPrompt').style.display !== 'none') {
        authenticate();
    }
});

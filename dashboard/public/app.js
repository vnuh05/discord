// ════════════════════════════
//  UTILS
// ════════════════════════════
const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtDate = d => d ? new Date(d).toLocaleString('vi-VN', { dateStyle:'short', timeStyle:'short' }) : '—';
const fmtStars = n => n ? '⭐'.repeat(n) + ` (${n}/5)` : '—';
let pendingSettingsAction = 'save';

function statusBadge(status) {
  const map = {
    available: ['Còn hàng', 'badge-green'],
    sold:      ['Đã bán',   'badge-red'],
    reserved:  ['Đang giữ', 'badge-orange'],
    confirmed: ['Đã xác nhận', 'badge-green'],
    pending:   ['Chờ TT',   'badge-orange'],
    failed:    ['Thất bại', 'badge-red'],
    open:      ['Đang mở',  'badge-blue'],
    assigned:  ['Đang xử lý','badge-orange'],
    closed:    ['Đã đóng',  'badge-gray'],
  };
  const [label, cls] = map[status] || [status, 'badge-gray'];
  return `<span class="badge ${cls}">${label}</span>`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type':'application/json' },
    credentials: 'include',
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi server');
  return data;
}

// ════════════════════════════
//  AUTH
// ════════════════════════════
async function doLogin() {
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  const errEl = $('loginError');
  errEl.classList.add('hidden');

  if (!username || !password) {
    showLoginError('Vui lòng nhập đầy đủ thông tin!');
    return;
  }
  try {
    await api('/api/login', { method:'POST', body: JSON.stringify({ username, password }) });
    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('sidebarUsername').textContent = username;
    $('userAvatarChar').textContent = username[0].toUpperCase();
    initApp();
  } catch (e) {
    showLoginError(e.message);
  }
}

function showLoginError(msg) {
  const el = $('loginError');
  el.querySelector('span').textContent = msg;
  el.classList.remove('hidden');
  el.parentElement.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'none'}], {duration:200,iterations:2});
}

async function doLogout() {
  await api('/api/logout', { method:'POST' });
  location.reload();
}

// ════════════════════════════
//  NAVIGATION
// ════════════════════════════
const PAGE_TITLES = {
  overview: 'Dashboard', accounts: 'Quản lý Acc',
  orders: 'Đơn Hàng', users: 'Khách Hàng',
  tickets: 'Tickets', staff: 'CSKH & Lương',
  settings: 'Cài Đặt',
};

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  $('pageTitle').textContent = PAGE_TITLES[page] || page;
  const loaders = { overview: loadOverview, accounts: loadAccounts, orders: loadOrders, users: loadUsers, tickets: loadTickets, staff: loadStaff, settings: loadSettings };
  loaders[page]?.();
}

// ════════════════════════════
//  OVERVIEW
// ════════════════════════════
async function loadOverview() {
  try {
    const stats = await api('/api/stats');
    $('stat-total-revenue').textContent    = fmt(stats.totalRevenue);
    $('stat-monthly-revenue').textContent  = fmt(stats.monthlyRevenue);
    $('stat-available-accs').textContent   = stats.availableAccs;
    $('stat-total-accs-sub').textContent   = `/ ${stats.totalAccs} tổng`;
    $('stat-total-orders').textContent     = stats.totalOrders;
    $('stat-total-users').textContent      = stats.totalUsers ?? '—';
    $('stat-open-tickets').textContent     = stats.openTickets;

    // Sidebar badge
    const badge = $('sidebarTicketCount');
    if (badge) { badge.textContent = stats.openTickets || ''; badge.style.display = stats.openTickets ? '' : 'none'; }

    // Recent orders
    const { orders } = await api('/api/orders?limit=10');
    const tbody = $('recentOrdersBody');
    if (!orders.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Chưa có đơn hàng nào</td></tr>'; return; }
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td class="mono truncate hi" title="${o.orderId}">${o.orderId}</td>
        <td>${o.username || o.userId || '—'}</td>
        <td>${o.accountType || '—'}</td>
        <td class="hi">${fmt(o.amount)}</td>
        <td>${o.paymentMethod === 'bank' ? '<span style="color:var(--blue)">🏦 Bank</span>' : '<span style="color:var(--teal)">📱 Thẻ cào</span>'}</td>
        <td>${statusBadge(o.paymentStatus)}</td>
        <td>${fmtDate(o.createdAt)}</td>
      </tr>`).join('');
  } catch(e) { console.error(e); }
}

// ════════════════════════════
//  ACCOUNTS
// ════════════════════════════
let accPage = 1;
async function loadAccounts() {
  const status = $('accStatusFilter')?.value || '';
  const { accounts, pages } = await api(`/api/accounts?page=${accPage}&limit=20&status=${status}`);
  const tbody = $('accountsTableBody');
  if (!accounts.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Không có acc nào</td></tr>'; return; }
  tbody.innerHTML = accounts.map(a => `
    <tr>
      <td class="mono truncate" title="${a.account_id}">${a.account_id ? a.account_id.slice(-12) : '—'}</td>
      <td class="hi">${a.type}</td>
      <td class="hi">${fmt(a.price)}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${a.sold_to ? a.sold_to.slice(-8)+'…' : '—'}</td>
      <td>${fmtDate(a.created_at)}</td>
      <td>${a.status === 'available' ? `<button class="btn-danger" onclick="deleteAcc('${a.account_id}')"><i class="fas fa-trash-can"></i></button>` : '—'}</td>
    </tr>`).join('');
  renderPagination('accPagination', accPage, pages, p => { accPage = p; loadAccounts(); });
}

async function deleteAcc(id) {
  if (!confirm('Xóa acc này khỏi kho?')) return;
  await api(`/api/accounts/${id}`, { method:'DELETE' });
  loadAccounts();
}

function openAddAccModal() {
  $('addAccModal').classList.remove('hidden');
  $('addAccResult').classList.add('hidden');
  ['acc-type','acc-price','acc-description','acc-list'].forEach(id => $(id).value = '');
}

async function submitAddAcc() {
  const type = $('acc-type').value.trim();
  const price = parseInt($('acc-price').value);
  const description = $('acc-description').value.trim();
  const accounts = $('acc-list').value.trim();
  const res = $('addAccResult');

  if (!type || !price || !accounts) {
    res.innerHTML = '<i class="fas fa-circle-exclamation"></i> Vui lòng điền đủ thông tin!';
    res.className = 'result-msg error'; res.classList.remove('hidden'); return;
  }
  try {
    const result = await api('/api/accounts', { method:'POST', body: JSON.stringify({ type, price, description, accounts }) });
    res.innerHTML = `<i class="fas fa-circle-check"></i> Đã thêm thành công <strong>${result.success}</strong> acc! Thất bại: ${result.failed}`;
    res.className = 'result-msg success'; res.classList.remove('hidden');
    loadAccounts();
  } catch(e) {
    res.innerHTML = `<i class="fas fa-circle-exclamation"></i> Lỗi: ${e.message}`;
    res.className = 'result-msg error'; res.classList.remove('hidden');
  }
}

// ════════════════════════════
//  ORDERS
// ════════════════════════════
let ordersPage = 1;
async function loadOrders() {
  const { orders, pages } = await api(`/api/orders?page=${ordersPage}&limit=20`);
  const tbody = $('ordersTableBody');
  if (!orders.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Chưa có đơn hàng</td></tr>'; return; }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td class="mono hi" style="font-size:.76rem">${o.orderId}</td>
      <td class="mono">${o.userId}</td>
      <td>${o.accountType || '—'}</td>
      <td class="hi">${fmt(o.amount)}</td>
      <td>${o.paymentMethod === 'bank' ? '🏦 Bank' : '📱 Thẻ cào'}</td>
      <td class="mono">${o.csStaffId ? o.csStaffId.slice(-6)+'…' : '—'}</td>
      <td>${statusBadge(o.paymentStatus)}</td>
      <td>${fmtDate(o.createdAt)}</td>
    </tr>`).join('');
  renderPagination('ordersPagination', ordersPage, pages, p => { ordersPage = p; loadOrders(); });
}

// ════════════════════════════
//  USERS
// ════════════════════════════
let usersPage = 1;
async function loadUsers() {
  const { users, pages } = await api(`/api/users?page=${usersPage}&limit=20`);
  const tbody = $('usersTableBody');
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Chưa có khách hàng</td></tr>'; return; }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="mono">${u.discordId}</td>
      <td class="hi">${u.username || '—'}</td>
      <td class="hi">${fmt(u.totalSpent)}</td>
      <td>${fmt(u.monthlySpent)}</td>
      <td>${u.totalOrders}</td>
      <td>${u.currentTier ? `<span class="badge badge-gold">${u.currentTier}</span>` : '<span class="badge badge-gray">None</span>'}</td>
    </tr>`).join('');
  renderPagination('usersPagination', usersPage, pages, p => { usersPage = p; loadUsers(); });
}

// ════════════════════════════
//  TICKETS
// ════════════════════════════
async function loadTickets() {
  const status = $('ticketStatusFilter')?.value || '';
  const { tickets } = await api(`/api/tickets?limit=30&status=${status}`);
  const tbody = $('ticketsTableBody');
  if (!tickets.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Không có ticket nào</td></tr>'; return; }
  tbody.innerHTML = tickets.map(t => `
    <tr>
      <td class="mono" style="font-size:.75rem">${t.ticketId}</td>
      <td class="hi">${t.username || t.userId}</td>
      <td>${t.csStaffUsername || '—'}</td>
      <td class="mono">${t.orderId || '—'}</td>
      <td>${fmtStars(t.rating)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${fmtDate(t.createdAt)}</td>
    </tr>`).join('');
}

// ════════════════════════════
//  STAFF
// ════════════════════════════
async function loadStaff() {
  const { staff } = await api('/api/staff');
  const tbody = $('staffTableBody');
  if (!staff.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Chưa có dữ liệu CSKH</td></tr>'; return; }
  const medals = ['🥇','🥈','🥉'];
  tbody.innerHTML = staff.map((s,i) => `
    <tr>
      <td style="font-size:1.1rem">${medals[i] || `<span class="badge badge-gray">#${i+1}</span>`}</td>
      <td class="mono">${s.discordId}</td>
      <td class="hi">${s.username || '—'}</td>
      <td><strong>${s.monthlyOrders}</strong> đơn</td>
      <td style="color:var(--teal); font-weight:700">${fmt(s.monthlyEarnings)}</td>
      <td>${s.totalOrders}</td>
      <td>${fmt(s.totalEarnings)}</td>
    </tr>`).join('');
}

// ════════════════════════════
//  SETTINGS
// ════════════════════════════
async function loadSettings() {
  try {
    const [{ settings }, botStatus] = await Promise.all([
      api('/api/settings'),
      api('/api/bot/status').catch(() => ({ connected: false, message: 'Không lấy được trạng thái bot' })),
    ]);
    Object.entries(settings).forEach(([key, val]) => {
      const el = $(`set-${key}`);
      if (el) el.value = val || '';
    });
    const msg = $('settingsMsg');
    msg.classList.add('hidden');

    const badge = $('botStatusBadge');
    if (badge) {
      const enabled = botStatus.enabled !== false;
      const connected = Boolean(botStatus.connected);
      if (!enabled) {
        badge.className = 'badge badge-red';
        badge.textContent = 'Đã tắt';
      } else if (connected) {
        badge.className = 'badge badge-green';
        badge.textContent = 'Online';
      } else {
        badge.className = 'badge badge-orange';
        badge.textContent = 'Đang khởi động';
      }
    }
  } catch(e) { console.error('loadSettings', e); }
}

function openSaveSettingsModal() {
  pendingSettingsAction = 'save';
  $('settingsConfirmPass').value = '';
  $('settingsModalErr').classList.add('hidden');
  $('settingsModalText').textContent = 'Thông tin sẽ được lưu lên database và đồng thời khởi động lại bot Discord. Nhập mật khẩu để xác nhận.';
  $('settingsModalConfirmBtn').innerHTML = '<i class="fas fa-floppy-disk"></i> &nbsp;Lưu & Khởi động lại bot';
  $('saveSettingsModal').classList.remove('hidden');
  setTimeout(() => $('settingsConfirmPass').focus(), 100);
}

function openBotControlModal(action) {
  pendingSettingsAction = action;
  $('settingsConfirmPass').value = '';
  $('settingsModalErr').classList.add('hidden');

  const txtMap = {
    start: 'Bạn sắp bật bot Discord. Nhập mật khẩu dashboard để xác nhận.',
    stop: 'Bạn sắp tắt bot Discord. Nhập mật khẩu dashboard để xác nhận.',
    restart: 'Bạn sắp khởi động lại bot Discord. Nhập mật khẩu dashboard để xác nhận.',
  };
  const btnMap = {
    start: '<i class="fas fa-play"></i> &nbsp;Bật bot',
    stop: '<i class="fas fa-stop"></i> &nbsp;Tắt bot',
    restart: '<i class="fas fa-rotate-right"></i> &nbsp;Khởi động lại bot',
  };

  $('settingsModalText').textContent = txtMap[action] || 'Nhập mật khẩu để xác nhận thao tác.';
  $('settingsModalConfirmBtn').innerHTML = btnMap[action] || '<i class="fas fa-check"></i> &nbsp;Xác nhận';
  $('saveSettingsModal').classList.remove('hidden');
  setTimeout(() => $('settingsConfirmPass').focus(), 100);
}

async function submitSaveSettings() {
  return submitSettingsAction();
}

async function submitSettingsAction() {
  const password = $('settingsConfirmPass').value;
  const errEl = $('settingsModalErr');
  errEl.classList.add('hidden');
  if (!password) {
    errEl.querySelector('span').textContent = 'Vui lòng nhập mật khẩu!';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    let result;
    if (pendingSettingsAction === 'save') {
      const settings = {};
      const keys = ['DISCORD_TOKEN','CLIENT_ID','GUILD_ID','SHOP_CHANNEL_ID','LOG_CHANNEL_ID',
        'NOTIFY_CS_CHANNEL_ID','TICKET_CATEGORY_ID','REVIEW_CHANNEL_ID','ANNOUNCEMENT_CHANNEL_ID',
        'CS_ROLE_ID','ADMIN_ROLE_ID','MOD_ROLE_ID'];
      keys.forEach(k => {
        const el = $(`set-${k}`);
        if (el) settings[k] = el.value.trim();
      });
      result = await api('/api/settings', { method:'POST', body: JSON.stringify({ password, settings }) });
    } else {
      result = await api('/api/bot/control', {
        method:'POST',
        body: JSON.stringify({ password, action: pendingSettingsAction }),
      });
    }

    closeModal('saveSettingsModal');
    const msg = $('settingsMsg');
    msg.innerHTML = `<i class="fas fa-circle-check"></i> ${result.message}`;
    msg.className = 'settings-msg success';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 6000);

    await loadSettings();
  } catch(e) {
    errEl.querySelector('span').textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

// ════════════════════════════
//  PAGINATION
// ════════════════════════════
function renderPagination(id, current, total, onClick) {
  const el = $(id);
  if (!el || total <= 1) { if(el) el.innerHTML=''; return; }
  let html = '';
  const start = Math.max(1, current - 2), end = Math.min(total, current + 2);
  if (start > 1) html += `<button class="page-btn" onclick="(${onClick.toString()})(1)">1</button>${start > 2 ? '<span style="color:var(--text-lo);padding:.4rem .3rem">…</span>' : ''}`;
  for (let i = start; i <= end; i++) html += `<button class="page-btn ${i===current?'active':''}" onclick="(${onClick.toString()})(${i})">${i}</button>`;
  if (end < total) html += `${end < total-1 ? '<span style="color:var(--text-lo);padding:.4rem .3rem">…</span>' : ''}<button class="page-btn" onclick="(${onClick.toString()})(${total})">${total}</button>`;
  el.innerHTML = html;
}

// ════════════════════════════
//  MODAL
// ════════════════════════════
function closeModal(id) { $(id).classList.add('hidden'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
});

// ════════════════════════════
//  INIT
// ════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  $('loginPass')?.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  $('loginUser')?.addEventListener('keydown', e => { if(e.key==='Enter') $('loginPass').focus(); });

  api('/api/me').then(data => {
    if (data.authenticated === false) return; // Show login screen
    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('sidebarUsername').textContent = data.username || 'Admin';
    $('userAvatarChar').textContent = (data.username||'A')[0].toUpperCase();
    initApp();
  }).catch(() => {});
});

function initApp() { showPage('overview'); }

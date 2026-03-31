/* ═══════════════════════════════════════════════════
   KARACHI BITES – Admin Dashboard
═══════════════════════════════════════════════════ */

(function () {
  // ── State ────────────────────────────────────────
  let allOrders = [];
  let currentFilter = 'all';
  let lastUpdated = null;
  let pendingDeleteId = null;
  let refreshCountdown = 30;

  // ── DOM Refs ──────────────────────────────────────
  const tableBody = document.getElementById('ordersTableBody');
  const emptyState = document.getElementById('emptyState');
  const tableWrapper = document.querySelector('.table-wrapper');
  const filterTabs = document.getElementById('filterTabs');
  const refreshStatus = document.getElementById('refreshText');
  const deleteModal = document.getElementById('deleteModal');
  const modalCancel = document.getElementById('modalCancel');
  const modalConfirm = document.getElementById('modalConfirm');
  const btnRefresh = document.getElementById('btnRefresh');
  const currentDateTimeEl = document.getElementById('currentDateTime');

  // ── Stat elements ─────────────────────────────────
  const statTotalOrders  = document.getElementById('statTotalOrders');
  const statTodayOrders  = document.getElementById('statTodayOrders');
  const statPending      = document.getElementById('statPendingOrders');
  const statTodayRev     = document.getElementById('statTodayRevenue');
  const statTotalRev     = document.getElementById('statTotalRevenue');

  // ── Load Dashboard ────────────────────────────────
  async function loadDashboard() {
    try {
      const [ordersRes, statsRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/stats'),
      ]);

      allOrders = await ordersRes.json();
      const stats = await statsRes.json();

      updateStats(stats);
      renderOrders();
      lastUpdated = new Date();
      refreshCountdown = 30;
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }

  // ── Update Stats Cards ────────────────────────────
  function updateStats(stats) {
    if (statTotalOrders) statTotalOrders.textContent = stats.totalOrders ?? 0;
    if (statTodayOrders) statTodayOrders.textContent = stats.todayOrders ?? 0;
    if (statPending)     statPending.textContent     = stats.pendingOrders ?? 0;
    if (statTodayRev)    statTodayRev.textContent    = formatCurrency(stats.todayRevenue ?? 0);
    if (statTotalRev)    statTotalRev.textContent    = formatCurrency(stats.totalRevenue ?? 0);
  }

  // ── Render Orders Table ───────────────────────────
  function renderOrders() {
    const filtered = currentFilter === 'all'
      ? allOrders
      : allOrders.filter(o => o.status === currentFilter);

    // Sort newest first
    const sorted = [...filtered].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (sorted.length === 0) {
      tableWrapper.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    tableWrapper.classList.remove('hidden');
    emptyState.classList.add('hidden');

    tableBody.innerHTML = sorted.map(order => renderOrderRow(order)).join('');

    // Attach status change listeners
    tableBody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        updateOrderStatus(sel.dataset.id, sel.value);
      });
    });

    // Attach delete listeners
    tableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => showDeleteModal(btn.dataset.id));
    });
  }

  function renderOrderRow(order) {
    const shortId = 'KB-' + order.id.split('-')[0].toUpperCase();
    const timeStr = formatOrderTime(order.createdAt);
    const itemsHtml = (order.items || [])
      .map(i => `<div class="item-row">${i.qty}× ${i.name}</div>`)
      .join('') || '<span style="color:#aaa">—</span>';

    const typeBadge = order.type === 'delivery'
      ? '<span class="type-badge type-delivery">🚚 Delivery</span>'
      : '<span class="type-badge type-pickup">🏃 Pickup</span>';

    const address = order.address || '—';
    const total = formatCurrency(order.total || 0);

    const statusOptions = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']
      .map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${capitalize(s)}</option>`)
      .join('');

    return `
      <tr>
        <td><span class="order-id-cell">${shortId}</span></td>
        <td style="white-space:nowrap;color:var(--text-mid)">${timeStr}</td>
        <td><div class="items-list">${itemsHtml}</div></td>
        <td>${typeBadge}</td>
        <td style="max-width:160px;font-size:0.82rem;color:var(--text-mid)">${escapeHtml(address)}</td>
        <td><span class="total-amount">${total}</span></td>
        <td>
          <select class="status-select" data-id="${order.id}">
            ${statusOptions}
          </select>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-delete" data-id="${order.id}" title="Delete order">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }

  // ── Update Order Status ───────────────────────────
  async function updateOrderStatus(id, status) {
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        // Update local state without full reload
        const idx = allOrders.findIndex(o => o.id === id);
        if (idx !== -1) allOrders[idx].status = status;

        // Flash row green briefly
        const row = tableBody.querySelector(`[data-id="${id}"]`)?.closest('tr');
        if (row) {
          row.style.transition = 'background 0.3s';
          row.style.background = 'rgba(46,204,113,0.08)';
          setTimeout(() => { row.style.background = ''; }, 800);
        }

        // Reload stats
        fetch('/api/stats')
          .then(r => r.json())
          .then(updateStats)
          .catch(() => {});
      }
    } catch (err) {
      console.error('Status update failed:', err);
    }
  }

  // ── Delete Modal ──────────────────────────────────
  function showDeleteModal(id) {
    pendingDeleteId = id;
    deleteModal.classList.remove('hidden');
  }

  function hideDeleteModal() {
    pendingDeleteId = null;
    deleteModal.classList.add('hidden');
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    hideDeleteModal();

    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        allOrders = allOrders.filter(o => o.id !== id);
        renderOrders();
        fetch('/api/stats').then(r => r.json()).then(updateStats).catch(() => {});
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // ── Filter Tabs ───────────────────────────────────
  if (filterTabs) {
    filterTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterTabs.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderOrders();
    });
  }

  // ── Auto Refresh (30s) ────────────────────────────
  setInterval(() => {
    refreshCountdown--;
    if (refreshStatus) {
      refreshStatus.textContent = `Auto-refresh in ${refreshCountdown}s`;
    }
    if (refreshCountdown <= 0) {
      loadDashboard();
    }
  }, 1000);

  // ── Manual Refresh ────────────────────────────────
  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadDashboard);
  }

  // ── Modal Listeners ───────────────────────────────
  if (modalCancel) modalCancel.addEventListener('click', hideDeleteModal);
  if (modalConfirm) modalConfirm.addEventListener('click', confirmDelete);
  if (deleteModal) {
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) hideDeleteModal();
    });
  }

  // ── Date/Time Display ─────────────────────────────
  function updateDateTime() {
    if (currentDateTimeEl) {
      currentDateTimeEl.textContent = new Date().toLocaleDateString('en-PK', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  setInterval(updateDateTime, 1000);
  updateDateTime();

  // ── Utility Functions ─────────────────────────────
  function formatCurrency(amount) {
    return 'Rs. ' + Number(amount).toLocaleString('en-PK');
  }

  function formatOrderTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const todayStr = now.toDateString();
    const orderStr = date.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (orderStr === todayStr) return 'Today ' + timeStr;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (orderStr === yesterday.toDateString()) return 'Yesterday ' + timeStr;

    return date.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }) + ' ' + timeStr;
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Initialize ────────────────────────────────────
  loadDashboard();

})();

import './style.css'

const seedProducts = [
  { id: 1, name: 'Lucky Me Pancit Canton', category: 'Groceries', price: 15, stock: 42, unit: 'pack', updated: 'Today, 9:42 AM', icon: 'LM', tone: 'coral', supplier: 'Mila Foods', reorderLevel: 10, sold: 14 },
  { id: 2, name: 'Coca-Cola Sakto 290ml', category: 'Beverages', price: 20, stock: 8, unit: 'bottle', updated: 'Today, 9:15 AM', icon: 'CC', tone: 'red', supplier: 'Beverage Plus', reorderLevel: 8, sold: 11 },
  { id: 3, name: 'Surf Powder Detergent 55g', category: 'Household', price: 9, stock: 4, unit: 'sachet', updated: 'Yesterday, 4:20 PM', icon: 'SF', tone: 'blue', supplier: 'Clean Supply Co.', reorderLevel: 6, sold: 7 },
  { id: 4, name: 'Nescafe Classic 25g', category: 'Groceries', price: 49, stock: 25, unit: 'jar', updated: 'Yesterday, 1:05 PM', icon: 'NC', tone: 'coffee', supplier: 'Coffee Depot', reorderLevel: 12, sold: 8 },
  { id: 5, name: 'Gardenia Classic Bread', category: 'Fresh Goods', price: 75, stock: 0, unit: 'loaf', updated: 'Yesterday, 8:30 AM', icon: 'GB', tone: 'yellow', supplier: 'Fresh Daily', reorderLevel: 5, sold: 5 },
  { id: 6, name: 'Lucky Me Beef Noodles', category: 'Groceries', price: 14, stock: 31, unit: 'pack', updated: 'Mon, 10:12 AM', icon: 'LB', tone: 'green', supplier: 'Mila Foods', reorderLevel: 10, sold: 9 },
]

const defaultCategories = ['Groceries', 'Beverages', 'Household', 'Fresh Goods']
const API_PRODUCTS = '/api/products'
const API_CATEGORIES = '/api/categories'

let products = [...seedProducts]
let categories = [...defaultCategories]
let activeCategory = 'All items'
let activeStockFilter = 'all'
let sortByValue = false
let query = ''
let editingId = null
let authToken = localStorage.getItem('tindahan-auth-token')
let currentUser = null

const peso = value => `₱${Number(value).toFixed(2)}`
const getReorderLevel = product => Math.max(0, Number(product?.reorderLevel ?? 10))
const statusFor = (stock, reorderLevel = 10) => stock === 0 ? ['Out of stock', 'out'] : stock <= reorderLevel ? ['Low stock', 'low'] : ['In stock', 'in']
const expirationFor = expirationDate => {
  if (!expirationDate) return ['No expiry date', 'no-expiry']

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(`${expirationDate}T00:00:00`)
  const days = Math.ceil((expiry - today) / 86400000)

  if (days < 0) return [`Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, 'expired']
  if (days === 0) return ['Expires today', 'expires-today']
  return [`Expires in ${days} day${days === 1 ? '' : 's'}`, 'expires-soon']
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Check the Vercel API deployment and database configuration.`)
    }
  }

  if (!response.ok) {
    if (response.status === 401 && authToken) {
      authToken = null
      localStorage.removeItem('tindahan-auth-token')
      showAuthGate('Your session has expired. Please log in again.')
    }
    throw new Error(payload?.message || 'Request failed.')
  }

  return payload
}

async function refreshInventory() {
  try {
    const [inventory, categoryList] = await Promise.all([
      fetchJson(API_PRODUCTS).catch(() => seedProducts),
      fetchJson(API_CATEGORIES).catch(() => []),
    ])

    if (Array.isArray(inventory) && inventory.length) {
      products = inventory
    } else {
      products = [...seedProducts]
    }

    if (Array.isArray(categoryList) && categoryList.length) {
      categories = categoryList
    } else {
      categories = [...new Set([...defaultCategories, ...products.map(product => product.category)])]
    }
  } catch (error) {
    products = [...seedProducts]
    categories = [...new Set([...defaultCategories, ...products.map(product => product.category)])]
    console.error('Unable to load inventory from backend:', error)
  }

  renderSalesView()
  renderReportsView()
  syncViewPanels()
  render()
}

document.querySelector('#app').innerHTML = `
  <section class="auth-gate" id="auth-gate">
    <div class="auth-card">
      <div class="auth-brand"><span class="brand-mark">T</span><span>Tindahan<span class="brand-dot">.</span></span></div>
      <p class="eyebrow">STORE MANAGEMENT</p>
      <h1 id="auth-title">Welcome back</h1>
      <p class="auth-copy" id="auth-copy">Log in to manage your store inventory.</p>
      <form id="login-form" class="login-form">
        <label id="auth-name-field" hidden>Full name<input name="name" autocomplete="name" placeholder="e.g. Maria Reyes" /></label>
        <label>Email<input name="email" type="email" autocomplete="email" value="${import.meta.env.DEV ? 'maria@tindahan.local' : ''}" required /></label>
        <label>Password<div class="password-input-wrap"><input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required /><button class="password-toggle" id="password-toggle" type="button" aria-label="Show password" aria-pressed="false" title="Show password"><span class="password-eye" aria-hidden="true"></span></button></div></label>
        <p class="auth-error" id="auth-error" role="alert"></p>
        <button class="primary-button" type="submit">Log in</button>
      </form>
      <button class="auth-switch" id="auth-toggle" type="button">Create a new account</button>
      <p class="demo-hint" id="demo-hint" ${import.meta.env.DEV ? '' : 'hidden'}>Local demo account: maria@tindahan.local / admin123</p>
    </div>
  </section>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">T</span><span>Tindahan<span class="brand-dot">.</span></span></div>
      <div class="shop-switcher"><span class="shop-avatar">J</span><span><strong>Jack</strong><small>Main Store</small></span><span class="chevron">⌄</span></div>
      <nav class="nav" aria-label="Main navigation">
        <a class="nav-item active" href="#inventory" data-view="inventory"><span class="nav-icon">▦</span>Inventory</a>
        <a class="nav-item" href="#sales" data-view="sales"><span class="nav-icon">◒</span>Sales</a>
        <a class="nav-item" href="#reports" data-view="reports"><span class="nav-icon">⌁</span>Reports</a>
      </nav>
      <div class="sidebar-footer"><div class="help-card"><span class="help-icon">?</span><div><strong>Need a hand?</strong><p>We're here to help.</p></div><span>›</span></div><div class="user"><span class="user-avatar" id="sidebar-user-initials">MR</span><span><strong id="sidebar-user-name">Maria Reyes</strong><small id="sidebar-user-role">Store owner</small></span><span class="more">•••</span></div></div>
    </aside>
    <main class="main-content" id="inventory">
      <header class="topbar"><div class="crumbs"><span>Store</span><span>/</span><strong>Inventory</strong></div><div class="top-actions"><span class="date-label">Monday, September 22, 2026</span><button class="icon-button" title="Notifications">♢<i></i></button><div class="profile-menu-wrap"><button class="profile-button" id="profile-button" aria-expanded="false">MR <span>⌄</span></button><div class="profile-menu" id="profile-menu" hidden><strong id="profile-menu-name">Maria Reyes</strong><small id="profile-menu-email">maria@tindahan.local</small><button class="menu-signout" id="menu-signout" type="button">↪ Sign out</button></div></div></div></header>
      <section class="page-heading"><div><p class="eyebrow">GOOD MORNING, MARIA</p><h1>Inventory Overview</h1><p class="subtitle">Keep an eye on your stock and know what needs restocking.</p></div></section>
      <section class="stats-grid" aria-label="Inventory summary"><button class="stat-card" data-summary="all"><div class="stat-top"><span class="stat-label">Total products</span><span class="stat-icon lavender">▦</span></div><strong id="total-products">0</strong><small><span class="trend">↗ 12%</span> from last month</small></button><button class="stat-card" data-summary="value"><div class="stat-top"><span class="stat-label">Inventory value</span><span class="stat-icon mint">₱</span></div><strong id="inventory-value">₱0.00</strong><small><span class="trend">↗ 8.4%</span> from last month</small></button><button class="stat-card" data-summary="low"><div class="stat-top"><span class="stat-label">Low stock items</span><span class="stat-icon peach">!</span></div><strong id="low-stock">0</strong><small><span class="warning-copy">Needs your attention</span></small></button><button class="stat-card" data-summary="out"><div class="stat-top"><span class="stat-label">Out of stock</span><span class="stat-icon rose">×</span></div><strong id="out-of-stock">0</strong><small><span class="muted-copy">Restock to keep selling</span></small></button></section>
      <section class="insights-row"><div class="insight-card"><span>Sales this week</span><strong id="total-sales">0</strong></div><div class="insight-card"><span>Best seller</span><strong id="best-seller">N/A</strong></div></section>
      <section class="inventory-section view-panel" data-view="inventory"><div class="section-heading"><div><h2>All products <span id="product-count">0</span></h2><p>Manage the products on your shelves.</p></div><div class="section-actions"><button class="primary-button" id="add-product"><span>＋</span> Add product</button><button class="export-button" id="add-category">＋ Category</button><button class="export-button" id="export-products">⇩ Export</button></div></div><div class="toolbar"><label class="search-box"><span>⌕</span><input id="search" type="search" placeholder="Search products..." /></label><div class="filters" id="category-filters"></div><button class="filter-icon" title="Filter products">≡</button></div><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>IN STOCK</th><th>STATUS</th><th>EXPIRATION</th><th>LAST UPDATED</th><th></th></tr></thead><tbody id="product-rows"></tbody></table><div class="empty-state" id="empty-state" hidden><div>⌕</div><h3>No products found</h3><p>Try a different search or add a new product.</p></div></div><div class="table-footer"><span id="showing-count">Showing 0 products</span><div class="pagination"><button disabled>‹</button><button class="current">1</button><button disabled>›</button></div></div></section>
      <section class="view-panel hidden" data-view="sales" id="sales"><div class="panel-shell"><div class="panel-header"><div><p class="eyebrow">SALES MONITOR</p><h2>Sales overview</h2></div></div><div class="stats-grid sales-grid" aria-label="Sales summary"><div class="stat-card"><div class="stat-top"><span class="stat-label">Total revenue</span><span class="stat-icon mint">₱</span></div><strong id="sales-total-revenue">₱0.00</strong><small><span class="trend">↗ Weekly</span> performance</small></div><div class="stat-card"><div class="stat-top"><span class="stat-label">Units sold</span><span class="stat-icon lavender">◔</span></div><strong id="sales-units">0</strong><small><span class="trend">↗ This week</span> trend</small></div><div class="stat-card"><div class="stat-top"><span class="stat-label">Average sale</span><span class="stat-icon peach">=</span></div><strong id="sales-average">₱0.00</strong><small><span class="warning-copy">Per unit</span> average</small></div><div class="stat-card"><div class="stat-top"><span class="stat-label">Top item</span><span class="stat-icon rose">★</span></div><strong id="sales-top-item">N/A</strong><small><span class="muted-copy">Best seller</span></small></div></div><div class="sales-layout"><div class="panel-card"><h3>Recent sales</h3><table class="mini-table"><thead><tr><th>ITEM</th><th>UNITS</th><th>REVENUE</th></tr></thead><tbody id="sales-table-body"></tbody></table></div><div class="panel-card"><h3>Top selling products</h3><ul id="sales-product-list" class="report-list"></ul></div></div></div></section>
      <section class="view-panel hidden" data-view="reports" id="reports"><div class="panel-shell"><div class="panel-header"><div><p class="eyebrow">REPORTS</p><h2>Store performance</h2></div></div><div class="stats-grid sales-grid" aria-label="Reports summary"><div class="stat-card"><div class="stat-top"><span class="stat-label">Inventory value</span><span class="stat-icon mint">₱</span></div><strong id="reports-inventory-value">₱0.00</strong><small><span class="trend">↗ Stock</span> value</small></div><div class="stat-card"><div class="stat-top"><span class="stat-label">Low stock</span><span class="stat-icon peach">!</span></div><strong id="reports-low-stock">0</strong><small><span class="warning-copy">Needs restock</span></small></div><div class="stat-card"><div class="stat-top"><span class="stat-label">Revenue</span><span class="stat-icon lavender">▣</span></div><strong id="reports-revenue">₱0.00</strong><small><span class="trend">↗ Sales</span> total</small></div><div class="stat-card"><div class="stat-top"><span class="stat-label">Restock alert</span><span class="stat-icon rose">◎</span></div><strong id="reports-alert-count">0</strong><small><span class="muted-copy">Watchlist</span></small></div></div><div class="sales-layout"><div class="panel-card"><h3>Best category performance</h3><ul id="report-category-list" class="report-list"></ul></div><div class="panel-card"><h3>Reorder watchlist</h3><ul id="report-watchlist" class="report-list"></ul></div></div></div></section>
    </main>
  </div>
  <div class="modal-backdrop" id="modal" hidden><form class="modal" id="product-form"><div class="modal-head"><div><p class="eyebrow">INVENTORY ITEM</p><h2 id="modal-title">Add product</h2></div><button type="button" class="close-button" id="close-modal">×</button></div><label>Product name<input name="name" required placeholder="e.g. Lucky Me Pancit Canton" /></label><div class="form-grid"><label>Category<select name="category" id="product-category"></select></label><label>Supplier<input name="supplier" placeholder="Supplier name" /></label><label>Unit<input name="unit" required placeholder="pack" /></label><label>Price (₱)<input name="price" type="number" min="0" step="0.01" required /></label><label>In stock<input name="stock" type="number" min="0" step="1" required /></label><label>Reorder level<input name="reorderLevel" type="number" min="0" step="1" value="10" /></label><label>Expiration date<input name="expirationDate" type="date" /></label></div><div class="modal-actions"><button type="button" class="secondary-button" id="cancel-modal">Cancel</button><button class="primary-button" id="product-submit" type="submit">Save product</button></div></form></div>
  <div class="modal-backdrop" id="category-modal" hidden><form class="modal" id="category-form"><div class="modal-head"><div><p class="eyebrow">PRODUCT ORGANIZATION</p><h2>Add category</h2></div><button type="button" class="close-button" id="close-category-modal">×</button></div><label>Category name<input name="category" required maxlength="32" placeholder="e.g. Snacks" /></label><p class="form-error" id="category-error" role="alert"></p><div class="category-manager"><p>Existing categories</p><div id="category-list"></div></div><div class="modal-actions"><button type="button" class="secondary-button" id="cancel-category-modal">Close</button><button class="primary-button" type="submit">Add category</button></div></form></div>
`

const $ = selector => document.querySelector(selector)
let activeView = 'inventory'
let authMode = 'login'

function showAuthGate(message = '') {
  $('#auth-gate').classList.remove('hidden')
  $('#auth-error').textContent = message
}

function hideAuthGate(user) {
  currentUser = user
  $('#auth-gate').classList.add('hidden')
  const initials = user.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
  $('#profile-button').innerHTML = `${initials} <span>⌄</span>`
  $('#profile-menu-name').textContent = user.name
  $('#profile-menu-email').textContent = user.email
  $('#sidebar-user-initials').textContent = initials
  $('#sidebar-user-name').textContent = user.name
  $('#sidebar-user-role').textContent = user.role === 'owner' ? 'Store owner' : 'Store staff'
}

$('#auth-toggle').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login'
  const registering = authMode === 'register'
  $('#auth-title').textContent = registering ? 'Create your account' : 'Welcome back'
  $('#auth-copy').textContent = registering ? 'Set up an account to manage your store.' : 'Log in to manage your store inventory.'
  $('#auth-name-field').hidden = !registering
  $('#auth-name-field input').required = registering
  $('#login-form button[type="submit"]').textContent = registering ? 'Create account' : 'Log in'
  $('#auth-toggle').textContent = registering ? 'Back to log in' : 'Create a new account'
  $('#demo-hint').hidden = registering || !import.meta.env.DEV
  $('#auth-error').textContent = ''
  $('#login-form input[name="name"]').value = ''
  $('#login-form input[name="email"]').value = registering || !import.meta.env.DEV ? '' : 'maria@tindahan.local'
  $('#login-form input[name="password"]').value = ''
  $('#auth-password').type = 'password'
  $('#password-toggle').setAttribute('aria-label', 'Show password')
  $('#password-toggle').setAttribute('title', 'Show password')
  $('#password-toggle').setAttribute('aria-pressed', 'false')
})

$('#password-toggle').addEventListener('click', () => {
  const passwordInput = $('#auth-password')
  const showPassword = passwordInput.type === 'password'
  passwordInput.type = showPassword ? 'text' : 'password'
  $('#password-toggle').setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password')
  $('#password-toggle').setAttribute('title', showPassword ? 'Hide password' : 'Show password')
  $('#password-toggle').setAttribute('aria-pressed', String(showPassword))
  passwordInput.focus()
})

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const button = event.currentTarget.querySelector('button')
  button.disabled = true
  $('#auth-error').textContent = ''

  try {
    const result = await fetchJson(`/api/auth/${authMode}`, {
      method: 'POST',
      body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') }),
    })
    authToken = result.token
    localStorage.setItem('tindahan-auth-token', authToken)
    hideAuthGate(result.user)
    await refreshInventory()
  } catch (error) {
    $('#auth-error').textContent = error.message
  } finally {
    button.disabled = false
  }
})

$('#profile-button').addEventListener('click', () => {
  const menu = $('#profile-menu')
  const isOpen = !menu.hidden
  menu.hidden = isOpen
  $('#profile-button').setAttribute('aria-expanded', String(!isOpen))
})

document.addEventListener('click', event => {
  if (event.target.closest('.profile-menu-wrap')) return
  $('#profile-menu').hidden = true
  $('#profile-button').setAttribute('aria-expanded', 'false')
})

$('#menu-signout').addEventListener('click', async () => {
  if (!window.confirm('Are you sure you want to sign out?')) return

  await fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {})
  authToken = null
  currentUser = null
  localStorage.removeItem('tindahan-auth-token')
  $('#profile-menu').hidden = true
  $('#profile-button').setAttribute('aria-expanded', 'false')
  showAuthGate('')
})

async function initializeApp() {
  if (!authToken) {
    showAuthGate()
    return
  }

  try {
    const session = await fetchJson('/api/auth/session')
    hideAuthGate(session.user)
    await refreshInventory()
  } catch {
    showAuthGate('Please log in to continue.')
  }
}

function updateLiveDate() {
  const dateLabel = document.querySelector('.date-label')
  if (!dateLabel) return

  const now = new Date()
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now)

  dateLabel.textContent = formatted
}

function focusVisibleStatus(status) {
  const row = document.querySelector(`#product-rows tr[data-status="${status}"]`)
  if (!row) return
  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  row.classList.add('row-highlight')
  setTimeout(() => row.classList.remove('row-highlight'), 1600)
}

function syncViewPanels() {
  document.querySelectorAll('.view-panel').forEach(panel => {
    const isVisible = panel.dataset.view === activeView
    panel.classList.toggle('hidden', !isVisible)
  })
  document.querySelectorAll('.nav-item').forEach(link => {
    const isActive = link.dataset.view === activeView
    link.classList.toggle('active', isActive)
  })
}

function renderSalesView() {
  const productSales = products.filter(product => (Number(product.sold) || 0) > 0).sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0))
  const totalRevenue = productSales.reduce((sum, product) => sum + (Number(product.price) * (Number(product.sold) || 0)), 0)
  const totalUnits = productSales.reduce((sum, product) => sum + (Number(product.sold) || 0), 0)
  const averageSale = totalUnits ? totalRevenue / totalUnits : 0
  const topSeller = productSales[0]

  $('#sales-total-revenue').textContent = peso(totalRevenue)
  $('#sales-units').textContent = totalUnits
  $('#sales-average').textContent = peso(averageSale)
  $('#sales-top-item').textContent = topSeller ? topSeller.name : 'N/A'
  $('#sales-table-body').innerHTML = productSales.length ? productSales.slice(0, 5).map(product => `<tr><td>${product.name}</td><td>${product.sold}</td><td>${peso(product.price * product.sold)}</td></tr>`).join('') : '<tr><td colspan="3">No sales yet</td></tr>'
  $('#sales-product-list').innerHTML = productSales.length ? productSales.slice(0, 5).map(product => `<li><span>${product.name}</span><strong>${product.sold} sold</strong></li>`).join('') : '<li>No sales recorded yet.</li>'
}

function renderReportsView() {
  const inventoryValue = products.reduce((sum, product) => sum + product.price * product.stock, 0)
  const watchList = products.filter(product => product.stock > 0 && product.stock <= getReorderLevel(product))
  const revenue = products.reduce((sum, product) => sum + (Number(product.price) * (Number(product.sold) || 0)), 0)
  const categoryPerformance = categories.map(category => {
    const categoryProducts = products.filter(product => product.category === category)
    const revenueValue = categoryProducts.reduce((sum, product) => sum + Number(product.price) * (Number(product.sold) || 0), 0)
    return { category, revenueValue }
  }).sort((a, b) => b.revenueValue - a.revenueValue)

  $('#reports-inventory-value').textContent = peso(inventoryValue)
  $('#reports-low-stock').textContent = watchList.length
  $('#reports-revenue').textContent = peso(revenue)
  $('#reports-alert-count').textContent = watchList.length
  $('#report-category-list').innerHTML = categoryPerformance.length ? categoryPerformance.map(item => `<li><span>${item.category}</span><strong>${peso(item.revenueValue)}</strong></li>`).join('') : '<li>No category data yet.</li>'
  $('#report-watchlist').innerHTML = watchList.length ? watchList.map(product => `<li><span>${product.name}</span><strong>${product.stock} left</strong></li>`).join('') : '<li>No items need restocking.</li>'
}

function render() {
  let visible = products.filter(product => product.name.toLowerCase().includes(query.toLowerCase()) && (activeCategory === 'All items' || product.category === activeCategory))
  if (activeStockFilter === 'low') visible = visible.filter(product => product.stock > 0 && product.stock <= getReorderLevel(product))
  if (activeStockFilter === 'out') visible = visible.filter(product => product.stock === 0)
  if (sortByValue) visible.sort((first, second) => (second.price * second.stock) - (first.price * first.stock))

  const value = products.reduce((sum, product) => sum + product.price * product.stock, 0)
  const totalSales = products.reduce((sum, product) => sum + (Number(product.sold) || 0), 0)
  const bestSeller = products.reduce((best, product) => {
    if (!best || (Number(product.sold) || 0) > (Number(best.sold) || 0)) return product
    return best
  }, null)

  $('#total-products').textContent = products.length
  $('#inventory-value').textContent = peso(value)
  $('#low-stock').textContent = products.filter(product => product.stock > 0 && product.stock <= getReorderLevel(product)).length
  $('#out-of-stock').textContent = products.filter(product => product.stock === 0).length
  $('#total-sales').textContent = totalSales
  $('#best-seller').textContent = bestSeller ? bestSeller.name : 'No sales yet'
  $('#product-count').textContent = products.length
  $('#category-filters').innerHTML = `<button class="filter ${activeCategory === 'All items' ? 'active' : ''}" data-category="All items">All items <b id="all-count">${products.length}</b></button>${categories.map(category => `<button class="filter ${activeCategory === category ? 'active' : ''}" data-category="${category}">${category}</button>`).join('')}`
  $('#product-category').innerHTML = categories.map(category => `<option>${category}</option>`).join('')
  $('#category-list').innerHTML = categories.map(category => {
    const productCount = products.filter(product => product.category === category).length
    return `<div class="category-manager-row category-select-row" data-category-select="${category}" role="button" tabindex="0" title="View ${category} products"><span>${category}<small>${productCount} product${productCount === 1 ? '' : 's'}</small></span><button type="button" class="delete-category" data-category-delete="${category}" ${productCount ? 'disabled title="Remove products from this category before deleting it"' : 'title="Delete category"'}>×</button></div>`
  }).join('')

  $('#showing-count').textContent = `Showing ${visible.length} of ${products.length} products`
  $('#empty-state').hidden = visible.length > 0
  $('#product-rows').innerHTML = visible.map(product => {
    const [label, className] = statusFor(product.stock, getReorderLevel(product))
    const [expirationLabel, expirationClass] = expirationFor(product.expirationDate)
    return `<tr data-status="${className}" data-id="${product.id}"><td><div class="product-cell"><span class="product-icon ${product.tone}">${product.icon}</span><strong>${product.name}</strong></div></td><td><span class="category-pill">${product.category}</span></td><td>${peso(product.price)} <small>/ ${product.unit}</small></td><td><div class="stock-control"><button data-action="decrease" data-id="${product.id}" aria-label="Decrease stock">−</button><strong>${product.stock}</strong><button data-action="increase" data-id="${product.id}" aria-label="Increase stock">＋</button><button class="sell-button" data-action="sell" data-id="${product.id}" aria-label="Sell one item">Sell</button></div></td><td><span class="status ${className}"><i></i>${label}</span></td><td><span class="expiration ${expirationClass}">${expirationLabel}</span>${product.expirationDate ? `<small class="expiration-date">${product.expirationDate}</small>` : ''}</td><td class="updated">${product.updated}</td><td class="row-actions"><button class="row-menu edit-menu" data-action="edit" data-id="${product.id}" title="Edit product">Edit</button><button class="row-menu delete-menu" data-action="delete" data-id="${product.id}" title="Delete product" aria-label="Delete product">×</button></td></tr>`
  }).join('')

  if (activeStockFilter === 'low') {
    requestAnimationFrame(() => focusVisibleStatus('low'))
  } else if (activeStockFilter === 'out') {
    requestAnimationFrame(() => focusVisibleStatus('out'))
  }
}

function openModal(product = null) {
  editingId = product?.id || null
  $('#modal-title').textContent = product ? 'Edit product' : 'Add product'
  $('#product-submit').textContent = product ? 'Save changes' : 'Save product'
  const form = $('#product-form')
  form.reset()
  if (product) {
    Object.entries(product).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value
    })
  }
  $('#modal').hidden = false
  form.elements.name.focus()
}

function closeModal() {
  $('#modal').hidden = true
  editingId = null
}

async function editProductFields(productId, updates = {}) {
  const product = products.find(item => item.id === Number(productId))
  if (!product) {
    throw new Error('Product not found.')
  }

  const payload = {
    ...product,
    ...updates,
    updated: 'Just now',
  }

  const savedProduct = await fetchJson(`${API_PRODUCTS}/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })

  products = products.map(item => item.id === Number(productId) ? savedProduct : item)
  return savedProduct
}

async function createOrUpdateProduct(payload) {
  const url = editingId ? `${API_PRODUCTS}/${editingId}` : API_PRODUCTS
  const method = editingId ? 'PUT' : 'POST'
  return fetchJson(url, {
    method,
    body: JSON.stringify(payload),
  })
}

$('#search').addEventListener('input', event => {
  query = event.target.value
  render()
})

$('#category-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-category]')
  if (!button) return
  activeCategory = button.dataset.category
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button))
  render()
})

document.querySelector('.stats-grid').addEventListener('click', event => {
  const card = event.target.closest('[data-summary]')
  if (!card) return
  activeStockFilter = card.dataset.summary === 'low' || card.dataset.summary === 'out' ? card.dataset.summary : 'all'
  sortByValue = card.dataset.summary === 'value'
  activeCategory = 'All items'
  query = ''
  $('#search').value = ''
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item.dataset.category === 'All items'))
  document.querySelectorAll('[data-summary]').forEach(item => item.classList.toggle('selected', item === card))
  render()
})

$('#add-product').addEventListener('click', () => openModal())
$('#close-modal').addEventListener('click', closeModal)
$('#cancel-modal').addEventListener('click', closeModal)
$('#modal').addEventListener('click', event => {
  if (event.target.id === 'modal') closeModal()
})

$('#add-category').addEventListener('click', () => {
  $('#category-modal').hidden = false
  $('#category-error').textContent = ''
  $('#category-form').elements.category.focus()
})

$('#close-category-modal').addEventListener('click', () => {
  $('#category-modal').hidden = true
})

$('#cancel-category-modal').addEventListener('click', () => {
  $('#category-modal').hidden = true
})

$('#category-modal').addEventListener('click', event => {
  if (event.target.id === 'category-modal') event.currentTarget.hidden = true
})

function selectCategory(category) {
  activeCategory = category
  activeStockFilter = 'all'
  sortByValue = false
  $('#category-modal').hidden = true
  activeView = 'inventory'
  syncViewPanels()
  render()
}

$('#category-list').addEventListener('click', async event => {
  const categoryRow = event.target.closest('[data-category-select]')
  if (categoryRow && !event.target.closest('[data-category-delete]')) {
    selectCategory(categoryRow.dataset.categorySelect)
    return
  }

  const button = event.target.closest('[data-category-delete]')
  if (!button || button.disabled) return

  const category = button.dataset.categoryDelete
  if (!confirm(`Delete the ${category} category?`)) return

  try {
    await fetchJson(`${API_CATEGORIES}/${encodeURIComponent(category)}`, { method: 'DELETE' })
    categories = categories.filter(item => item !== category)
    if (activeCategory === category) activeCategory = 'All items'
    $('#category-modal').hidden = true
    render()
  } catch (error) {
    alert(error.message)
  }
})

$('#category-list').addEventListener('keydown', event => {
  const categoryRow = event.target.closest('[data-category-select]')
  if (!categoryRow || event.target.closest('[data-category-delete]')) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  selectCategory(categoryRow.dataset.categorySelect)
})

$('#category-form').addEventListener('submit', async event => {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  const name = String(formData.get('category') || '').trim()

  if (!name) {
    $('#category-error').textContent = 'Enter a category name.'
    return
  }

  if (categories.some(category => category.toLowerCase() === name.toLowerCase())) {
    $('#category-error').textContent = 'This category already exists.'
    return
  }

  try {
    const savedCategory = await fetchJson(API_CATEGORIES, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })

    categories = [...new Set([...categories, savedCategory.name || name])]
    activeCategory = savedCategory.name || name
    event.currentTarget.reset()
    $('#category-modal').hidden = true
    render()
  } catch (error) {
    alert(error.message)
  }
})

$('#product-form').addEventListener('submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.currentTarget))
  const existing = products.find(product => product.id === editingId)

  const payload = {
    id: editingId || Date.now(),
    name: data.name,
    category: data.category,
    unit: data.unit,
    supplier: data.supplier || 'Unknown',
    price: Number(data.price),
    stock: Number(data.stock),
    reorderLevel: Number(data.reorderLevel || 10),
    sold: Number(existing?.sold || 0),
    expirationDate: data.expirationDate || '',
    updated: 'Just now',
    icon: data.name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase(),
    tone: existing?.tone || ['coral', 'blue', 'green', 'yellow'][products.length % 4],
  }

  try {
    const savedProduct = await createOrUpdateProduct(payload)
    products = editingId ? products.map(item => item.id === editingId ? savedProduct : item) : [savedProduct, ...products]
    closeModal()
    renderSalesView()
    renderReportsView()
    render()
  } catch (error) {
    alert(error.message)
  }
})

$('#product-rows').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]')
  if (!button) return

  const product = products.find(item => item.id === Number(button.dataset.id))
  if (!product) return

  if (button.dataset.action === 'edit') {
    openModal(product)
    return
  }

  if (button.dataset.action === 'delete') {
    if (!confirm(`Delete ${product.name}?`)) return

    try {
      await fetchJson(`${API_PRODUCTS}/${product.id}`, { method: 'DELETE' })
      products = products.filter(item => item.id !== product.id)
      renderSalesView()
      renderReportsView()
      render()
    } catch (error) {
      alert(error.message)
    }
    return
  }

  try {
    if (button.dataset.action === 'sell') {
      await editProductFields(product.id, {
        stock: Math.max(0, product.stock - 1),
        sold: (Number(product.sold) || 0) + 1,
      })
    } else {
      await editProductFields(product.id, {
        stock: Math.max(0, product.stock + (button.dataset.action === 'increase' ? 1 : -1)),
      })
    }

    renderSalesView()
    renderReportsView()
    render()
  } catch (error) {
    alert(error.message)
  }
})

$('#export-products').addEventListener('click', () => {
  const csv = ['Product,Category,Supplier,Price,Unit,Stock,Reorder Level,Expiration Date,Sales,Status', ...products.map(product => `${product.name},${product.category},${product.supplier || ''},${product.price},${product.unit},${product.stock},${getReorderLevel(product)},${product.expirationDate || ''},${product.sold || 0},${statusFor(product.stock, getReorderLevel(product))[0]}`)].join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = 'tindahan-inventory.csv'
  link.click()
  URL.revokeObjectURL(link.href)
})

document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault()
    activeView = link.dataset.view
    syncViewPanels()
  })
})

updateLiveDate()
setInterval(updateLiveDate, 1000)
initializeApp()

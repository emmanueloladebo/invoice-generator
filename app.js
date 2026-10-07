const DEFAULT_SERVICES = [
  { id: 'shirt', name: 'Dress shirt', category: 'Corporate', price: 1200 }, { id: 'tshirt', name: 'T-shirt', category: 'Corporate', price: 800 },
  { id: 'roundneck', name: 'Round neck', category: 'Corporate', price: 800 }, { id: 'jeans', name: 'Jeans', category: 'Corporate', price: 1500 },
  { id: 'trousers', name: 'Trousers', category: 'Corporate', price: 1200 }, { id: 'corporate-suit', name: 'Corporate suit', category: 'Corporate', price: 2500 },
  { id: 'native', name: 'Native wear', category: 'Traditional', price: 1800 }, { id: 'agbada', name: 'Agbada', category: 'Traditional', price: 4000 },
  { id: 'gown', name: 'Traditional gown', category: 'Traditional', price: 2500 }, { id: 'kaftan', name: 'Kaftan', category: 'Traditional', price: 2200 },
  { id: 'gele', name: 'Gele', category: 'Traditional', price: 700 }, { id: 'two-piece', name: 'Two-piece set', category: 'Traditional', price: 2500 },
];
const DEFAULT_BUSINESS = {
  name: 'Anuoluwapo Laundry',
  accountNumber: '0123456789',
  bankName: 'OPay',
  accountName: 'Anuoluwapo Laundry'
};

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const readStore = (key, fallback) => { try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : fallback; } catch { return fallback; } };
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

let services = readStore('anuoluwapo-laundry-services', readStore('washly-services', DEFAULT_SERVICES));
let invoices = readStore('anuoluwapo-laundry-invoices', readStore('washly-invoices', [])).map(invoice => {
  const { address, ...client } = invoice.client || {};
  return { ...invoice, client };
});
const storedBusiness = readStore('anuoluwapo-laundry-business', null);
let business = {
  name: storedBusiness?.name || DEFAULT_BUSINESS.name,
  accountNumber: (storedBusiness?.accountNumber !== undefined && storedBusiness?.accountNumber !== null) ? storedBusiness.accountNumber : DEFAULT_BUSINESS.accountNumber,
  bankName: (storedBusiness?.bankName !== undefined && storedBusiness?.bankName !== null) ? storedBusiness.bankName : DEFAULT_BUSINESS.bankName,
  accountName: (storedBusiness?.accountName !== undefined && storedBusiness?.accountName !== null) ? storedBusiness.accountName : DEFAULT_BUSINESS.accountName,
};
let cart = [];
let tfareEnabled = false;
let tfareAmount = 0;
let activeCategory = 'Corporate';
let newItemCategory = 'Corporate';
let activeInvoice = null;
let historyFilter = 'all';
let deferredInstallPrompt = null;

// Privacy migration: address data is no longer collected or retained in saved invoices.
localStorage.setItem('anuoluwapo-laundry-invoices', JSON.stringify(invoices));
localStorage.removeItem('washly-invoices');

function saveServices() { localStorage.setItem('anuoluwapo-laundry-services', JSON.stringify(services)); }
function saveInvoices() { localStorage.setItem('anuoluwapo-laundry-invoices', JSON.stringify(invoices)); updateHistoryBadge(); }
function saveBusiness() { localStorage.setItem('anuoluwapo-laundry-business', JSON.stringify(business)); renderBusinessBranding(); }
function formatMoney(amount) { return money.format(Number(amount) || 0).replace('NGN', '₦').trim(); }
function nowLabel(date = new Date()) { return date.toLocaleDateString('en-NG', { weekday:'short', day:'numeric', month:'short' }) + ' · ' + date.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' }); }
function shortDate(dateString) { return new Date(dateString).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }); }
function cartTotal() { return cart.reduce((sum, item) => sum + item.price * item.quantity, 0); }
function itemTotal() { return cart.reduce((sum, item) => sum + item.quantity, 0); }
function getActiveTfare() { return tfareEnabled ? Math.max(0, Number(tfareAmount) || 0) : 0; }
function orderTotal() { return cartTotal() + getActiveTfare(); }
function makeInvoiceNumber(date = new Date()) {
  const count = Number(localStorage.getItem('anuoluwapo-laundry-invoice-sequence') || localStorage.getItem('washly-invoice-sequence') || 0) + 1;
  localStorage.setItem('anuoluwapo-laundry-invoice-sequence', String(count));
  const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `WLY-${month}-${String(count).padStart(4, '0')}`;
}
function renderBusinessBranding() {
  document.title = `${business.name} — Invoices`;
  document.querySelectorAll('[data-business-name]').forEach(node => { node.textContent = business.name.toUpperCase(); });
  if ($('#businessName')) $('#businessName').value = business.name || '';
  if ($('#accountNumber')) $('#accountNumber').value = business.accountNumber || '';
  if ($('#bankName')) $('#bankName').value = business.bankName || '';
  if ($('#accountName')) $('#accountName').value = business.accountName || '';
}

function renderCatalog() {
  const selection = services.filter(service => service.category === activeCategory);
  $('#catalog').innerHTML = selection.length ? selection.map(service => {
    const isSelected = cart.some(item => item.id === service.id);
    return `<button class="piece-card ${isSelected ? 'selected' : ''}" data-service-id="${escapeHtml(service.id)}"><strong>${escapeHtml(service.name)}</strong><span>${formatMoney(service.price)} / piece</span></button>`;
  }).join('') : `<p style="grid-column:1/-1;color:#87928e;font-size:12px">No ${escapeHtml(activeCategory.toLowerCase())} services yet. Add one from the price list.</p>`;
}
function renderCart() {
  const hasItems = cart.length > 0;
  const currentTfare = getActiveTfare();
  const total = orderTotal();

  $('#emptyOrder').style.display = hasItems ? 'none' : 'flex';
  $('#orderList').classList.toggle('has-items', hasItems);
  $('#orderList').innerHTML = cart.map(item => `<div class="order-item"><div><span class="order-item-name">${escapeHtml(item.name)}</span><span class="order-item-unit">${formatMoney(item.price)} each</span></div><div class="quantity-control"><button data-cart-action="subtract" data-id="${escapeHtml(item.id)}" aria-label="Remove one ${escapeHtml(item.name)}">−</button><span>${item.quantity}</span><button data-cart-action="add" data-id="${escapeHtml(item.id)}" aria-label="Add one ${escapeHtml(item.name)}">+</button></div><strong class="item-subtotal">${formatMoney(item.price * item.quantity)}</strong></div>`).join('');
  $('#itemCount').textContent = `${itemTotal()} ${itemTotal() === 1 ? 'item' : 'items'}`;

  const breakdownEl = $('#orderBreakdown');
  if (breakdownEl) {
    if (currentTfare > 0 && hasItems) {
      breakdownEl.hidden = false;
      $('#itemsSubtotal').textContent = formatMoney(cartTotal());
      $('#tfareSubtotal').textContent = formatMoney(currentTfare);
    } else {
      breakdownEl.hidden = true;
    }
  }

  document.querySelectorAll('[data-tfare-preset]').forEach(chip => {
    const val = Number(chip.dataset.tfarePreset);
    chip.classList.toggle('active', tfareEnabled && tfareAmount === val);
  });

  $('#totalAmount').textContent = formatMoney(total);
  $('#footerTotal').textContent = formatMoney(total);
  renderCatalog();
}
function addService(id) {
  const existing = cart.find(item => item.id === id);
  if (existing) existing.quantity += 1;
  else { const service = services.find(item => item.id === id); if (service) cart.push({ ...service, quantity: 1 }); }
  renderCart();
}
function adjustCart(id, amount) { const item = cart.find(entry => entry.id === id); if (!item) return; item.quantity += amount; if (item.quantity < 1) cart = cart.filter(entry => entry.id !== id); renderCart(); }
function openModal(id) { $(`#${id}`).classList.add('open'); $(`#${id}`).setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(`#${id}`).classList.remove('open'); $(`#${id}`).setAttribute('aria-hidden', 'true'); if (!document.querySelector('.modal-backdrop.open')) document.body.style.overflow = ''; }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2600); }

function updateHistoryBadge() {
  const badge = $('#historyBadge');
  badge.textContent = invoices.length > 99 ? '99+' : invoices.length;
  badge.hidden = invoices.length === 0;
}
function renderPriceEditor() {
  const groups = ['Corporate', 'Traditional', 'Custom'];
  $('#priceEditor').innerHTML = groups.map(category => {
    const items = services.filter(service => service.category === category);
    return items.length ? `<div class="price-group"><h3>${category}</h3>${items.map(service => `<div class="price-row"><label>${escapeHtml(service.name)}</label><input class="price-input" type="number" min="0" inputmode="numeric" data-price-id="${escapeHtml(service.id)}" value="${service.price}" aria-label="Price for ${escapeHtml(service.name)}" /><button class="delete-service" data-delete-id="${escapeHtml(service.id)}" aria-label="Delete ${escapeHtml(service.name)}">×</button></div>`).join('')}</div>` : '';
  }).join('');
}
function createInvoice() {
  const createdAt = new Date();
  const appliedTfare = getActiveTfare();
  const invoice = {
    id: globalThis.crypto?.randomUUID?.() || `invoice-${Date.now()}`,
    invoiceNo: makeInvoiceNumber(createdAt),
    createdAt: createdAt.toISOString(),
    status: 'open',
    client: { name: $('#clientName').value.trim() || 'Walk-in client', phone: $('#clientPhone').value.trim() },
    items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
    tfare: appliedTfare,
    total: cartTotal() + appliedTfare,
    accountNumber: business.accountNumber || '',
    bankName: business.bankName || '',
    accountName: business.accountName || '',
  };
  invoices.unshift(invoice); activeInvoice = invoice; saveInvoices(); renderInvoicePreview(invoice); return invoice;
}
function renderInvoicePreview(invoice) {
  if (!invoice) return;
  const paid = invoice.status === 'paid';
  const client = invoice.client || {};
  const tfare = Number(invoice.tfare || 0);
  const accountNumber = invoice.accountNumber || business.accountNumber || '';
  const bankName = invoice.bankName || business.bankName || '';
  const accountName = invoice.accountName || business.accountName || '';

  const linesHtml = invoice.items.map(item => `<div class="invoice-line"><span>${escapeHtml(item.name)} <small>× ${item.quantity}</small></span><span>${formatMoney(item.price * item.quantity)}</span></div>`).join('');
  const tfareHtml = tfare > 0 ? `<div class="invoice-line invoice-line-tfare"><span>Tfare (Transport)</span><span>${formatMoney(tfare)}</span></div>` : '';

  const paymentBoxHtml = accountNumber ? `
    <div class="invoice-payment-box">
      <div class="payment-box-head">
        <span class="payment-box-title">PAYMENT DETAILS</span>
        <button type="button" class="copy-account-btn" data-account="${escapeHtml(accountNumber)}" aria-label="Copy account number">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span class="copy-text">Copy account</span>
        </button>
      </div>
      <div class="payment-account-number">${escapeHtml(accountNumber)}</div>
      <div class="payment-account-meta">
        ${bankName ? `<span class="payment-bank"><strong>Bank:</strong> ${escapeHtml(bankName)}</span>` : ''}
        ${accountName ? `<span class="payment-name"><strong>Name:</strong> ${escapeHtml(accountName)}</span>` : ''}
      </div>
    </div>
  ` : '';

  $('#invoicePreview').innerHTML = `<div class="invoice-brand"><div class="brand"><span class="brand-mark">A</span><strong>${escapeHtml(business.name.toUpperCase())}</strong></div><span class="invoice-tag">${paid ? 'PAID' : 'INVOICE'}</span></div><h2 class="invoice-title">Laundry receipt</h2><div class="invoice-meta">${escapeHtml(invoice.invoiceNo)}<br>${nowLabel(new Date(invoice.createdAt))}</div><div class="invoice-client"><b>Billed to</b><br>${escapeHtml(client.name || 'Walk-in client')}${client.phone ? `<br>${escapeHtml(client.phone)}` : ''}</div><div class="invoice-lines">${linesHtml}${tfareHtml}</div><div class="invoice-grand-total"><span>TOTAL ${paid ? 'PAID' : 'DUE'}</span><strong>${formatMoney(invoice.total)}</strong></div>${paymentBoxHtml}<p class="invoice-note">Thank you for choosing ${escapeHtml(business.name)}. We handle your things with care.</p>`;
  const statusButton = $('#markPaidButton'); statusButton.textContent = paid ? 'Marked as paid' : 'Mark invoice as paid'; statusButton.classList.toggle('is-paid', paid); statusButton.disabled = paid;
}
function renderHistory() {
  const query = $('#historySearch').value.trim().toLowerCase();
  const shown = invoices.filter(invoice => {
    const matchStatus = historyFilter === 'all' || invoice.status === historyFilter;
    const searchable = `${invoice.invoiceNo} ${invoice.client?.name || ''} ${invoice.client?.phone || ''}`.toLowerCase();
    return matchStatus && (!query || searchable.includes(query));
  });
  const paid = invoices.filter(invoice => invoice.status === 'paid');
  const open = invoices.filter(invoice => invoice.status !== 'paid');
  $('#historyOverview').innerHTML = `<div class="history-stat"><span>Invoices</span><strong>${invoices.length}</strong></div><div class="history-stat"><span>Open value</span><strong>${formatMoney(open.reduce((sum, invoice) => sum + invoice.total, 0))}</strong></div><div class="history-stat"><span>Paid value</span><strong>${formatMoney(paid.reduce((sum, invoice) => sum + invoice.total, 0))}</strong></div>`;
  $('#historyList').innerHTML = shown.length ? shown.map(invoice => `<button class="history-card" data-open-invoice="${escapeHtml(invoice.id)}"><span class="history-card-main"><span class="history-card-title">${escapeHtml(invoice.client?.name || 'Walk-in client')}</span><span class="history-card-meta">${escapeHtml(invoice.invoiceNo)} · ${shortDate(invoice.createdAt)}</span></span><span class="history-card-total"><strong>${formatMoney(invoice.total)}</strong><span class="status-pill ${invoice.status === 'paid' ? 'paid' : ''}">${invoice.status === 'paid' ? 'Paid' : 'Open'}</span></span></button>`).join('') : `<div class="empty-history">No matching invoices yet.</div>`;
}
function openSavedInvoice(id) {
  const invoice = invoices.find(entry => entry.id === id); if (!invoice) return;
  activeInvoice = invoice; renderInvoicePreview(invoice); closeModal('historyModal'); openModal('invoiceModal');
}
function markActiveInvoicePaid() {
  if (!activeInvoice || activeInvoice.status === 'paid') return;
  activeInvoice.status = 'paid';
  invoices = invoices.map(invoice => invoice.id === activeInvoice.id ? activeInvoice : invoice);
  saveInvoices(); renderInvoicePreview(activeInvoice); renderHistory(); toast('Invoice marked as paid');
}
async function createReceiptImage(invoice) {
  const width = 1080, padding = 76, row = 59, client = invoice.client || {};
  const tfare = Number(invoice.tfare || 0);
  const accountNumber = invoice.accountNumber || business.accountNumber || '';
  const bankName = invoice.bankName || business.bankName || '';
  const accountName = invoice.accountName || business.accountName || '';
  const hasAccount = Boolean(accountNumber);

  let extraHeight = 0;
  if (tfare > 0) extraHeight += row;
  if (hasAccount) extraHeight += 160;
  if (client.phone) extraHeight += 28;

  const height = 580 + invoice.items.length * row + extraHeight;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#153d36'; ctx.font = '800 31px Manrope, Arial'; ctx.fillText(`◒  ${business.name.toUpperCase()}`, padding, 86);
  ctx.fillStyle = '#578179'; ctx.font = '700 20px Manrope, Arial'; ctx.fillText('LAUNDRY INVOICE', padding, 128);
  ctx.strokeStyle = '#d9e1db'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padding, 158); ctx.lineTo(width - padding, 158); ctx.stroke();
  ctx.fillStyle = '#7c8985'; ctx.font = '600 18px Manrope, Arial'; ctx.fillText(`${invoice.invoiceNo} · ${nowLabel(new Date(invoice.createdAt))}`, padding, 204);
  ctx.fillStyle = '#10282a'; ctx.font = '700 27px Manrope, Arial'; ctx.fillText(client.name || 'Walk-in client', padding, 255);
  if (client.phone) { ctx.fillStyle = '#71807c'; ctx.font = '19px Manrope, Arial'; ctx.fillText(client.phone, padding, 283); }

  let y = 349; ctx.fillStyle = '#59716c'; ctx.font = '700 16px Manrope, Arial'; ctx.fillText('ITEM', padding, y); ctx.textAlign = 'right'; ctx.fillText('AMOUNT', width - padding, y); ctx.textAlign = 'left';
  y += 31; ctx.strokeStyle = '#dfe6e0'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 42;

  invoice.items.forEach(item => {
    ctx.fillStyle = '#1e3c3b'; ctx.font = '700 21px Manrope, Arial'; ctx.fillText(`${item.name} × ${item.quantity}`, padding, y);
    ctx.textAlign = 'right'; ctx.font = '600 19px Manrope, Arial'; ctx.fillText(formatMoney(item.price * item.quantity), width - padding, y);
    ctx.textAlign = 'left'; y += row;
  });

  if (tfare > 0) {
    ctx.fillStyle = '#22584c'; ctx.font = '700 21px Manrope, Arial'; ctx.fillText('Tfare (Transport)', padding, y);
    ctx.textAlign = 'right'; ctx.font = '600 19px Manrope, Arial'; ctx.fillText(formatMoney(tfare), width - padding, y);
    ctx.textAlign = 'left'; y += row;
  }

  ctx.strokeStyle = '#9cafaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padding, y - 22); ctx.lineTo(width - padding, y - 22); ctx.stroke();
  ctx.fillStyle = '#58706b'; ctx.font = '700 17px Manrope, Arial'; ctx.fillText(`TOTAL ${invoice.status === 'paid' ? 'PAID' : 'DUE'}`, padding, y + 29);
  ctx.textAlign = 'right'; ctx.fillStyle = '#10282a'; ctx.font = '800 39px Manrope, Arial'; ctx.fillText(formatMoney(invoice.total), width - padding, y + 33);
  ctx.textAlign = 'left';

  if (hasAccount) {
    y += 75;
    const boxWidth = width - (padding * 2);
    ctx.fillStyle = '#f4f8f6';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(padding, y, boxWidth, 116, 14);
    else ctx.rect(padding, y, boxWidth, 116);
    ctx.fill();
    ctx.strokeStyle = '#d5e4dc'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = '#4f7468'; ctx.font = '800 14px Manrope, Arial'; ctx.fillText('PAYMENT DETAILS', padding + 24, y + 33);
    ctx.fillStyle = '#10282a'; ctx.font = '800 25px Manrope, Arial'; ctx.fillText(`Account Number: ${accountNumber}`, padding + 24, y + 68);
    const metaParts = [];
    if (bankName) metaParts.push(`Bank: ${bankName}`);
    if (accountName) metaParts.push(`Account Name: ${accountName}`);
    if (metaParts.length) {
      ctx.fillStyle = '#506862'; ctx.font = '600 17px Manrope, Arial'; ctx.fillText(metaParts.join('   ·   '), padding + 24, y + 98);
    }
  }

  ctx.fillStyle = '#889590'; ctx.font = '17px Manrope, Arial'; ctx.fillText(`Thank you for choosing ${business.name}. We handle your things with care.`, padding, height - 38);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
async function shareInvoice() {
  if (!activeInvoice) return;
  const client = activeInvoice.client || {};
  const tfare = Number(activeInvoice.tfare || 0);
  const accountNumber = activeInvoice.accountNumber || business.accountNumber || '';
  const bankName = activeInvoice.bankName || business.bankName || '';
  const accountName = activeInvoice.accountName || business.accountName || '';

  const lines = activeInvoice.items.map(item => `• ${item.name} × ${item.quantity} — ${formatMoney(item.price * item.quantity)}`).join('\n');
  const tfareLine = tfare > 0 ? `\n• Tfare (Transport) — ${formatMoney(tfare)}` : '';
  const paymentInfo = accountNumber ? `\n\nPAYMENT DETAILS:\n• Account Number: ${accountNumber}${bankName ? `\n• Bank: ${bankName}` : ''}${accountName ? `\n• Account Name: ${accountName}` : ''}` : '';

  const text = `${business.name.toUpperCase()} INVOICE · ${activeInvoice.invoiceNo}\n${nowLabel(new Date(activeInvoice.createdAt))}\nFor: ${client.name || 'Walk-in client'}\n\n${lines}${tfareLine}\n\nTOTAL: ${formatMoney(activeInvoice.total)}${paymentInfo}\n\nThank you for choosing ${business.name}.`;
  try {
    if (navigator.share) {
      const image = await createReceiptImage(activeInvoice);
      const file = image && new File([image], `${activeInvoice.invoiceNo}.png`, { type:'image/png' });
      await navigator.share(file && navigator.canShare?.({ files:[file] }) ? { title:`${business.name} invoice`, text, files:[file] } : { title:`${business.name} invoice`, text });
    } else {
      await navigator.clipboard.writeText(text);
      toast('Invoice copied to clipboard');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('Could not share the invoice');
  }
}

$('#dateChip').textContent = nowLabel(); setInterval(() => $('#dateChip').textContent = nowLabel(), 30000);
renderBusinessBranding(); renderCatalog(); renderCart(); updateHistoryBadge();

$('#tfareToggle')?.addEventListener('change', event => {
  tfareEnabled = event.target.checked;
  const input = $('#tfareAmount');
  const presets = $('#tfarePresets');
  if (input) input.disabled = !tfareEnabled;
  if (presets) presets.hidden = !tfareEnabled;
  if (tfareEnabled) {
    if (input) {
      input.focus();
      if (!input.value && tfareAmount > 0) input.value = tfareAmount;
    }
  }
  renderCart();
});

$('#tfareAmount')?.addEventListener('input', event => {
  tfareAmount = Math.max(0, Number(event.target.value) || 0);
  renderCart();
});

document.addEventListener('click', event => {
  const serviceCard = event.target.closest('[data-service-id]'); if (serviceCard) addService(serviceCard.dataset.serviceId);
  const action = event.target.closest('[data-cart-action]'); if (action) adjustCart(action.dataset.id, action.dataset.cartAction === 'add' ? 1 : -1);
  const tab = event.target.closest('.category-tab'); if (tab) { activeCategory = tab.dataset.category; document.querySelectorAll('.category-tab').forEach(item => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', active); }); renderCatalog(); }
  const close = event.target.closest('[data-close]'); if (close) closeModal(close.dataset.close);
  if (event.target.classList.contains('modal-backdrop')) closeModal(event.target.id);
  if (event.target.closest('#settingsButton')) { renderPriceEditor(); openModal('settingsModal'); }
  if (event.target.closest('#historyButton')) { renderHistory(); openModal('historyModal'); }
  if (event.target.closest('#quickCustomButton')) { renderPriceEditor(); openModal('settingsModal'); setTimeout(() => $('#newItemName').focus(), 200); }
  const newCategory = event.target.closest('[data-new-category]'); if (newCategory) { newItemCategory = newCategory.dataset.newCategory; document.querySelectorAll('[data-new-category]').forEach(button => button.classList.toggle('active', button === newCategory)); }
  const deleteButton = event.target.closest('[data-delete-id]'); if (deleteButton) { const id = deleteButton.dataset.deleteId; services = services.filter(service => service.id !== id); cart = cart.filter(item => item.id !== id); saveServices(); renderPriceEditor(); renderCart(); }
  const filter = event.target.closest('[data-history-filter]'); if (filter) { historyFilter = filter.dataset.historyFilter; document.querySelectorAll('.history-filter').forEach(button => button.classList.toggle('active', button === filter)); renderHistory(); }
  const savedInvoice = event.target.closest('[data-open-invoice]'); if (savedInvoice) openSavedInvoice(savedInvoice.dataset.openInvoice);
  const preset = event.target.closest('[data-tfare-preset]');
  if (preset) {
    const val = Number(preset.dataset.tfarePreset) || 0;
    tfareAmount = val;
    const input = $('#tfareAmount');
    if (input) input.value = val;
    renderCart();
  }
  const copyBtn = event.target.closest('.copy-account-btn');
  if (copyBtn) {
    const acct = copyBtn.dataset.account;
    if (acct) {
      navigator.clipboard.writeText(acct).then(() => {
        const textSpan = copyBtn.querySelector('.copy-text');
        if (textSpan) textSpan.textContent = 'Copied!';
        toast('Account number copied');
        setTimeout(() => { if (textSpan) textSpan.textContent = 'Copy account'; }, 2000);
      }).catch(() => {
        toast('Could not copy account number');
      });
    }
  }
  if (event.target.closest('#clearButton')) {
    cart = [];
    tfareEnabled = false;
    tfareAmount = 0;
    if ($('#tfareToggle')) $('#tfareToggle').checked = false;
    if ($('#tfareAmount')) {
      $('#tfareAmount').value = '';
      $('#tfareAmount').disabled = true;
    }
    if ($('#tfarePresets')) $('#tfarePresets').hidden = true;
    renderCart();
  }
});
$('#priceEditor').addEventListener('change', event => { if (!event.target.matches('[data-price-id]')) return; const service = services.find(item => item.id === event.target.dataset.priceId); if (!service) return; service.price = Math.max(0, Number(event.target.value) || 0); const cartItem = cart.find(item => item.id === service.id); if (cartItem) cartItem.price = service.price; saveServices(); renderCart(); toast('Price updated'); });
$('#businessProfileForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#businessName').value.trim();
  const accountNumber = $('#accountNumber').value.trim();
  const bankName = $('#bankName').value.trim();
  const accountName = $('#accountName').value.trim();
  if (!name) return;
  business = { ...business, name, accountNumber, bankName, accountName };
  saveBusiness();
  toast('Business and account details saved');
});
$('#newItemForm').addEventListener('submit', event => { event.preventDefault(); const name = $('#newItemName').value.trim(); const price = Number($('#newItemPrice').value); if (!name || Number.isNaN(price)) return; services.push({ id:`custom-${Date.now()}`, name, category:newItemCategory, price }); saveServices(); activeCategory = newItemCategory; $('#newItemForm').reset(); renderPriceEditor(); document.querySelectorAll('.category-tab').forEach(tab => { const active = tab.dataset.category === activeCategory; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active); }); renderCatalog(); toast(`${name} added to price list`); });
$('#historySearch').addEventListener('input', renderHistory);
$('#createInvoiceButton').addEventListener('click', () => { if (!cart.length) { toast('Add at least one laundry item first'); return; } createInvoice(); openModal('invoiceModal'); toast('Invoice saved to your records'); });
$('#shareButton').addEventListener('click', shareInvoice); $('#printButton').addEventListener('click', () => window.print()); $('#markPaidButton').addEventListener('click', markActiveInvoicePaid);
document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(modal => closeModal(modal.id)); });

async function requestInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('#installButton').hidden = true;
  localStorage.setItem('anuoluwapo-laundry-install-prompt-seen', 'true');
  closeModal('installModal');
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $('#installButton').hidden = false;
  if (!localStorage.getItem('anuoluwapo-laundry-install-prompt-seen')) openModal('installModal');
});
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; $('#installButton').hidden = true; localStorage.setItem('anuoluwapo-laundry-install-prompt-seen', 'true'); closeModal('installModal'); toast('Anuoluwapo Laundry is installed'); });
$('#installButton').addEventListener('click', requestInstall);
$('#installNowButton').addEventListener('click', requestInstall);
$('#installLaterButton').addEventListener('click', () => { localStorage.setItem('anuoluwapo-laundry-install-prompt-seen', 'true'); closeModal('installModal'); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => toast('Offline mode could not be enabled')));
}

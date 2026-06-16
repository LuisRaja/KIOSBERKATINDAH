const API_BASE = (window.location.hostname === 'luisraja.github.io')
  ? 'https://kiosberkatindah-production.up.railway.app/api'
  : '/api';
const BASE_PATH = (window.location.hostname === 'luisraja.github.io')
  ? '/KIOSBERKATINDAH'
  : '';
const MAX_LIMIT_PER_PRODUCT = 3;

let shoppingCart = {};
let selectedCategory = 'Semua';
let searchQuery = '';
let globalProducts = [];
let storeSettings = {};
let chatSearchTimer;
let currentStep = 1;
let selectedPaymentMethod = '';
let pendingOrder = null;

const productGrid = document.getElementById('product-grid');
const categoryDropdown = document.getElementById('category-dropdown');
const activeCategoryLabel = document.getElementById('active-category-label');
const cartBadge = document.getElementById('cart-badge');
const cartDrawer = document.getElementById('cart-drawer');
const cartDrawerOverlay = document.getElementById('cart-drawer-overlay');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartTotalQty = document.getElementById('cart-total-qty');
const cartTotalPrice = document.getElementById('cart-total-price');
const btnSubmitOrder = document.getElementById('btn-submit-order');

function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) { console.warn('localStorage:', e.message); }
}

function safeGetItem(key) {
    try { return localStorage.getItem(key); }
    catch (e) { console.warn('localStorage:', e.message); return null; }
}

async function fetchAPI(endpoint, options = {}) {
    const res = await fetch(API_BASE + endpoint, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    return res.json();
}

function showToast(message, type) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification fixed top-4 right-4 z-[999] px-5 py-3 rounded-2xl text-sm font-medium shadow-lg transition-all duration-300 translate-x-0';
    toast.style.background = type === 'error' ? '#fee2e2' : type === 'info' ? '#dbeafe' : '#dcfce7';
    toast.style.color = type === 'error' ? '#991b1b' : type === 'info' ? '#1e40af' : '#166534';
    toast.style.border = type === 'error' ? '1px solid #fca5a5' : type === 'info' ? '1px solid #93c5fd' : '1px solid #86efac';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

document.addEventListener("DOMContentLoaded", async () => {
    await loadSettings();
    await loadProducts();
    loadSavedCustomerData();
    loadSavedCart();
    initializeDropdownCategories();
    await checkStoreStatus();
    updateHeaderCartBadge();
    document.getElementById('copyright-year').textContent = new Date().getFullYear();
    setInterval(checkStoreStatus, 60000);

    registerSW();
    setupBackButton();
    checkAuth();
    var savedView = safeGetItem('kios_view_mode');
    if (savedView) setViewMode(savedView);
    else setViewMode('grid');
    showAnnouncement(storeSettings.announcement_text || '');
    applyDarkMode();

    if (Object.keys(shoppingCart).length > 0) {
        activateShoppingMenu();
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'login_gagal') {
        setTimeout(() => showToast('Login Google gagal, coba lagi', 'error'), 500);
    }
});

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

function installApp() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(result => {
            if (result.outcome === 'accepted') {
                showToast('App berhasil diinstall!', 'success');
            }
            deferredInstallPrompt = null;
        });
    } else {
        showToast('Buka di Chrome dan cari menu "Add to Home Screen"', 'info');
    }
}

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(BASE_PATH + '/sw.js').catch(() => {});
    }
}

function setupBackButton() {
    if (!window.Capacitor) return;
    try {
        window.Capacitor.Plugins.App.addListener('backButton', function (_ref) {
            var canGoBack = _ref.canGoBack;
            var modals = [
                { overlay: 'auth-overlay', close: 'closeAuthModal' },
                { overlay: 'cart-drawer-overlay', close: 'toggleCart' },
                { overlay: 'tracking-overlay', close: 'closeTrackingModal' },
                { overlay: 'terms-overlay', close: 'closeTerms' },
                { overlay: 'changename-overlay', close: 'closeChangeName' },
                { overlay: 'changepw-overlay', close: 'closeChangePassword' },
                { overlay: 'maps-overlay', close: 'closeMapsModal' },
            ];
            for (var i = 0; i < modals.length; i++) {
                var m = modals[i];
                var el = document.getElementById(m.overlay || m.id);
                if (!el) continue;
                if (m.overlay && !el.classList.contains('pointer-events-none')) {
                    if (typeof window[m.close] === 'function') window[m.close]();
                    return;
                }
                if (m.id && !el.classList.contains('hidden')) {
                    if (typeof window[m.close] === 'function') window[m.close]();
                    return;
                }
            }
            if (canGoBack) {
                window.history.back();
            }
        });
    } catch (e) {
        console.warn('Back button setup failed:', e);
    }
}

async function loadSettings() {
    try {
        const res = await fetchAPI('/settings');
        if (res.success) {
            storeSettings = res.data;
            document.querySelectorAll('[data-setting]').forEach(el => {
                const key = el.dataset.setting;
                if (storeSettings[key]) el.textContent = storeSettings[key];
            });
        }
    } catch (e) {}
}

async function loadProducts() {
    try {
        const res = await fetchAPI('/products');
        if (res.success) {
            globalProducts = res.data.map(p => ({
                id: p.id,
                code: p.code,
                kategori: p.category_name,
                nama: p.name,
                harga: p.price,
                stok: p.stock,
                image: p.image && p.image.startsWith('/') ? p.image : (p.image ? BASE_PATH + '/img/' + p.image : BASE_PATH + '/img/placeholder.svg'),
                highlight: p.image && p.image.startsWith('/') ? p.image : (p.image ? BASE_PATH + '/img/' + p.image : BASE_PATH + '/img/placeholder.svg')
            }));
            renderProductGrid();
            document.getElementById('api-error')?.classList.add('hidden');
        } else {
            throw new Error('API returned error');
        }
    } catch (e) {
        console.error('Gagal load produk:', e);
        document.getElementById('api-error')?.classList.remove('hidden');
    }
}

function saveCustomerData() {
    const customerName = document.getElementById('customer-name').value.trim();
    const customerPhone = document.getElementById('customer-phone').value.trim();
    safeSetItem('kios_customer_name', customerName);
    safeSetItem('kios_customer_phone', customerPhone);
}

function loadSavedCustomerData() {
    const savedName = safeGetItem('kios_customer_name');
    const savedPhone = safeGetItem('kios_customer_phone');
    if (savedName) document.getElementById('customer-name').value = savedName;
    if (savedPhone) document.getElementById('customer-phone').value = savedPhone;
}

function saveCart() {
    safeSetItem('kios_shopping_cart', JSON.stringify(shoppingCart));
}

function loadSavedCart() {
    const savedCart = safeGetItem('kios_shopping_cart');
    if (savedCart) {
        try { shoppingCart = JSON.parse(savedCart); }
        catch (e) { shoppingCart = {}; }
    }
}

window.handleCustomerInput = function () {
    saveCustomerData();
    validateForm();
    clearFieldErrors();
};

let storeOpen = true;

async function checkStoreStatus() {
    try {
        const res = await fetch(API_BASE + '/store-status');
        const data = await res.json();
        storeOpen = data.isOpen;
    } catch (e) {
        storeOpen = true;
    }
    updateStoreStatus();
}

function updateStoreStatus() {
    const badge = document.getElementById('store-status-badge');
    if (!badge) return;

    const chatBtn = document.getElementById('floating-chatbot');

    if (storeOpen) {
        badge.className = "text-[10px] sm:text-xs font-bold bg-emerald-500 bg-opacity-20 text-emerald-300 px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 border border-emerald-500 border-opacity-30";
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Kios Sedang Buka`;
        if (chatBtn) {
            chatBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'grayscale');
            chatBtn.classList.add('cursor-pointer');
            chatBtn.onclick = openChatModal;
        }
    } else {
        badge.className = "text-[10px] sm:text-xs font-bold bg-rose-500 bg-opacity-20 text-rose-300 px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 border border-rose-500 border-opacity-30";
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-400"></span> Kios Sedang Tutup`;
        if (chatBtn) {
            chatBtn.classList.add('opacity-50', 'cursor-not-allowed', 'grayscale');
            chatBtn.classList.remove('cursor-pointer');
            chatBtn.onclick = function () { alert('Maaf, kios sedang tutup sementara. Silakan kembali lagi nanti.'); };
        }
    }
    if (typeof validateForm === 'function') validateForm();
}

function showAnnouncement(text) {
    const existing = document.getElementById('announcement-bar');
    if (existing) existing.remove();
    if (!text) return;
    const bar = document.createElement('div');
    bar.id = 'announcement-bar';
    bar.className = 'bg-amber-500 text-white text-center text-xs sm:text-sm font-semibold py-2 px-4';
    bar.textContent = text;
    document.body.insertBefore(bar, document.body.firstChild);
}

function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    document.querySelectorAll('.error-message').forEach(el => el.classList.remove('visible'));
}

function showFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.classList.add('field-error');
    const errorEl = document.getElementById(inputId + '-error');
    if (errorEl) {
        errorEl.textContent = message || 'Wajib diisi';
        errorEl.classList.add('visible');
    }
}

function validateForm() {
    const customerName = document.getElementById('customer-name').value.trim();
    const customerPhone = document.getElementById('customer-phone').value.trim();
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupTime = document.getElementById('pickup-time').value;
    const cartItemIds = Object.keys(shoppingCart);

    clearFieldErrors();
    let isValid = true;
    let statusMessage = "Lengkapi Data untuk Lanjut";

    if (!customerName) { showFieldError('customer-name', 'Nama pemesan wajib diisi'); isValid = false; }
    if (!customerPhone) { showFieldError('customer-phone', 'Nomor telepon wajib diisi'); isValid = false; }
    else if (!validatePhone(customerPhone)) { showFieldError('customer-phone', 'Nomor tidak valid. Gunakan 08xx (min. 10 digit)'); isValid = false; }
    if (cartItemIds.length === 0) { isValid = false; statusMessage = "Belum Ada Barang di Keranjang"; }
    if (!pickupDate) { showFieldError('pickup-date', 'Tanggal ambil wajib diisi'); isValid = false; }
    if (!pickupTime) { showFieldError('pickup-time', 'Jam ambil wajib diisi'); isValid = false; }

    if (!storeOpen) {
        isValid = false;
        statusMessage = "Kios Sedang Tutup Sementara";
    }

    const btnNext = document.getElementById('btn-next-step');
    if (isValid) {
        btnNext.removeAttribute('disabled');
        btnNext.className = "w-full bg-burgundy hover:bg-opacity-90 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-md text-sm tracking-wide cursor-pointer opacity-100";
        btnNext.innerHTML = `<i data-lucide="arrow-right" class="w-5 h-5"></i> Lanjut ke Pembayaran`;
    } else {
        btnNext.setAttribute('disabled', 'true');
        btnNext.className = "w-full bg-gray-300 text-gray-500 font-bold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm tracking-wide cursor-not-allowed opacity-60";
        btnNext.innerHTML = `<i data-lucide="shield-alert" class="w-5 h-5"></i> ${statusMessage}`;
    }
    lucide.createIcons();
}

async function submitOrder() {
    if (!selectedPaymentMethod) {
        alert('Pilih metode pembayaran terlebih dahulu');
        return;
    }
    if (!currentUser) {
        window.pendingSubmitAfterLogin = true;
        openAuthModal();
        return;
    }
    const customerName = document.getElementById('customer-name').value.trim();
    const customerPhone = document.getElementById('customer-phone').value.trim();
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupTime = document.getElementById('pickup-time').value;
    const notes = document.getElementById('order-notes')?.value.trim() || '';
    const cartItemIds = Object.keys(shoppingCart);

    const items = cartItemIds.map(id => {
        const product = globalProducts.find(p => p.id == id);
        return { productId: parseInt(id), quantity: shoppingCart[id], name: product.nama, price: product.harga };
    });

    try {
        const res = await fetchAPI('/orders', {
            method: 'POST',
            body: JSON.stringify({
                customerName, customerPhone, pickupDate, pickupTime,
                shippingMethod: 'Ambil Sendiri', items, notes
            })
        });

        if (!res.success) {
            alert(res.error || 'Gagal membuat pesanan');
            return;
        }

        const order = res.data;
        pendingOrder = order;

        if (selectedPaymentMethod === 'cash') {
            showCashConfirmation(order);
        } else if (selectedPaymentMethod === 'qris') {
            showQRISPayment(order);
        }
    } catch (e) {
        alert('Gagal menghubungi server. Pastikan server berjalan.');
    }
}

function showCashConfirmation(order) {
    const overlay = document.getElementById('order-confirm-overlay');
    const modal = document.getElementById('order-confirm-modal');
    const trackingUrl = `${window.location.origin}/order/${order.order_number}`;

    const formattedDate = new Date(order.pickup_date).toLocaleDateString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    let itemsHtml = order.items.map((item, idx) => {
        const subtotal = item.productPrice * item.quantity;
        return `<tr class="border-b border-gray-100">
            <td class="py-2 text-xs text-gray-600">${idx + 1}</td>
            <td class="py-2 text-xs font-semibold text-gray-800">${item.productName}</td>
            <td class="py-2 text-xs text-gray-500 text-center">${item.quantity}</td>
            <td class="py-2 text-xs text-gray-700 text-right">${formatRupiah(item.productPrice)}</td>
            <td class="py-2 text-xs font-semibold text-burgundy text-right">${formatRupiah(subtotal)}</td>
        </tr>`;
    }).join('');

    modal.querySelector('.confirm-body').innerHTML = `
        <div class="space-y-3">
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
                <p class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 flex-shrink-0"></i> Pesanan <strong>${order.order_number}</strong> berhasil dibuat!</p>
                <p class="mt-1 text-[10px] text-gray-500">Silakan ambil barang di kios dan bayar langsung (Cash).</p>
            </div>
            <div class="bg-burgundy bg-opacity-5 rounded-xl p-3 text-xs text-center">
                <p class="text-gray-500 mb-1">Lacak Status Pesanan:</p>
                <a href="${trackingUrl}" target="_blank" class="text-burgundy font-bold underline">${trackingUrl}</a>
            </div>
            <div class="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
                <p><span class="font-semibold text-gray-700">Nama:</span> ${order.customer_name}</p>
                <p><span class="font-semibold text-gray-700">Telepon:</span> ${order.customer_phone}</p>
                <p><span class="font-semibold text-gray-700">Ambil:</span> ${formattedDate} ${order.pickup_time} WITA</p>
                ${order.notes ? `<p><span class="font-semibold text-gray-700">Catatan:</span> ${order.notes}</p>` : ''}
            </div>
            <table class="w-full text-xs">
                <thead>
                    <tr class="border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
                        <th class="py-1.5 text-left">No</th>
                        <th class="py-1.5 text-left">Produk</th>
                        <th class="py-1.5 text-center">Qty</th>
                        <th class="py-1.5 text-right">Harga</th>
                        <th class="py-1.5 text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <div class="flex justify-between items-center border-t border-gray-200 pt-3">
                <span class="text-sm font-bold text-gray-700">Total:</span>
                <span class="text-lg font-extrabold text-burgundy">${formatRupiah(order.total)}</span>
            </div>
        </div>
    `;

    document.getElementById('confirm-payment-buttons').classList.add('hidden');
    document.getElementById('confirm-done-buttons').classList.remove('hidden');

    modal.querySelector('.confirm-ok').onclick = function () {
        closeConfirmation();
        resetAfterOrder();
    };

    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
    lucide.createIcons();
}

function showQRISPayment(order) {
    const overlay = document.getElementById('qris-payment-overlay');
    const modal = document.getElementById('qris-payment-modal');
    const trackingUrl = `${window.location.origin}/order/${order.order_number}`;

    document.getElementById('qris-order-number').textContent = order.order_number;
    document.getElementById('qris-total').textContent = formatRupiah(order.total);

    const waLink = document.getElementById('qris-wa-link');
    waLink.href = `https://wa.me/${storeSettings.whatsapp_number || '6281246005284'}?text=${encodeURIComponent('Halo Kios Berkat Indah,\n\nSaya sudah membayar pesanan:\nNo. Order: ' + order.order_number + '\nTotal: ' + formatRupiah(order.total) + '\n\nMohon konfirmasi. Terima kasih.')}`;

    document.getElementById('qris-image').src = BASE_PATH + '/barcode.png';
    document.getElementById('qris-name').textContent = 'Kios Berkat Indah';

    const fileInput = document.getElementById('proof-upload-input');
    fileInput.value = '';
    document.getElementById('proof-preview').classList.add('hidden');
    document.getElementById('btn-upload-proof').setAttribute('disabled', 'true');
    document.getElementById('btn-upload-proof').classList.add('opacity-60', 'cursor-not-allowed');

    fileInput.onchange = function () {
        const file = fileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                document.getElementById('proof-preview-img').src = e.target.result;
                document.getElementById('proof-preview').classList.remove('hidden');
                document.getElementById('btn-upload-proof').removeAttribute('disabled');
                document.getElementById('btn-upload-proof').classList.remove('opacity-60', 'cursor-not-allowed');
            };
            reader.readAsDataURL(file);
        }
    };

    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
    lucide.createIcons();
}

async function uploadQRISProof() {
    const fileInput = document.getElementById('proof-upload-input');
    const file = fileInput.files[0];
    if (!file || !pendingOrder) return;

    const btn = document.getElementById('btn-upload-proof');
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Mengupload...';
    btn.setAttribute('disabled', 'true');

    try {
        const formData = new FormData();
        formData.append('proof', file);
        const res = await fetch(`${API_BASE}/orders/${pendingOrder.order_number}/upload-proof`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            closeQRISPayment();
            showCashConfirmation(pendingOrder);
            pendingOrder = null;
        } else {
            alert(data.error || 'Gagal upload bukti');
        }
    } catch (e) {
        alert('Gagal upload bukti bayar');
    }
}

function closeQRISPayment() {
    const overlay = document.getElementById('qris-payment-overlay');
    const modal = document.getElementById('qris-payment-modal');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    if (modal) {
        const transformEl = modal.querySelector('.transform');
        if (transformEl) transformEl.classList.replace('scale-100', 'scale-95');
    }
}

function resetAfterOrder() {
    shoppingCart = {};
    saveCart();
    renderProductGrid();
    renderCartDrawerContents();
    updateHeaderCartBadge();
    currentStep = 1;
    selectedPaymentMethod = '';
    pendingOrder = null;
    document.getElementById('cart-step-1').classList.remove('hidden');
    validateForm();
    toggleCart(false);
}

function nextFormStep() {
    const customerName = document.getElementById('customer-name').value.trim();
    const customerPhone = document.getElementById('customer-phone').value.trim();
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupTime = document.getElementById('pickup-time').value;
    const cartItemIds = Object.keys(shoppingCart);

    if (!customerName || !customerPhone || !pickupDate || !pickupTime || cartItemIds.length === 0) {
        validateForm();
        return;
    }

    toggleCart(false);

    const qty = Object.values(shoppingCart).reduce((a, b) => a + b, 0);
    let total = 0;
    const itemsHtml = Object.keys(shoppingCart).map(id => {
        const p = globalProducts.find(prod => prod.id == id);
        if (!p) return '';
        const sub = p.harga * shoppingCart[id];
        total += sub;
        return `<div class="flex items-center justify-between bg-gray-50 rounded-xl p-2.5 border border-gray-100">
            <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-gray-800 truncate">${p.nama}</p>
                <p class="text-[10px] text-gray-400">${formatRupiah(p.harga)} x ${shoppingCart[id]}</p>
            </div>
            <span class="text-xs font-bold text-burgundy ml-2">${formatRupiah(sub)}</span>
        </div>`;
    }).join('');

    const paymentHtml = `
        <div class="space-y-3">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <p class="flex items-center gap-2"><i data-lucide="info" class="w-4 h-4 flex-shrink-0"></i> Pilih metode pembayaran untuk pesanan Anda</p>
            </div>
            <div class="space-y-2 max-h-40 overflow-y-auto">${itemsHtml}</div>
            <div class="space-y-2">
                <button onclick="selectPayment('cash')" id="pay-cash-btn"
                    class="w-full flex items-center gap-3 bg-white border-2 border-burgundy p-3.5 rounded-xl text-left transition-all">
                    <div class="w-10 h-10 bg-burgundy bg-opacity-10 rounded-full flex items-center justify-center">
                        <i data-lucide="wallet" class="w-5 h-5 text-burgundy"></i>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-gray-800">Bayar di Tempat (Cash)</p>
                        <p class="text-[11px] text-gray-400">Bayar langsung saat ambil barang di kios</p>
                    </div>
                    <i data-lucide="check-circle" class="w-5 h-5 text-burgundy ml-auto hidden" id="cash-check"></i>
                </button>
                <button onclick="selectPayment('qris')" id="pay-qris-btn"
                    class="w-full flex items-center gap-3 bg-white border-2 border-gray-200 p-3.5 rounded-xl text-left transition-all">
                    <div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <i data-lucide="scan-line" class="w-5 h-5 text-emerald-600"></i>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-gray-800">Scan Barcode QRIS</p>
                        <p class="text-[11px] text-gray-400">Bayar online via QRIS, upload bukti transfer</p>
                    </div>
                    <i data-lucide="check-circle" class="w-5 h-5 text-emerald-600 ml-auto hidden" id="qris-check"></i>
                </button>
            </div>
            <div class="border-t border-gray-200 pt-3 space-y-1">
                <div class="flex justify-between text-xs text-gray-500">
                    <span>Jumlah Barang:</span>
                    <span class="font-semibold text-gray-800">${qty} Item</span>
                </div>
                <div class="flex justify-between items-baseline">
                    <span class="text-sm font-bold text-burgundy">Total:</span>
                    <span class="text-xl font-extrabold text-burgundy">${formatRupiah(total)}</span>
                </div>
            </div>
        </div>
    `;

    const modal = document.getElementById('order-confirm-modal');
    modal.querySelector('.confirm-body').innerHTML = paymentHtml;
    document.getElementById('confirm-payment-buttons').classList.remove('hidden');
    document.getElementById('confirm-done-buttons').classList.add('hidden');

    selectedPaymentMethod = '';
    updateSubmitBtn();

    const overlay = document.getElementById('order-confirm-overlay');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
    lucide.createIcons();

    currentStep = 2;
}

function prevFormStep() {
    closeConfirmation();
    toggleCart(true);
    currentStep = 1;
}

function selectPayment(method) {
    selectedPaymentMethod = method;
    document.getElementById('cash-check').classList.toggle('hidden', method !== 'cash');
    document.getElementById('qris-check').classList.toggle('hidden', method !== 'qris');
    document.getElementById('pay-cash-btn').className = method === 'cash'
        ? 'w-full flex items-center gap-3 bg-white border-2 border-burgundy p-3.5 rounded-xl text-left transition-all'
        : 'w-full flex items-center gap-3 bg-white border-2 border-gray-200 p-3.5 rounded-xl text-left transition-all';
    document.getElementById('pay-qris-btn').className = method === 'qris'
        ? 'w-full flex items-center gap-3 bg-white border-2 border-emerald-500 p-3.5 rounded-xl text-left transition-all'
        : 'w-full flex items-center gap-3 bg-white border-2 border-gray-200 p-3.5 rounded-xl text-left transition-all';
    updateSubmitBtn();
}

function updateSubmitBtn() {
    const btn = document.getElementById('btn-submit-order');
    if (selectedPaymentMethod) {
        btn.removeAttribute('disabled');
        btn.className = "w-full bg-burgundy hover:bg-opacity-90 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-md text-sm tracking-wide cursor-pointer opacity-100";
        btn.innerHTML = `<i data-lucide="shopping-cart" class="w-5 h-5"></i> Buat Pesanan`;
    } else {
        btn.setAttribute('disabled', 'true');
        btn.className = "w-full bg-gray-300 text-gray-500 font-bold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm tracking-wide cursor-not-allowed opacity-60";
        btn.innerHTML = `<i data-lucide="shield-alert" class="w-5 h-5"></i> Pilih Metode Bayar`;
    }
    lucide.createIcons();
}

async function checkStock(productId) {
    try {
        const res = await fetchAPI(`/products/${productId}`);
        if (res.success) {
            const stock = res.data.stock;
            alert(`Stok ${res.data.name}: ${stock}`);
            return stock;
        }
    } catch (e) {
        console.error('Gagal cek stok:', e);
    }
    return null;
}

function closeConfirmation() {
    const overlay = document.getElementById('order-confirm-overlay');
    const modal = document.getElementById('order-confirm-modal');
    const isPaymentMode = !document.getElementById('confirm-payment-buttons').classList.contains('hidden');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    if (modal) {
        const transformEl = modal.querySelector('.transform');
        if (transformEl) transformEl.classList.replace('scale-100', 'scale-95');
    }
    document.getElementById('confirm-payment-buttons').classList.add('hidden');
    document.getElementById('confirm-done-buttons').classList.remove('hidden');
    if (isPaymentMode) {
        toggleCart(true);
        currentStep = 1;
    }
}

function activateShoppingMenu() {
    document.getElementById('landing-menu-container').classList.add('hidden');
    const catalogSec = document.getElementById('catalog-section');
    catalogSec.classList.remove('hidden');
    catalogSec.classList.add('block');
    renderProductGrid();
    var chatBtn = document.getElementById('floating-chatbot');
    if (chatBtn) chatBtn.style.display = 'none';
    var cartHeader = document.getElementById('btn-cart-header');
    if (cartHeader) cartHeader.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initializeDropdownCategories() {
    const categoriesSet = new Set(["Semua"]);
    globalProducts.forEach(p => { if (p.kategori) categoriesSet.add(p.kategori); });
    categoryDropdown.innerHTML = Array.from(categoriesSet).map(cat =>
        `<option value="${cat}">${cat === 'Semua' ? 'SEMUA PRODUK' : cat.toUpperCase()}</option>`
    ).join('');
}

function filterByCategory(val) {
    selectedCategory = val;
    activeCategoryLabel.innerText = val === 'Semua' ? 'Semua Produk' : val;
    renderProductGrid();
}

window.handleSearch = function (val) {
    searchQuery = val;
    renderProductGrid();
};

var viewMode = 'grid';

function setViewMode(mode) {
    viewMode = mode;
    var grid = document.getElementById('product-grid');
    var gridBtn = document.getElementById('view-grid-btn');
    var listBtn = document.getElementById('view-list-btn');
    if (mode === 'grid') {
        grid.className = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6';
        gridBtn.className = 'p-1.5 rounded-md bg-white shadow-sm text-burgundy transition-all';
        listBtn.className = 'p-1.5 rounded-md text-gray-400 hover:text-gray-600 transition-all';
    } else {
        grid.className = 'grid grid-cols-1 gap-3 sm:gap-4';
        gridBtn.className = 'p-1.5 rounded-md text-gray-400 hover:text-gray-600 transition-all';
        listBtn.className = 'p-1.5 rounded-md bg-white shadow-sm text-burgundy transition-all';
    }
    safeSetItem('kios_view_mode', mode);
    renderProductGrid();
}

function renderProductGrid() {
    let filtered = selectedCategory === "Semua"
        ? globalProducts
        : globalProducts.filter(p => p.kategori === selectedCategory);

    if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(p =>
            p.nama.toLowerCase().includes(query) || p.kategori.toLowerCase().includes(query)
        );
    }

    if (filtered.length === 0) {
        productGrid.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-center text-gray-400">
                <i data-lucide="search-code" class="w-12 h-12 text-gray-300 mb-2"></i>
                <p class="text-sm font-semibold text-gray-600">Produk tidak ditemukan</p>
                <p class="text-xs text-gray-400 mt-1">Coba gunakan kata kunci lain.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    var isListView = viewMode === 'list';
    productGrid.innerHTML = filtered.map(prod => {
        const cartQty = shoppingCart[prod.id] || 0;
        const hasImage = !!prod.image;
        const stock = prod.stok || 0;
        const outOfStock = stock <= 0;
        if (isListView) {
            return `
            <div class="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm flex items-center gap-3 sm:gap-4 transition-all duration-300 hover:shadow-md group ${outOfStock ? 'opacity-60' : ''}">
                ${hasImage ? `<div class="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                    <img src="${prod.image}" alt="${prod.nama}" class="w-full h-full object-cover" onerror="this.style.display='none'" loading="lazy">
                </div>` : ''}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[8px] uppercase font-extrabold tracking-widest text-gold bg-amber-50 px-1.5 py-0.5 rounded-md">${prod.kategori}</span>
                        <span class="text-[10px] text-gray-400">Stok: <span class="${stock <= 5 ? 'text-red-500 font-bold' : 'text-burgundy font-bold'}">${stock}</span></span>
                    </div>
                    <h3 class="font-bold text-gray-800 text-sm sm:text-base truncate">${prod.nama}</h3>
                    <p class="text-base sm:text-lg font-black text-burgundy mt-1">${formatRupiah(prod.harga)}</p>
                    ${outOfStock ? '<p class="text-[10px] text-red-500 font-bold">STOK HABIS</p>' : ''}
                </div>
                <div class="flex-shrink-0">
                    ${outOfStock ? `<button disabled class="bg-gray-200 text-gray-400 font-bold py-2 px-3 rounded-xl text-[10px] cursor-not-allowed">Stok Habis</button>`
                    : cartQty > 0
                        ? `<div class="flex items-center gap-1 bg-burgundy rounded-xl p-0.5 text-white">
                            <button onclick="updateCartQty('${prod.id}', -1)" class="p-1.5 hover:bg-white hover:bg-opacity-10 rounded-lg" aria-label="Kurangi"><i data-lucide="minus" class="w-3.5 h-3.5 text-gold"></i></button>
                            <span class="font-bold text-xs min-w-[20px] text-center">${cartQty}</span>
                            <button onclick="updateCartQty('${prod.id}', 1)" class="p-1.5 hover:bg-white hover:bg-opacity-10 rounded-lg" ${cartQty >= MAX_LIMIT_PER_PRODUCT ? 'disabled aria-disabled="true"' : ''} aria-label="Tambah"><i data-lucide="plus" class="w-3.5 h-3.5 text-gold"></i></button>
                        </div>`
                        : `<button onclick="updateCartQty('${prod.id}', 1)" class="border border-burgundy border-opacity-40 text-burgundy hover:bg-burgundy hover:text-white font-bold py-2 px-3 rounded-xl transition-all text-[10px] whitespace-nowrap" aria-label="Tambah ${prod.nama}">
                            <i data-lucide="plus" class="w-3 h-3 inline-block"></i> Tambah
                        </button>`
                    }
                </div>
            </div>`;
        }
        return `
            <div class="bg-white rounded-3xl p-3 sm:p-6 border border-gray-100 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md group ${outOfStock ? 'opacity-60' : ''}">
                <div>
                    ${hasImage ? `<div class="w-full h-24 sm:h-32 bg-gray-100 rounded-xl mb-2 sm:mb-3 overflow-hidden flex items-center justify-center">
                        <img src="${prod.image}" alt="${prod.nama}" class="w-full h-full object-cover" onerror="this.style.display='none'" loading="lazy">
                    </div>` : ''}
                    <div class="flex items-center justify-between mb-1.5 sm:mb-3">
                        <span class="text-[8px] sm:text-[9px] uppercase font-extrabold tracking-widest text-gold bg-amber-50 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md">${prod.kategori}</span>
                        <span class="text-[10px] sm:text-[11px] text-gray-400 font-medium">Stok: <span class="${stock <= 5 ? 'text-red-500 font-bold' : 'text-burgundy font-bold'}">${stock}</span></span>
                    </div>
                    <h3 class="font-bold text-gray-800 tracking-tight text-sm sm:text-base group-hover:text-burgundy transition-colors line-clamp-2">${prod.nama}</h3>
                    ${outOfStock ? '<p class="text-[10px] text-red-500 font-bold mt-1">STOK HABIS</p>' : ''}
                </div>
                <div class="mt-2 sm:mt-5">
                    <p class="text-base sm:text-lg font-black text-burgundy mb-2 sm:mb-4">${formatRupiah(prod.harga)}</p>
                    ${outOfStock ? `<button disabled class="w-full bg-gray-200 text-gray-400 font-bold py-2 sm:py-2.5 px-4 rounded-xl text-[10px] sm:text-xs cursor-not-allowed">Stok Habis</button>`
                    : cartQty > 0
                        ? `<div class="flex items-center justify-between bg-burgundy rounded-xl p-0.5 sm:p-1 text-white shadow-inner">
                            <button onclick="updateCartQty('${prod.id}', -1)" class="p-1.5 sm:p-2 hover:bg-white hover:bg-opacity-10 rounded-lg" aria-label="Kurangi"><i data-lucide="minus" class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gold"></i></button>
                            <span class="font-bold text-xs sm:text-sm">${cartQty}</span>
                            <button onclick="updateCartQty('${prod.id}', 1)" class="p-1.5 sm:p-2 hover:bg-white hover:bg-opacity-10 rounded-lg" ${cartQty >= MAX_LIMIT_PER_PRODUCT ? 'disabled aria-disabled="true"' : ''} aria-label="Tambah"><i data-lucide="plus" class="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gold"></i></button>
                        </div>`
                        : `<button onclick="updateCartQty('${prod.id}', 1)" class="w-full border border-burgundy border-opacity-40 text-burgundy hover:bg-burgundy hover:text-white font-bold py-2 sm:py-2.5 px-4 rounded-xl transition-all duration-300 text-[10px] sm:text-xs tracking-wider uppercase flex items-center justify-center gap-2" aria-label="Tambah ${prod.nama}">
                            <i data-lucide="plus" class="w-3 sm:w-3.5 h-3 sm:h-3.5"></i> Tambah Belanja
                        </button>`
                    }
                </div>
            </div>`;
    }).join('');
    lucide.createIcons();
}

window.updateCartQty = function (id, change) {
    const currentQty = shoppingCart[id] || 0;
    const targetQty = currentQty + change;

    if (targetQty <= 0) {
        delete shoppingCart[id];
    } else {
        if (targetQty > MAX_LIMIT_PER_PRODUCT) {
            alert(`Maksimum pembelian per produk adalah ${MAX_LIMIT_PER_PRODUCT} pcs.`);
            return;
        }
        const product = globalProducts.find(p => p.id == id);
        if (product && targetQty > product.stok) {
            alert(`Stok ${product.nama} tersisa ${product.stok}.`);
            return;
        }
        shoppingCart[id] = targetQty;
    }

    saveCart();
    renderProductGrid();
    renderCartDrawerContents();
    updateHeaderCartBadge();
    validateForm();
};

function updateHeaderCartBadge() {
    const totalItems = Object.values(shoppingCart).reduce((acc, qty) => acc + qty, 0);
    var badge = document.getElementById('cart-badge');
    if (!badge) return;
    if (totalItems > 0) {
        badge.innerText = totalItems;
        badge.classList.replace('scale-0', 'scale-100');
    } else {
        badge.classList.replace('scale-100', 'scale-0');
    }
}

function renderCartDrawerContents() {
    const cartItemIds = Object.keys(shoppingCart);
    let subtotalPrice = 0, subtotalItems = 0;

    if (cartItemIds.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center text-gray-400 py-8">
                <i data-lucide="shopping-bag" class="w-10 h-10 text-gray-200 mb-2"></i>
                <p class="text-xs font-semibold text-gray-600">Keranjang Kosong</p>
            </div>`;
        cartTotalQty.innerText = "0 Item";
        var headerQty = document.getElementById('cart-total-qty-header');
        if (headerQty) headerQty.innerText = "0 Item";
        cartTotalPrice.innerText = "Rp 0";
        lucide.createIcons();
        return;
    }

    let cartHtml = `
        <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Item Terpilih</span>
            <button onclick="clearCart()" class="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors flex items-center gap-1" aria-label="Kosongkan">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Kosongkan
            </button>
        </div>`;

    cartHtml += cartItemIds.map(id => {
        const product = globalProducts.find(p => p.id == id);
        if (!product) return '';
        const qty = shoppingCart[id];
        const subtotal = product.harga * qty;
        subtotalPrice += subtotal;
        subtotalItems += qty;
        return `
            <div class="flex items-start justify-between bg-gray-50 border border-gray-100 rounded-2xl p-4 gap-3 shadow-sm">
                <div class="flex-grow min-w-0">
                    <h4 class="text-xs font-bold text-gray-800 truncate">${product.nama}</h4>
                    <p class="text-[11px] text-gray-400 mt-0.5">${formatRupiah(product.harga)} x ${qty}</p>
                    <p class="text-xs font-bold text-burgundy mt-1">${formatRupiah(subtotal)}</p>
                </div>
                <div class="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 flex-shrink-0">
                    <button onclick="updateCartQty('${id}', -1)" class="p-1 text-burgundy rounded-lg" aria-label="Kurangi"><i data-lucide="minus" class="w-3 h-3"></i></button>
                    <span class="px-1.5 text-xs font-bold text-gray-700 min-w-[16px] text-center">${qty}</span>
                    <button onclick="updateCartQty('${id}', 1)" class="p-1 text-burgundy rounded-lg" ${qty >= MAX_LIMIT_PER_PRODUCT ? 'disabled aria-disabled="true"' : ''} aria-label="Tambah"><i data-lucide="plus" class="w-3 h-3"></i></button>
                </div>
            </div>`;
    }).join('');

    cartItemsContainer.innerHTML = cartHtml;
    cartTotalQty.innerText = `${subtotalItems} Item`;
    var headerQty = document.getElementById('cart-total-qty-header');
    if (headerQty) headerQty.innerText = `${subtotalItems} Item`;
    cartTotalPrice.innerText = formatRupiah(subtotalPrice);
    lucide.createIcons();
}

window.clearCart = function () {
    if (confirm("Kosongkan semua barang?")) {
        shoppingCart = {};
        saveCart();
        renderProductGrid();
        renderCartDrawerContents();
        updateHeaderCartBadge();
        validateForm();
    }
};

window.toggleCart = function (isOpen) {
    if (isOpen) {
        cartDrawerOverlay.classList.replace('pointer-events-none', 'pointer-events-auto');
        cartDrawerOverlay.classList.replace('opacity-0', 'opacity-100');
        cartDrawer.classList.replace('pointer-events-none', 'pointer-events-auto');
        cartDrawer.classList.replace('opacity-0', 'opacity-100');
        cartDrawer.querySelector('.transform').classList.replace('scale-95', 'scale-100');
        renderCartDrawerContents();
        validateForm();
    } else {
        cartDrawerOverlay.classList.replace('pointer-events-auto', 'pointer-events-none');
        cartDrawerOverlay.classList.replace('opacity-100', 'opacity-0');
        cartDrawer.classList.replace('pointer-events-auto', 'pointer-events-none');
        cartDrawer.classList.replace('opacity-100', 'opacity-0');
        var transformEl = cartDrawer.querySelector('.transform');
        if (transformEl) transformEl.classList.replace('scale-100', 'scale-95');
    }
};

// ─── Chatbot ──────────────────────────────────────────────────────────

const chatOverlay = document.getElementById('chatbot-overlay');
const chatModal = document.getElementById('chatbot-modal');

window.openChatModal = function () {
    chatOverlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    chatOverlay.classList.replace('opacity-0', 'opacity-100');
    chatModal.classList.replace('pointer-events-none', 'pointer-events-auto');
    chatModal.classList.replace('opacity-0', 'opacity-100');
    chatModal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
    document.getElementById('chatbot-home').classList.remove('hidden');
    document.getElementById('chatbot-search').classList.add('hidden');
};

window.closeChatModal = function () {
    chatOverlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    chatOverlay.classList.replace('opacity-100', 'opacity-0');
    chatModal.classList.replace('pointer-events-auto', 'pointer-events-none');
    chatModal.classList.replace('opacity-100', 'opacity-0');
    chatModal.querySelector('.transform').classList.replace('scale-100', 'scale-95');
};

window.showChatStock = function () {
    document.getElementById('chatbot-home').classList.add('hidden');
    document.getElementById('chatbot-search').classList.remove('hidden');
    document.getElementById('chatbot-search-title').textContent = 'Cek Stok Produk';
    document.getElementById('chatbot-search-input').placeholder = 'Ketik nama produk...';
    document.getElementById('chatbot-search-input').value = '';
    document.getElementById('chatbot-results').innerHTML = '';
    document.getElementById('chatbot-search-input').dataset.mode = 'stock';
    document.getElementById('chatbot-search-input').focus();
};

window.showChatPrice = function () {
    document.getElementById('chatbot-home').classList.add('hidden');
    document.getElementById('chatbot-search').classList.remove('hidden');
    document.getElementById('chatbot-search-title').textContent = 'Cek Harga Produk';
    document.getElementById('chatbot-search-input').placeholder = 'Ketik nama produk...';
    document.getElementById('chatbot-search-input').value = '';
    document.getElementById('chatbot-results').innerHTML = '';
    document.getElementById('chatbot-search-input').dataset.mode = 'price';
    document.getElementById('chatbot-search-input').focus();
};

window.backChatHome = function () {
    document.getElementById('chatbot-home').classList.remove('hidden');
    document.getElementById('chatbot-search').classList.add('hidden');
};

window.debounceChatSearch = function () {
    clearTimeout(chatSearchTimer);
    chatSearchTimer = setTimeout(doChatSearch, 300);
};

function doChatSearch() {
    const input = document.getElementById('chatbot-search-input');
    const query = input.value.trim().toLowerCase();
    const mode = input.dataset.mode || 'stock';
    const results = document.getElementById('chatbot-results');

    if (!query) { results.innerHTML = ''; return; }

    const filtered = globalProducts.filter(p =>
        p.nama.toLowerCase().includes(query) || p.kategori.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        results.innerHTML = `<p class="text-xs text-gray-400 text-center py-4">Produk tidak ditemukan</p>`;
        return;
    }

    results.innerHTML = filtered.slice(0, 10).map(p => {
        const isLowStock = p.stok <= 5;
        if (mode === 'stock') {
            return `<div class="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-gray-800 truncate">${p.nama}</p>
                    <p class="text-[10px] text-gray-400">${p.kategori}</p>
                </div>
                <span class="text-xs font-bold px-2 py-1 rounded-lg ${isLowStock ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}">Stok: ${p.stok}</span>
            </div>`;
        } else {
            return `<div class="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-gray-800 truncate">${p.nama}</p>
                    <p class="text-[10px] text-gray-400">${p.kategori}</p>
                </div>
                <span class="text-xs font-bold text-burgundy">${formatRupiah(p.harga)}</span>
            </div>`;
        }
    }).join('');
}

window.chatWithSeller = function () {
    const waNumber = storeSettings.whatsapp_number || '6281246005284';
    const text = `Halo Kios Berkat Indah, saya ingin bertanya tentang produk yang tersedia.`;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, '_blank');
};

// ─── Auth ─────────────────────────────────────────────────────────────

let currentUser = null;

async function checkAuth() {
    try {
        const res = await fetchAPI('/auth/session');
        if (res.success) {
            if (res.data.buyer) {
                const profileRes = await fetchAPI('/auth/profile');
                if (profileRes.success) {
                    currentUser = { ...profileRes.data, role: 'buyer' };
                    updateUserMenu();
                    return;
                }
            } else if (res.data.admin) {
                currentUser = { name: 'Admin', role: 'admin' };
                updateUserMenu();
                return;
            }
        }
        currentUser = null;
        updateUserMenu();
    } catch (e) {
        currentUser = null;
    }
}

function toggleFooterMap() {
    var container = document.getElementById('footer-map-container');
    var chevron = document.getElementById('footer-map-chevron');
    if (container.classList.contains('h-0')) {
        container.classList.remove('h-0');
        container.classList.add('h-48');
        chevron.classList.add('rotate-180');
    } else {
        container.classList.remove('h-48');
        container.classList.add('h-0');
        chevron.classList.remove('rotate-180');
    }
}

function openMapsModal() {
    const overlay = document.getElementById('maps-overlay');
    const modal = document.getElementById('maps-modal');
    const content = modal.querySelector('div > div');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    content.classList.replace('translate-y-full', 'translate-y-0');
    content.classList.replace('sm:scale-95', 'sm:scale-100');
    lucide.createIcons();
}

function closeMapsModal() {
    const overlay = document.getElementById('maps-overlay');
    const modal = document.getElementById('maps-modal');
    const content = modal.querySelector('div > div');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    content.classList.replace('translate-y-0', 'translate-y-full');
    content.classList.replace('sm:scale-100', 'sm:scale-95');
}

function openBurgerMenu() {
    const dropdown = document.getElementById('burger-dropdown');
    const overlay = document.getElementById('burger-overlay');

    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        if (!overlay) {
            const o = document.createElement('div');
            o.id = 'burger-overlay';
            o.className = 'fixed inset-0 z-30 bg-transparent';
            o.onclick = closeBurgerMenu;
            document.body.appendChild(o);
        } else {
            overlay.classList.remove('hidden');
        }
    } else {
        closeBurgerMenu();
    }
}

function closeBurgerMenu() {
    const dropdown = document.getElementById('burger-dropdown');
    const overlay = document.getElementById('burger-overlay');
    dropdown?.classList.add('hidden');
    overlay?.classList.add('hidden');
}

function hideBurgerButton() {
    const wrapper = document.getElementById('burger-wrapper');
    if (wrapper) wrapper.classList.add('hidden');
}

async function openUserMenu() {
    if (!currentUser) {
        openAuthModal();
        return;
    }
    const dropdown = document.getElementById('user-dropdown');
    const overlay = document.getElementById('user-overlay');
    const loggedIn = document.getElementById('dropdown-logged-in');

    if (dropdown.classList.contains('hidden')) {
        loggedIn.classList.remove('hidden');
        document.getElementById('dropdown-user-name').textContent = currentUser.name;
        document.getElementById('dropdown-user-email').textContent = currentUser.email || currentUser.phone || '';
        dropdown.classList.remove('hidden');
        if (!overlay) {
            const o = document.createElement('div');
            o.id = 'user-overlay';
            o.className = 'fixed inset-0 z-30 bg-transparent';
            o.onclick = closeUserMenu;
            document.body.appendChild(o);
        } else {
            overlay.classList.remove('hidden');
        }
    } else {
        closeUserMenu();
    }
}

function closeUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const overlay = document.getElementById('user-overlay');
    dropdown?.classList.add('hidden');
    overlay?.classList.add('hidden');
}

function toggleUserMenu() {
    if (currentUser) {
        openUserMenu();
    } else {
        openAuthModal();
    }
}

function showTerms() {
    const overlay = document.getElementById('terms-overlay');
    const modal = document.getElementById('terms-modal');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
}

function closeTerms() {
    const overlay = document.getElementById('terms-overlay');
    const modal = document.getElementById('terms-modal');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    const t = modal?.querySelector('.transform');
    if (t) t.classList.replace('scale-100', 'scale-95');
}

function showChangeName() {
    closeUserMenu();
    document.getElementById('change-name-input').value = currentUser.name || '';
    const overlay = document.getElementById('changename-overlay');
    const modal = document.getElementById('changename-modal');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
}

function closeChangeName() {
    const overlay = document.getElementById('changename-overlay');
    const modal = document.getElementById('changename-modal');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    const t = modal?.querySelector('.transform');
    if (t) t.classList.replace('scale-100', 'scale-95');
}

async function submitChangeName() {
    const name = document.getElementById('change-name-input').value.trim();
    if (!name) return alert('Nama tidak boleh kosong');
    const res = await fetchAPI('/auth/update-profile', {
        method: 'PUT', body: JSON.stringify({ name })
    });
    if (res.success) {
        currentUser.name = name;
        updateUserMenu();
        closeChangeName();
    } else {
        alert(res.error || 'Gagal mengubah nama');
    }
}

function showChangePassword() {
    closeUserMenu();
    document.getElementById('changepw-current').value = '';
    document.getElementById('changepw-new').value = '';
    document.getElementById('changepw-error').classList.add('hidden');
    const overlay = document.getElementById('changepw-overlay');
    const modal = document.getElementById('changepw-modal');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
}

function closeChangePassword() {
    const overlay = document.getElementById('changepw-overlay');
    const modal = document.getElementById('changepw-modal');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    const t = modal?.querySelector('.transform');
    if (t) t.classList.replace('scale-100', 'scale-95');
}

async function submitChangePassword() {
    const current = document.getElementById('changepw-current').value;
    const newPw = document.getElementById('changepw-new').value;
    const err = document.getElementById('changepw-error');
    if (!current || !newPw) {
        err.textContent = 'Semua field wajib diisi';
        err.classList.remove('hidden');
        return;
    }
    if (newPw.length < 6) {
        err.textContent = 'Password baru minimal 6 karakter';
        err.classList.remove('hidden');
        return;
    }
    err.classList.add('hidden');
    const res = await fetchAPI('/auth/update-profile', {
        method: 'PUT', body: JSON.stringify({ currentPassword: current, newPassword: newPw })
    });
    if (res.success) {
        closeChangePassword();
        alert('Password berhasil diubah');
    } else {
        err.textContent = res.error || 'Gagal mengubah password';
        err.classList.remove('hidden');
    }
}

function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    safeSetItem('kios_dark_mode', isDark ? '1' : '0');
    updateDarkModeIcon(!isDark);
}

function updateDarkModeIcon(isDark) {
    const btn = document.getElementById('btn-dark-mode');
    if (!btn) return;
    btn.innerHTML = isDark
        ? '<i data-lucide="moon" class="w-5 h-5 text-gold"></i>'
        : '<i data-lucide="sun" class="w-5 h-5 text-gold"></i>';
    lucide.createIcons();
}

function applyDarkMode() {
    const saved = safeGetItem('kios_dark_mode');
    const html = document.documentElement;
    if (saved === '1') {
        html.classList.add('dark');
        updateDarkModeIcon(false);
    } else {
        html.classList.remove('dark');
        updateDarkModeIcon(true);
    }
}

function validatePhone(phone) {
    return /^08\d{8,11}$/.test(phone.replace(/\D/g, ''));
}

let activeAuthTab = 'buyer';

function openAuthModal() {
    const overlay = document.getElementById('auth-overlay');
    const modal = document.getElementById('auth-modal');
    const content = modal.querySelector('div > div');

    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    content.classList.replace('translate-y-full', 'translate-y-0');
    content.classList.replace('sm:scale-95', 'sm:scale-100');

    switchAuthTab('buyer');
    clearAuthErrors();
    lucide.createIcons();
}

function closeAuthModal() {
    const overlay = document.getElementById('auth-overlay');
    const modal = document.getElementById('auth-modal');
    const content = modal.querySelector('div > div');

    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    content.classList.replace('translate-y-0', 'translate-y-full');
    content.classList.replace('sm:scale-100', 'sm:scale-95');
}

function switchAuthTab(tab) {
    activeAuthTab = tab;
}

function clearAuthErrors() {
    ['auth-error', 'auth-reg-error'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

async function submitBuyerLogin() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');

    if (!email || !password) {
        errorEl.textContent = 'Email/HP dan password wajib diisi';
        errorEl.classList.remove('hidden');
        return;
    }

    if (email.toLowerCase() === 'admin' && password === 'kios123') {
        window.location.href = '/admin';
        return;
    }

    errorEl.classList.add('hidden');
    const btn = document.getElementById('btn-buyer-login');
    btn.textContent = 'Memproses...';
    btn.setAttribute('disabled', 'true');

    try {
        const res = await fetchAPI('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (res.success) {
            currentUser = { ...res.data, role: 'buyer' };
            updateUserMenu();
            closeAuthModal();
            if (window.pendingSubmitAfterLogin) {
                window.pendingSubmitAfterLogin = false;
                setTimeout(submitOrder, 300);
            }
        } else {
            errorEl.textContent = res.error || 'Login gagal';
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        errorEl.textContent = 'Gagal menghubungi server';
        errorEl.classList.remove('hidden');
    }
    btn.textContent = 'Masuk';
    btn.removeAttribute('disabled');
}

function toggleAuthMode() {
    const buyerForm = document.getElementById('auth-buyer-form');
    const registerForm = document.getElementById('auth-register-form');
    const isRegister = !registerForm.classList.contains('hidden');

    if (isRegister) {
        registerForm.classList.add('hidden');
        buyerForm.classList.remove('hidden');
    } else {
        buyerForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
    clearAuthErrors();
}

function backToBuyerLogin() {
    document.getElementById('auth-register-form').classList.add('hidden');
    document.getElementById('auth-buyer-form').classList.remove('hidden');
    clearAuthErrors();
}

async function submitRegister() {
    const name = document.getElementById('auth-name').value.trim();
    const email = document.getElementById('auth-reg-email').value.trim();
    const phone = document.getElementById('auth-phone-input').value.trim();
    const password = document.getElementById('auth-reg-password').value;
    const errorEl = document.getElementById('auth-reg-error');

    if (!name || !password) {
        errorEl.textContent = 'Nama dan password wajib diisi';
        errorEl.classList.remove('hidden');
        return;
    }
    if (!email && !phone) {
        errorEl.textContent = 'Email atau nomor HP wajib diisi';
        errorEl.classList.remove('hidden');
        return;
    }
    if (phone && !validatePhone(phone)) {
        errorEl.textContent = 'Nomor tidak valid (08xx, min. 10 digit)';
        errorEl.classList.remove('hidden');
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = 'Password minimal 6 karakter';
        errorEl.classList.remove('hidden');
        return;
    }

    errorEl.classList.add('hidden');
    const btn = document.getElementById('btn-register');
    btn.textContent = 'Memproses...';
    btn.setAttribute('disabled', 'true');

    try {
        const res = await fetchAPI('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, phone })
        });
        if (res.success) {
            currentUser = { ...res.data, role: 'buyer' };
            updateUserMenu();
            closeAuthModal();
            if (window.pendingSubmitAfterLogin) {
                window.pendingSubmitAfterLogin = false;
                setTimeout(submitOrder, 300);
            }
        } else {
            errorEl.textContent = res.error || 'Daftar gagal';
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        errorEl.textContent = 'Gagal menghubungi server';
        errorEl.classList.remove('hidden');
    }
    btn.textContent = 'Daftar';
    btn.removeAttribute('disabled');
}

async function logoutUser() {
    if (!confirm('Yakin ingin logout?')) return;
    await fetchAPI('/auth/logout', { method: 'POST' });
    currentUser = null;
    updateUserMenu();
}

function updateUserMenu() {
    const btn = document.getElementById('btn-user-menu');
    if (currentUser) {
        btn.innerHTML = `<i data-lucide="user" class="w-6 h-6 text-gold group-hover:scale-110 transition-transform"></i>`;
        document.getElementById('customer-name').value = currentUser.name || '';
        saveCustomerData();
        lucide.createIcons();
    } else {
        btn.innerHTML = `<i data-lucide="user" class="w-6 h-6 text-gold group-hover:scale-110 transition-transform"></i>`;
        closeUserMenu();
        lucide.createIcons();
    }
}

// ─── Order Tracking ───────────────────────────────────────────────────

async function openTrackingModal() {
    const overlay = document.getElementById('tracking-overlay');
    const modal = document.getElementById('tracking-modal');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    overlay.classList.replace('opacity-0', 'opacity-100');
    modal.classList.replace('pointer-events-none', 'pointer-events-auto');
    modal.classList.replace('opacity-0', 'opacity-100');
    modal.querySelector('.transform').classList.replace('scale-95', 'scale-100');
    lucide.createIcons();
    await loadUserOrders();
}

function closeTrackingModal() {
    const overlay = document.getElementById('tracking-overlay');
    const modal = document.getElementById('tracking-modal');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    overlay.classList.replace('opacity-100', 'opacity-0');
    modal.classList.replace('pointer-events-auto', 'pointer-events-none');
    modal.classList.replace('opacity-100', 'opacity-0');
    if (modal) {
        const t = modal.querySelector('.transform');
        if (t) t.classList.replace('scale-100', 'scale-95');
    }
}

async function loadUserOrders() {
    const body = document.getElementById('tracking-body');
    try {
        const res = await fetchAPI('/orders/user/orders');
        if (!res.success || res.data.length === 0) {
            body.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i data-lucide="package" class="w-10 h-10 mx-auto mb-2 text-gray-300"></i>
                    <p class="text-sm font-semibold text-gray-600">Belum ada pesanan</p>
                    <p class="text-xs mt-1">Pesanan Anda akan muncul di sini</p>
                </div>`;
            lucide.createIcons();
            return;
        }
        body.innerHTML = `<div class="space-y-3">${res.data.map(order => {
            const paid = order.payment_status === 'paid';
            const statusSteps = [
                { label: 'Dikemas', done: order.status !== 'pending' },
                { label: 'Siap di Ambil', done: order.status === 'ready' || order.status === 'completed' },
                { label: 'Selesai', done: order.status === 'completed' }
            ];
            const itemsList = (order.items || []).map(item =>
                `<div class="flex justify-between text-xs">
                    <span class="text-gray-700">${item.product_name} x${item.quantity}</span>
                    <span class="font-semibold text-burgundy">Rp ${Number(item.subtotal).toLocaleString('id-ID')}</span>
                </div>`
            ).join('');
            return `
                <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <div class="flex items-center justify-between mb-3">
                        <span class="font-bold text-sm text-gray-800">${order.order_number}</span>
                        <span class="text-xs font-bold px-2 py-0.5 rounded-full ${paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                            ${paid ? 'LUNAS' : 'BELUM DIBAYAR'}
                        </span>
                    </div>
                    <div class="flex items-center gap-1 mb-3">
                        ${statusSteps.map((s, i) => `
                            <div class="flex items-center gap-1 ${i < statusSteps.length - 1 ? 'flex-1' : ''}">
                                <div class="w-6 h-6 rounded-full flex items-center justify-center ${s.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}">
                                    <i data-lucide="${s.done ? 'check' : 'circle'}" class="w-3.5 h-3.5"></i>
                                </div>
                                <span class="text-[10px] ${s.done ? 'text-emerald-700 font-semibold' : 'text-gray-400'}">${s.label}</span>
                                ${i < statusSteps.length - 1 ? `<div class="flex-1 h-px ${s.done ? 'bg-emerald-500' : 'bg-gray-200'}"></div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ${order.notes ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-2 mb-2 text-[10px] text-amber-700"><strong>Catatan:</strong> ${order.notes}</div>` : ''}
                    <div class="border-t border-gray-100 pt-2 space-y-1">${itemsList}</div>
                    <div class="border-t border-gray-100 pt-2 flex justify-between items-center mt-2">
                        <span class="text-xs text-gray-400">${new Date(order.created_at).toLocaleDateString('id-ID')}</span>
                        <span class="text-sm font-extrabold text-burgundy">Rp ${Number(order.total).toLocaleString('id-ID')}</span>
                    </div>
                </div>`;
        }).join('')}</div>`;
        lucide.createIcons();
    } catch (e) {
        body.innerHTML = `<div class="text-center py-8 text-red-400"><p class="text-xs">Gagal memuat pesanan</p></div>`;
    }
}

// ─── Utility ──────────────────────────────────────────────────────────

function formatRupiah(number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR", minimumFractionDigits: 0
    }).format(number);
}

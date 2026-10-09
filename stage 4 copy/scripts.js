const storageKey = 'jmLiftersDashboard';
const state = {
    bills: [],
    attendance: [],
    employees: []
};
const allowedAdminEmail = 'jkcraneservice69975@gmail.com';

function apiUrl(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (window.location.protocol === 'file:') return 'http://127.0.0.1:3000' + path;
    return path;
}

async function apiRequest(path, options = {}) {
    const response = await fetch(apiUrl(path), {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
}

async function loadState() {
    try {
        const db = await apiRequest('/api/state');
        Object.assign(state, db.dashboard || {});
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
        const saved = localStorage.getItem(storageKey);
        if (saved) Object.assign(state, JSON.parse(saved));
    }
}

async function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    try {
        const db = await apiRequest('/api/state', {
            method: 'PUT',
            body: JSON.stringify({ dashboard: state })
        });
        Object.assign(state, db.dashboard || state);
    } catch (error) {
        notify('Saved locally. Login with the allowed Gmail to sync with backend.');
    }
}

function notify(message) {
    const container = document.querySelector('.notification-area');
    if (!container) return;
    container.innerHTML = `<div class="notification">${message}</div>`;
    setTimeout(() => { container.innerHTML = ''; }, 3200);
}

function setActiveNav() {
    const links = document.querySelectorAll('nav a');
    links.forEach(link => {
        if (link.href === window.location.href || link.href === window.location.href.split('?')[0]) {
            link.classList.add('active');
        }
    });
}

async function adminLogin() {
    const enteredEmail = document.getElementById('adminUser')?.value.trim().toLowerCase();
    const email = enteredEmail || allowedAdminEmail;
    const pass = document.getElementById('adminPass')?.value.trim();
    const message = document.getElementById('adminLoginMessage');
    if (email !== allowedAdminEmail) {
        if (message) message.textContent = `Only ${allowedAdminEmail} can sign in.`;
        alert(`Only ${allowedAdminEmail} can sign in.`);
        return;
    }
    if (!pass) {
        if (message) message.textContent = 'Enter the admin password.';
        return;
    }
    try {
        await apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password: pass })
        });
        if (message) message.textContent = 'Admin access granted.';
        await loadState();
        await requireAdmin();
        renderBillHistory();
        renderAttendanceTable();
        renderEmployeeList();
        notify('Admin access granted.');
    } catch (error) {
        const text = error.message === 'Failed to fetch'
            ? 'Cannot reach the backend. Open http://127.0.0.1:3000 in the browser and make sure server.js is running.'
            : error.message;
        if (message) message.textContent = text;
        alert(text);
    }
}

async function adminLogout() {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await requireAdmin();
    notify('Admin access removed.');
}

async function isAdmin() {
    const data = await apiRequest('/api/auth/me').catch(() => ({ user: null }));
    return Boolean(data.user && data.user.email === allowedAdminEmail);
}

async function requireAdmin() {
    const panel = document.getElementById('adminAccessPanel');
    const content = document.getElementById('protectedContent');
    if (!panel || !content) return;
    if (await isAdmin()) {
        panel.style.display = 'none';
        content.style.display = 'block';
    } else {
        panel.style.display = 'block';
        content.style.display = 'none';
    }
}

async function addBill() {
    const customer = document.getElementById('customerName');
    const service = document.getElementById('serviceDescription');
    const amount = document.getElementById('billAmount');
    if (!customer.value || !service.value || !amount.value || Number(amount.value) <= 0) {
        alert('Please fill all billing details.');
        return;
    }
    const bill = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        customer: customer.value.trim(),
        service: service.value.trim(),
        amount: Number(amount.value),
        gst: Number(amount.value) * 0.18
    };
    state.bills.unshift(bill);
    await saveState();
    renderBillHistory();
    customer.value = '';
    service.value = '';
    amount.value = '';
    notify('Bill saved successfully.');
}

function generateInvoice() {
    const billId = document.getElementById('invoiceBill').value;
    const target = state.bills.find(bill => String(bill.id) === billId);
    const message = document.getElementById('invoiceResult');
    if (!target) {
        message.textContent = 'Please select a bill to generate the invoice.';
        return;
    }
    message.innerHTML = `Invoice ready for <strong>${target.customer}</strong>. Total: ₹${(target.amount + target.gst).toFixed(2)} including GST.`;
}

async function saveAttendance() {
    const date = document.getElementById('attendanceDateAdmin').value;
    const employee = document.getElementById('attendanceEmployee').value.trim();
    const status = document.getElementById('attendanceStatus').value;
    if (!date || !employee) {
        alert('Please provide date and employee name.');
        return;
    }
    state.attendance.unshift({ date, employee, status });
    await saveState();
    renderAttendanceTable();
    document.getElementById('attendanceEmployee').value = '';
    notify('Attendance recorded.');
}

async function saveEmployee() {
    const name = document.getElementById('employeeName').value.trim();
    const id = document.getElementById('employeeId').value.trim();
    if (!name || !id) {
        alert('Please enter employee name and ID.');
        return;
    }
    state.employees.unshift({ name, id });
    await saveState();
    renderEmployeeList();
    document.getElementById('employeeName').value = '';
    document.getElementById('employeeId').value = '';
    notify('Employee added.');
}

function renderBillHistory() {
    const table = document.getElementById('billHistoryTable');
    const options = document.getElementById('invoiceBill');
    if (table) {
        if (state.bills.length === 0) {
            table.innerHTML = '<tr><td colspan="4">No bills recorded yet.</td></tr>';
        } else {
            table.innerHTML = state.bills.slice(0, 10).map(bill => `<tr><td>${bill.date}</td><td>${bill.customer}</td><td>${bill.service}</td><td>₹${bill.amount.toFixed(2)}</td></tr>`).join('');
        }
    }
    if (options) {
        options.innerHTML = `<option value="">Select a bill</option>${state.bills.map(bill => `<option value="${bill.id}">${bill.customer} / ₹${bill.amount.toFixed(2)}</option>`).join('')}`;
    }
}

function renderAttendanceTable() {
    const table = document.getElementById('attendanceTable');
    if (!table) return;
    if (state.attendance.length === 0) {
        table.innerHTML = '<tr><td colspan="3">No attendance records yet.</td></tr>';
    } else {
        table.innerHTML = state.attendance.slice(0, 10).map(item => `<tr><td>${item.date}</td><td>${item.employee}</td><td>${item.status}</td></tr>`).join('');
    }
}

function renderEmployeeList() {
    const list = document.getElementById('employeeList');
    if (!list) return;
    if (state.employees.length === 0) {
        list.innerHTML = '<li>No employees registered.</li>';
    } else {
        list.innerHTML = state.employees.map(emp => `<li>${emp.name} (${emp.id})</li>`).join('');
    }
}

function searchBills() {
    const customer = document.getElementById('searchCustomer').value.trim().toLowerCase();
    const date = document.getElementById('searchDate').value;
    const output = document.getElementById('searchResult');
    const results = state.bills.filter(bill => {
        const matchCustomer = customer ? bill.customer.toLowerCase().includes(customer) : true;
        const matchDate = date ? bill.date === new Date(date).toLocaleDateString() : true;
        return matchCustomer && matchDate;
    });
    if (results.length === 0) {
        output.innerHTML = '<p>No matching bills found.</p>';
        return;
    }
    output.innerHTML = `<p>${results.length} result(s) found:</p><ul>${results.map(bill => `<li>${bill.date} - ${bill.customer} - ₹${bill.amount.toFixed(2)}</li>`).join('')}</ul>`;
}

async function submitContact(event) {
    event.preventDefault();
    const form = event.target;
    const success = document.getElementById('contactSuccess');
    const payload = {
        name: document.getElementById('contactName')?.value.trim(),
        email: document.getElementById('contactEmail')?.value.trim(),
        message: document.getElementById('contactMessage')?.value.trim()
    };
    await apiRequest('/api/contact', { method: 'POST', body: JSON.stringify(payload) }).catch(() => {});
    success.style.display = 'block';
    setTimeout(() => success.style.display = 'none', 3200);
    form.reset();
}

async function initPage() {
    setActiveNav();
    const page = document.body.dataset.page;
    await requireAdmin();
    if (await isAdmin()) await loadState();
    if (page === 'billing' || page === 'gst' || page === 'bill-details') {
        renderBillHistory();
    }
    if (page === 'attendance') {
        renderAttendanceTable();
        renderEmployeeList();
    }
}

function openLightbox(imageSrc) {
    const lightbox = document.getElementById('galleryLightbox');
    const img = document.getElementById('lightboxImg');
    if (lightbox && img) {
        img.src = imageSrc;
        lightbox.classList.add('active');
    }
}

function closeLightbox(event) {
    if (event.target.id === 'galleryLightbox' || event.target.classList.contains('lightbox-close')) {
        document.getElementById('galleryLightbox').classList.remove('active');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const passwordField = document.getElementById('adminPass');
    if (passwordField) {
        passwordField.addEventListener('keydown', event => {
            if (event.key === 'Enter') adminLogin();
        });
    }
    initPage();
});

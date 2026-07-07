// ── API HANDLERS TO BACKEND ──
const API_URL = 'http://localhost:5000/api';

function syncBookingsToBackend() {
    fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bk)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to sync bookings to backend:', data.error);
        }
    })
    .catch(err => console.error('Failed to sync bookings to backend:', err));
}

function syncMembersToBackend() {
    fetch(`${API_URL}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registeredMembers)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to sync members to backend:', data.error);
        }
    })
    .catch(err => console.error('Failed to sync members to backend:', err));
}

function loadBookingsFromBackend() {
    return fetch(`${API_URL}/bookings`)
    .then(res => res.json())
    .then(data => {
        bk = data;
        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
        if (typeof renderAdminSchedule === 'function') renderAdminSchedule();
        if (typeof renderAdminReports === 'function') renderAdminReports();
    })
    .catch(err => console.error('Error loading bookings:', err));
}

function loadMembersFromBackend() {
    return fetch(`${API_URL}/members`)
    .then(res => res.json())
    .then(data => {
        registeredMembers = data;
        if (typeof renderAdminMembers === 'function') renderAdminMembers();
    })
    .catch(err => console.error('Error loading members:', err));
}

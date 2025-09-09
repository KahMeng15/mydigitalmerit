// User Management JavaScript
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 10;
let selectedUsers = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) {
        return;
    }
    
    initializeEventListeners();
    loadUserStats();
    loadUsers();
});

// Initialize event listeners
function initializeEventListeners() {
    // Search and filter controls
    document.getElementById('searchUsers').addEventListener('input', debounce(filterUsers, 300));
    document.getElementById('filterRole').addEventListener('change', filterUsers);
    document.getElementById('filterStatus').addEventListener('change', filterUsers);
    document.getElementById('sortBy').addEventListener('change', filterUsers);
    
    // Selection controls
    document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
    
    // Action buttons
    document.getElementById('exportUsersBtn').addEventListener('click', exportUsers);
    document.getElementById('bulkActionsBtn').addEventListener('click', showBulkActionsMenu);
    document.getElementById('saveUserBtn').addEventListener('click', saveUserChanges);
    document.getElementById('confirmDeleteUserBtn').addEventListener('click', deleteUser);
    document.getElementById('editFromDetailBtn').addEventListener('click', editFromDetail);
}

// Load user statistics
async function loadUserStats() {
    try {
        const [usersSnapshot, userMeritsSnapshot] = await Promise.all([
            db.collection('users').get(),
            db.collection('userMerits').get()
        ]);
        const users = {};
        usersSnapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
        const userMerits = {};
        userMeritsSnapshot.forEach(doc => {
            userMerits[doc.id] = doc.data();
        });
        // Calculate statistics
        const totalUsers = Object.keys(users).length;
        const totalStudents = Object.values(users).filter(user => user.role === 'student').length;
        const totalAdmins = Object.values(users).filter(user => user.role === 'admin').length;
        // Calculate active users (users with activity in the last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const activeUsers = Object.values(users).filter(user => 
            user.lastActivity && user.lastActivity > thirtyDaysAgo
        ).length;
        // Update UI
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('totalStudents').textContent = totalStudents;
        document.getElementById('totalAdmins').textContent = totalAdmins;
        document.getElementById('activeUsers').textContent = activeUsers;
    } catch (error) {
        console.error('Error loading user stats:', error);
        showToast('Error loading statistics', 'error');
    }
}

// Load all users
async function loadUsers() {
    try {
        showLoading();
        const [usersSnapshot, userMeritsSnapshot] = await Promise.all([
            db.collection('users').get(),
            db.collection('userMerits').get()
        ]);
        const users = {};
        usersSnapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
        const userMerits = {};
        userMeritsSnapshot.forEach(doc => {
            userMerits[doc.id] = doc.data();
        });
        // Process users with merit counts
        allUsers = Object.entries(users).map(([uid, user]) => {
            const userMeritData = userMerits[uid] || {};
            let totalMerits = 0;
            // Calculate total merits for this user
            Object.values(userMeritData).forEach(eventMerits => {
                Object.values(eventMerits).forEach(merit => {
                    totalMerits += merit.meritPoints || merit.points || 0;
                });
            });
            return {
                uid,
                ...user,
                totalMerits,
                profileComplete: !!(user.displayName && user.matricNumber),
                lastActivityDate: user.lastActivity ? new Date(user.lastActivity) : null
            };
        });
        filteredUsers = [...allUsers];
        filterUsers();
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Error loading users', 'error');
    } finally {
        hideLoading();
    }
}

// Filter and sort users
function filterUsers() {
    const searchTerm = document.getElementById('searchUsers').value.toLowerCase();
    const roleFilter = document.getElementById('filterRole').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const sortBy = document.getElementById('sortBy').value;
    
    // Apply filters
    filteredUsers = allUsers.filter(user => {
        // Search filter
        const matchesSearch = !searchTerm || 
            user.displayName?.toLowerCase().includes(searchTerm) ||
            user.email?.toLowerCase().includes(searchTerm) ||
            user.matricNumber?.toLowerCase().includes(searchTerm);
        
        // Role filter
        const matchesRole = !roleFilter || user.role === roleFilter;
        
        // Status filter
        let matchesStatus = true;
        if (statusFilter === 'imported') {
            matchesStatus = !user.profileComplete;
        } else if (statusFilter === 'registered') {
            matchesStatus = user.profileComplete;
        } else if (statusFilter === 'incomplete') {
            matchesStatus = !user.displayName || !user.matricNumber;
        }
        
        return matchesSearch && matchesRole && matchesStatus;
    });
    
    // Apply sorting
    filteredUsers.sort((a, b) => {
        switch (sortBy) {
            case 'name-asc':
                return (a.displayName || '').localeCompare(b.displayName || '');
            case 'name-desc':
                return (b.displayName || '').localeCompare(a.displayName || '');
            case 'date-desc':
                return (b.createdAt || 0) - (a.createdAt || 0);
            case 'date-asc':
                return (a.createdAt || 0) - (b.createdAt || 0);
            case 'activity-desc':
                return (b.lastActivity || 0) - (a.lastActivity || 0);
            default:
                return 0;
        }
    });
    
    currentPage = 1;
    displayUsers();
}

// Display users in table
function displayUsers() {
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);
    
    const tbody = document.getElementById('usersTableBody');
    
    if (pageUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-secondary py-4">
                    No users found matching your criteria
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageUsers.map(user => `
            <tr>
                <td>
                    <input type="checkbox" class="form-check-input user-checkbox" 
                           value="${user.uid}" onchange="handleUserSelection()">
                </td>
                <td>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">
                            ${(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-medium">${user.displayName || 'Incomplete Profile'}</div>
                            <div class="text-sm text-secondary">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td>
                    ${user.matricNumber || '<span class="text-secondary">Not set</span>'}
                </td>
                <td>
                    <span class="badge ${user.role === 'admin' ? 'bg-warning' : 'bg-primary'}">
                        ${user.role || 'student'}
                    </span>
                </td>
                <td class="text-center">
                    <span class="font-medium">${user.totalMerits}</span>
                </td>
                <td>
                    <div class="flex items-center">
                        <span class="status-dot ${getActivityStatus(user)}"></span>
                        ${formatLastActivity(user.lastActivityDate)}
                    </div>
                </td>
                <td>
                    <span class="badge ${getStatusBadgeClass(user)}">
                        ${getStatusText(user)}
                    </span>
                </td>
                <td>
                    <div class="flex gap-1">
                        <button onclick="viewUser('${user.uid}')" 
                                class="btn btn-outline btn-sm" title="View Details">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </button>
                        <button onclick="editUser('${user.uid}')" 
                                class="btn btn-outline btn-sm" title="Edit User">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="confirmDeleteUser('${user.uid}')" 
                                class="btn btn-outline btn-sm text-danger" title="Delete User">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    updatePagination();
    updateUserCount();
}

// Helper functions for user status
function getActivityStatus(user) {
    if (!user.lastActivityDate) return 'status-offline';
    
    const daysSinceActivity = (Date.now() - user.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceActivity <= 7) return 'status-online';
    if (daysSinceActivity <= 30) return 'status-incomplete';
    return 'status-offline';
}

function formatLastActivity(date) {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffInMs = now - date;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays <= 7) return `${diffInDays} days ago`;
    if (diffInDays <= 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    
    return date.toLocaleDateString();
}

function getStatusBadgeClass(user) {
    if (!user.profileComplete) return 'bg-warning';
    if (user.role === 'admin') return 'bg-secondary';
    return 'bg-success';
}

function getStatusText(user) {
    if (!user.profileComplete) return 'Incomplete';
    if (user.role === 'admin') return 'Admin';
    return 'Active';
}

// User selection handling
function handleUserSelection() {
    selectedUsers = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
    
    const bulkActionsBtn = document.getElementById('bulkActionsBtn');
    const selectAllCheckbox = document.getElementById('selectAll');
    
    if (selectedUsers.length > 0) {
        bulkActionsBtn.classList.remove('d-none');
        bulkActionsBtn.textContent = `${selectedUsers.length} Selected`;
    } else {
        bulkActionsBtn.classList.add('d-none');
    }
    
    // Update select all checkbox state
    const allCheckboxes = document.querySelectorAll('.user-checkbox');
    const checkedCount = selectedUsers.length;
    
    if (checkedCount === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
    } else if (checkedCount === allCheckboxes.length) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
    } else {
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.checked = false;
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll').checked;
    const checkboxes = document.querySelectorAll('.user-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll;
    });
    
    handleUserSelection();
}

// View user details
async function viewUser(uid) {
    try {
        const user = allUsers.find(u => u.uid === uid);
        if (!user) return;
        
        const modal = document.getElementById('userDetailModal');
        const body = document.getElementById('userDetailBody');
        
        // Get user's merit details
        const userMeritsDoc = await db.collection('userMerits').doc(uid).get();
        const userMerits = userMeritsDoc.exists ? userMeritsDoc.data() : {};
        let meritsByEvent = {};
        let totalEvents = 0;
        let totalMerits = 0;
        Object.entries(userMerits).forEach(([eventId, eventMerits]) => {
            const eventTotal = Object.values(eventMerits).reduce((sum, merit) => sum + (merit.meritPoints || merit.points || 0), 0);
            meritsByEvent[eventId] = {
                count: Object.keys(eventMerits).length,
                total: eventTotal
            };
            totalEvents++;
            totalMerits += eventTotal;
        });
        
        body.innerHTML = `
            <div class="grid grid-cols-2 gap-6">
                <div>
                    <h4 class="font-medium mb-3">User Information</h4>
                    <div class="space-y-2">
                        <div><strong>Name:</strong> ${user.displayName || 'Not set'}</div>
                        <div><strong>Email:</strong> ${user.email}</div>
                        <div><strong>Matric Number:</strong> ${user.matricNumber || 'Not set'}</div>
                        <div><strong>Role:</strong> <span class="badge ${user.role === 'admin' ? 'bg-warning' : 'bg-primary'}">${user.role}</span></div>
                        <div><strong>Joined:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</div>
                        <div><strong>Last Activity:</strong> ${formatLastActivity(user.lastActivityDate)}</div>
                    </div>
                </div>
                <div>
                    <h4 class="font-medium mb-3">Merit Summary</h4>
                    <div class="space-y-2">
                        <div><strong>Total Merits:</strong> <span class="text-primary font-medium">${totalMerits}</span></div>
                        <div><strong>Events Participated:</strong> ${totalEvents}</div>
                        <div><strong>Profile Status:</strong> 
                            <span class="badge ${getStatusBadgeClass(user)}">${getStatusText(user)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            ${totalEvents > 0 ? `
                <div class="mt-4">
                    <h4 class="font-medium mb-3">Merit Breakdown by Event</h4>
                    <div class="max-h-40 overflow-y-auto">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Event ID</th>
                                    <th>Merit Count</th>
                                    <th>Total Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(meritsByEvent).map(([eventId, data]) => `
                                    <tr>
                                        <td class="font-mono text-sm">${eventId}</td>
                                        <td>${data.count}</td>
                                        <td class="font-medium">${data.total}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        `;
        
        // Store current user for editing
        modal.dataset.currentUserId = uid;
        modal.classList.remove('d-none');
        
    } catch (error) {
        console.error('Error viewing user:', error);
        showToast('Error loading user details', 'error');
    }
}

function closeUserDetailModal() {
    document.getElementById('userDetailModal').classList.add('d-none');
}

function editFromDetail() {
    const modal = document.getElementById('userDetailModal');
    const uid = modal.dataset.currentUserId;
    closeUserDetailModal();
    editUser(uid);
}

// Edit user
function editUser(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;
    
    document.getElementById('editDisplayName').value = user.displayName || '';
    document.getElementById('editMatricNumber').value = user.matricNumber || '';
    document.getElementById('editRole').value = user.role || 'student';
    document.getElementById('editEmail').value = user.email || '';
    
    const modal = document.getElementById('editUserModal');
    modal.dataset.currentUserId = uid;
    modal.classList.remove('d-none');
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.add('d-none');
}

// Save user changes
async function saveUserChanges() {
    const modal = document.getElementById('editUserModal');
    const uid = modal.dataset.currentUserId;
    
    const displayName = document.getElementById('editDisplayName').value.trim();
    const matricNumber = document.getElementById('editMatricNumber').value.trim();
    const role = document.getElementById('editRole').value;
    
    if (!displayName) {
        showToast('Display name is required', 'error');
        return;
    }
    
    if (matricNumber && !/^[A-Z][0-9]{8}$/.test(matricNumber)) {
        showToast('Matric number must be in format A12345678', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const updates = {
            displayName,
            role,
            updatedAt: Date.now()
        };
        
        if (matricNumber) {
            updates.matricNumber = matricNumber;
        }
        
    await db.collection('users').doc(uid).update(updates);
        
        showToast('User updated successfully', 'success');
        closeEditUserModal();
        loadUsers(); // Reload to reflect changes
        
    } catch (error) {
        console.error('Error updating user:', error);
        showToast('Error updating user', 'error');
    } finally {
        hideLoading();
    }
}

// Delete user confirmation
function confirmDeleteUser(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;
    
    document.getElementById('deleteUserInfo').innerHTML = `
        <div><strong>Name:</strong> ${user.displayName || 'Incomplete Profile'}</div>
        <div><strong>Email:</strong> ${user.email}</div>
        <div><strong>Role:</strong> ${user.role}</div>
        <div><strong>Total Merits:</strong> ${user.totalMerits}</div>
    `;
    
    const modal = document.getElementById('deleteUserModal');
    modal.dataset.currentUserId = uid;
    modal.classList.remove('d-none');
}

function closeDeleteUserModal() {
    document.getElementById('deleteUserModal').classList.add('d-none');
}

// Delete user
async function deleteUser() {
    const modal = document.getElementById('deleteUserModal');
    const uid = modal.dataset.currentUserId;
    
    try {
        showLoading();
        
        // Delete user data and associated merits
        await Promise.all([
            db.collection('users').doc(uid).delete(),
            db.collection('userMerits').doc(uid).delete()
        ]);
        showToast('User deleted successfully', 'success');
        closeDeleteUserModal();
        loadUsers(); // Reload to reflect changes
        loadUserStats(); // Update stats
        
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error deleting user', 'error');
    } finally {
        hideLoading();
    }
}

// Export users
function exportUsers() {
    const dataToExport = filteredUsers.map(user => ({
        'Display Name': user.displayName || '',
        'Email': user.email || '',
        'Matric Number': user.matricNumber || '',
        'Role': user.role || '',
        'Total Merits': user.totalMerits || 0,
        'Last Activity': formatLastActivity(user.lastActivityDate),
        'Profile Complete': user.profileComplete ? 'Yes' : 'No',
        'Joined Date': user.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''
    }));
    
    const csv = convertToCSV(dataToExport);
    downloadCSV(csv, `users_${new Date().toISOString().split('T')[0]}.csv`);
    
    showToast('Users exported successfully', 'success');
}

// Bulk actions (placeholder for future implementation)
function showBulkActionsMenu() {
    // For now, just show a simple alert
    const actions = [
        'Change Role to Student',
        'Change Role to Admin',
        'Export Selected',
        'Delete Selected'
    ];
    
    // This would typically show a dropdown menu
    showToast(`Bulk actions available for ${selectedUsers.length} users`, 'info');
}

// Update pagination
function updatePagination() {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    if (currentPage > 1) {
        paginationHTML += `<button onclick="changePage(${currentPage - 1})" class="btn btn-outline btn-sm">Previous</button>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button onclick="changePage(${i})" 
                    class="btn ${i === currentPage ? 'btn-primary' : 'btn-outline'} btn-sm">
                ${i}
            </button>
        `;
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `<button onclick="changePage(${currentPage + 1})" class="btn btn-outline btn-sm">Next</button>`;
    }
    
    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    currentPage = page;
    displayUsers();
}

// Update user count display
function updateUserCount() {
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = Math.min(startIndex + usersPerPage, filteredUsers.length);
    
    document.getElementById('showingFrom').textContent = filteredUsers.length > 0 ? startIndex + 1 : 0;
    document.getElementById('showingTo').textContent = endIndex;
    document.getElementById('userCount').textContent = `${filteredUsers.length} users`;
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

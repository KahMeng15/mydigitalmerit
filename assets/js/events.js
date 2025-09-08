// Events management functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();

    // Event listeners
    setupEventListeners();
});

let allEvents = [];
let filteredEvents = [];
let currentPage = 1;
const eventsPerPage = 10;

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Load events
    loadEvents();
}

function setupEventListeners() {
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Search and filters
    document.getElementById('searchEvents').addEventListener('input', 
        debounce(applyFilters, 300));
    document.getElementById('filterLevel').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('filterDate').addEventListener('change', applyFilters);
    
    // Export
    document.getElementById('exportBtn').addEventListener('click', exportEvents);
    
    // Delete confirmation
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
}

async function loadEvents() {
    try {
        showLoading();
        
        const eventsRef = database.ref('events');
        const snapshot = await eventsRef.once('value');
        const eventsData = snapshot.val() || {};
        
        allEvents = Object.entries(eventsData)
            .map(([id, event]) => ({ id, ...event }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Load merit counts for each event
        await loadMeritCounts();
        
        // Apply initial filters
        applyFilters();
        
    } catch (error) {
        console.error('Error loading events:', error);
        showToast('Error loading events', 'error');
        displayNoEvents('Error loading events');
    } finally {
        hideLoading();
    }
}

async function loadMeritCounts() {
    for (let event of allEvents) {
        try {
            // Count merits for this event across all users
            const userMeritsRef = database.ref('userMerits');
            const snapshot = await userMeritsRef.once('value');
            const allUserMerits = snapshot.val() || {};
            
            let meritCount = 0;
            for (const userId in allUserMerits) {
                const userMerits = allUserMerits[userId];
                if (userMerits[event.id]) {
                    meritCount += Object.keys(userMerits[event.id]).length;
                }
            }
            
            event.meritCount = meritCount;
        } catch (error) {
            console.error(`Error loading merit count for event ${event.id}:`, error);
            event.meritCount = 0;
        }
    }
}

function applyFilters() {
    const searchTerm = document.getElementById('searchEvents').value.toLowerCase();
    const levelFilter = document.getElementById('filterLevel').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const dateFilter = document.getElementById('filterDate').value;
    
    filteredEvents = allEvents.filter(event => {
        // Search filter
        const matchesSearch = !searchTerm || 
            event.name.toLowerCase().includes(searchTerm) ||
            (event.organizer && event.organizer.toLowerCase().includes(searchTerm)) ||
            (event.location && event.location.toLowerCase().includes(searchTerm));
        
        // Level filter
        const matchesLevel = !levelFilter || event.level === levelFilter;
        
        // Status filter
        const matchesStatus = !statusFilter || event.status === statusFilter;
        
        // Date filter
        let matchesDate = true;
        if (dateFilter) {
            const eventDate = new Date(event.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            switch (dateFilter) {
                case 'upcoming':
                    matchesDate = eventDate >= today;
                    break;
                case 'past':
                    matchesDate = eventDate < today;
                    break;
                case 'today':
                    const todayEnd = new Date(today);
                    todayEnd.setHours(23, 59, 59, 999);
                    matchesDate = eventDate >= today && eventDate <= todayEnd;
                    break;
            }
        }
        
        return matchesSearch && matchesLevel && matchesStatus && matchesDate;
    });
    
    currentPage = 1;
    displayEvents();
    updatePagination();
}

function displayEvents() {
    const tableBody = document.getElementById('eventsTableBody');
    const eventCount = document.getElementById('eventCount');
    
    eventCount.textContent = `${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`;
    
    if (filteredEvents.length === 0) {
        displayNoEvents('No events found matching your criteria');
        return;
    }
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * eventsPerPage;
    const endIndex = startIndex + eventsPerPage;
    const eventsToShow = filteredEvents.slice(startIndex, endIndex);
    
    // Update showing info
    document.getElementById('showingFrom').textContent = startIndex + 1;
    document.getElementById('showingTo').textContent = Math.min(endIndex, filteredEvents.length);
    document.getElementById('totalEvents').textContent = filteredEvents.length;
    
    tableBody.innerHTML = eventsToShow.map(event => {
        const eventDate = new Date(event.date);
        const isUpcoming = eventDate.getTime() > Date.now();
        const statusClass = getStatusClass(event.status, isUpcoming);
        const statusText = getStatusText(event.status, isUpcoming);
        
        return `
            <tr>
                <td>
                    <div class="font-medium">${sanitizeHTML(event.name)}</div>
                    ${event.description ? `<div class="text-sm text-secondary">${sanitizeHTML(event.description.substring(0, 50))}${event.description.length > 50 ? '...' : ''}</div>` : ''}
                </td>
                <td><span class="badge bg-primary">${sanitizeHTML(event.level)}</span></td>
                <td>
                    <div>${formatDate(event.date)}</div>
                    ${event.date.includes('T') ? `<div class="text-sm text-secondary">${new Date(event.date).toLocaleTimeString('en-MY', {hour: '2-digit', minute: '2-digit'})}</div>` : ''}
                </td>
                <td>${sanitizeHTML(event.location || '-')}</td>
                <td>${sanitizeHTML(event.organizer || '-')}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td class="text-center">
                    <span class="font-medium">${event.meritCount || 0}</span>
                </td>
                <td>
                    <div class="flex gap-1">
                        <button onclick="viewEvent('${event.id}')" class="btn btn-outline btn-sm" title="View Details">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </button>
                        <a href="upload-merits.html?eventId=${event.id}" class="btn btn-success btn-sm" title="Add Merits">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                            </svg>
                        </a>
                        <button onclick="editEvent('${event.id}')" class="btn btn-warning btn-sm" title="Edit Event">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="deleteEvent('${event.id}')" class="btn btn-danger btn-sm" title="Delete Event">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function displayNoEvents(message) {
    document.getElementById('eventsTableBody').innerHTML = `
        <tr>
            <td colspan="8" class="text-center text-secondary">${message}</td>
        </tr>
    `;
    document.getElementById('eventCount').textContent = '0 events';
}

function getStatusClass(status, isUpcoming) {
    if (status === 'draft') return 'bg-secondary';
    if (status === 'active' && isUpcoming) return 'bg-success';
    if (status === 'active' && !isUpcoming) return 'bg-warning';
    return 'bg-secondary';
}

function getStatusText(status, isUpcoming) {
    if (status === 'draft') return 'Draft';
    if (status === 'active' && isUpcoming) return 'Upcoming';
    if (status === 'active' && !isUpcoming) return 'Completed';
    return status;
}

function updatePagination() {
    const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);
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
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            paginationHTML += `<button class="btn btn-primary btn-sm">${i}</button>`;
        } else if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `<button onclick="changePage(${i})" class="btn btn-outline btn-sm">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span class="px-2">...</span>`;
        }
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `<button onclick="changePage(${currentPage + 1})" class="btn btn-outline btn-sm">Next</button>`;
    }
    
    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    currentPage = page;
    displayEvents();
    updatePagination();
}

async function viewEvent(eventId) {
    try {
        const event = allEvents.find(e => e.id === eventId);
        if (!event) return;
        
        const modalBody = document.getElementById('eventModalBody');
        modalBody.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <h4 class="font-semibold mb-2">Event Information</h4>
                    <div class="space-y-2">
                        <div><strong>Name:</strong> ${sanitizeHTML(event.name)}</div>
                        <div><strong>Level:</strong> ${sanitizeHTML(event.level)}</div>
                        <div><strong>Date:</strong> ${formatDateTime(event.date)}</div>
                        <div><strong>Location:</strong> ${sanitizeHTML(event.location || 'Not specified')}</div>
                        <div><strong>Organizer:</strong> ${sanitizeHTML(event.organizer || 'Not specified')}</div>
                        <div><strong>Status:</strong> ${getStatusText(event.status, new Date(event.date).getTime() > Date.now())}</div>
                    </div>
                </div>
                <div>
                    <h4 class="font-semibold mb-2">Statistics</h4>
                    <div class="space-y-2">
                        <div><strong>Total Merits:</strong> ${event.meritCount || 0}</div>
                        <div><strong>Created:</strong> ${formatDateTime(event.createdAt)}</div>
                    </div>
                    ${event.description ? `
                        <h4 class="font-semibold mt-4 mb-2">Description</h4>
                        <p class="text-sm">${sanitizeHTML(event.description)}</p>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.getElementById('editEventBtn').onclick = () => editEvent(eventId);
        document.getElementById('eventModal').classList.remove('d-none');
        
    } catch (error) {
        console.error('Error viewing event:', error);
        showToast('Error loading event details', 'error');
    }
}

function closeEventModal() {
    document.getElementById('eventModal').classList.add('d-none');
}

function editEvent(eventId) {
    window.location.href = `edit-event.html?id=${eventId}`;
}

let eventToDelete = null;

function deleteEvent(eventId) {
    eventToDelete = eventId;
    document.getElementById('deleteModal').classList.remove('d-none');
}

function closeDeleteModal() {
    eventToDelete = null;
    document.getElementById('deleteModal').classList.add('d-none');
}

async function confirmDelete() {
    if (!eventToDelete) return;
    
    try {
        showLoading();
        
        // Delete event
        await database.ref(`events/${eventToDelete}`).remove();
        
        // Delete associated merits
        const userMeritsRef = database.ref('userMerits');
        const snapshot = await userMeritsRef.once('value');
        const allUserMerits = snapshot.val() || {};
        
        for (const userId in allUserMerits) {
            if (allUserMerits[userId][eventToDelete]) {
                await database.ref(`userMerits/${userId}/${eventToDelete}`).remove();
            }
        }
        
        showToast('Event deleted successfully', 'success');
        closeDeleteModal();
        loadEvents(); // Reload events
        
    } catch (error) {
        console.error('Error deleting event:', error);
        showToast('Error deleting event: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function exportEvents() {
    if (filteredEvents.length === 0) {
        showToast('No events to export', 'warning');
        return;
    }
    
    const exportData = filteredEvents.map(event => ({
        'Event Name': event.name,
        'Level': event.level,
        'Date': formatDate(event.date),
        'Time': event.date.includes('T') ? new Date(event.date).toLocaleTimeString('en-MY', {hour: '2-digit', minute: '2-digit'}) : '',
        'Location': event.location || '',
        'Organizer': event.organizer || '',
        'Status': getStatusText(event.status, new Date(event.date).getTime() > Date.now()),
        'Merit Count': event.meritCount || 0,
        'Created Date': formatDateTime(event.createdAt)
    }));
    
    exportToCSV(exportData, `events_export_${new Date().toISOString().split('T')[0]}.csv`);
    showToast('Events exported successfully', 'success');
}

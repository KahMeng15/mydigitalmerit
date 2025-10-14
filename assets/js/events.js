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
    
    // Add a small delay to ensure Firebase is fully initialized
    setTimeout(() => {
        loadEvents();
    }, 100);
}function setupEventListeners() {
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
}

async function loadEvents() {
    try {
        showLoading();
        
        // Check if firestore is available
        if (!window.firebase || !window.firestore) {
            console.error('Firebase or Firestore not initialized');
            throw new Error('Firebase not properly initialized');
        }
        
        const eventsSnapshot = await firestore.collection('events').get();
        allEvents = eventsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(event => !event.isSubActivity)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log('Loaded events:', allEvents.length);
        
        if (allEvents.length === 0) {
            displayNoEvents('No events found. Create your first event using the "Create Event" button.');
            return;
        }
        
        // Load organizer details for each event
        await loadAllOrganizerDetails();
        
        // Load merit counts for each event
        await loadMeritCounts();
        
        // Apply initial filters
        applyFilters();
        
    } catch (error) {
        console.error('Error loading events:', error);
        showToast('Error loading events: ' + error.message, 'error');
        displayNoEvents('Error loading events');
    } finally {
        hideLoading();
    }
}

async function loadAllOrganizerDetails() {
    for (let event of allEvents) {
        if (event.organizer && typeof event.organizer === 'object') {
            try {
                // Load main organizer details
                if (event.organizer.main_id) {
                    const mainOrgDoc = await firestore.collection('organizers').doc(event.organizer.main_id).get();
                    if (mainOrgDoc.exists) {
                        const mainOrgData = mainOrgDoc.data();
                        event.organizer.main_name_en = mainOrgData.name_en;
                        event.organizer.main_name_bm = mainOrgData.name_bm;
                    }
                }
                
                // Load sub organizer details
                if (event.organizer.sub_id) {
                    const subOrgDoc = await firestore.collection('subOrganizers').doc(event.organizer.sub_id).get();
                    if (subOrgDoc.exists) {
                        const subOrgData = subOrgDoc.data();
                        event.organizer.sub_name_en = subOrgData.name_en;
                        event.organizer.sub_name_bm = subOrgData.name_bm;
                    }
                }
            } catch (error) {
                console.error('Error loading organizer details for event:', event.id, error);
            }
        }
    }
}

async function loadMeritCounts() {
    for (let event of allEvents) {
        try {
            // Count merits for this event across all users
            let count = 0;
            const userMeritsSnapshot = await firestore.collection('userMerits').get();
            userMeritsSnapshot.forEach(userDoc => {
                const userMerits = userDoc.data();
                if (userMerits[event.id]) {
                    count += Object.keys(userMerits[event.id]).length;
                }
            });
            event.meritCount = count;
        } catch (error) {
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
    
    // Filter to show only parent events (not child activities)
    const parentEvents = filteredEvents.filter(event => !event.isSubActivity);
    
    eventCount.textContent = `${parentEvents.length} event${parentEvents.length !== 1 ? 's' : ''}`;
    
    if (parentEvents.length === 0) {
        displayNoEvents('No events found matching your criteria');
        return;
    }
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * eventsPerPage;
    const endIndex = startIndex + eventsPerPage;
    const eventsToShow = parentEvents.slice(startIndex, endIndex);
    
    // Update showing info
    document.getElementById('showingFrom').textContent = startIndex + 1;
    document.getElementById('showingTo').textContent = Math.min(endIndex, parentEvents.length);
    document.getElementById('totalEvents').textContent = parentEvents.length;
    
    tableBody.innerHTML = eventsToShow.map(event => {
        const eventDate = new Date(event.date);
        const isUpcoming = eventDate.getTime() > Date.now();
        const statusClass = getStatusClass(event.status, isUpcoming);
        const statusText = getStatusText(event.status, isUpcoming);
        
        // Count child activities for this parent event
        const childActivityCount = filteredEvents.filter(e => e.isSubActivity && e.parentEventId === event.id).length;
        
        return `
            <tr>
                <td>
                    <div class="font-medium">${sanitizeHTML(event.name)}</div>
                    ${event.description ? `<div class="text-sm text-secondary">${sanitizeHTML(event.description.substring(0, 50))}${event.description.length > 50 ? '...' : ''}</div>` : ''}
                    ${childActivityCount > 0 ? `<div class="text-xs text-info mt-1">📋 ${childActivityCount} child activit${childActivityCount > 1 ? 'ies' : 'y'}</div>` : ''}
                </td>
                <td><span class="badge bg-primary">${sanitizeHTML(event.level)}</span></td>
                <td>
                    <div>${formatDate(event.date)}</div>
                    ${event.date.includes('T') ? `<div class="text-sm text-secondary">${new Date(event.date).toLocaleTimeString('en-MY', {hour: '2-digit', minute: '2-digit'})}</div>` : ''}
                </td>
                <td>${sanitizeHTML(event.location || '-')}</td>
                <td>${getOrganizerDisplay(event.organizer)}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td class="text-center">
                    <span class="font-medium">${event.meritCount || 0}</span>
                </td>
                <td>
                    <button onclick="viewEvent('${event.id}')" class="btn btn-primary btn-sm" title="View Details">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        View More
                    </button>
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

function getOrganizerDisplay(organizer) {
    if (!organizer) return '-';
    
    // If organizer is a string (old format), return as is
    if (typeof organizer === 'string') {
        return sanitizeHTML(organizer);
    }
    
    // If organizer is an object (new format), extract the names with EN/BM format
    if (typeof organizer === 'object') {
        let display = '';
        
        // Main organizer with EN/BM format
        if (organizer.main_name_en && organizer.main_name_bm) {
            display = `${sanitizeHTML(organizer.main_name_en)} / ${sanitizeHTML(organizer.main_name_bm)}`;
        } else if (organizer.main_name) {
            display = sanitizeHTML(organizer.main_name);
        }
        
        // Sub organizer with EN/BM format
        if (organizer.sub_name_en && organizer.sub_name_bm) {
            const subDisplay = `${sanitizeHTML(organizer.sub_name_en)} / ${sanitizeHTML(organizer.sub_name_bm)}`;
            display += display ? `<br><small>${subDisplay}</small>` : subDisplay;
        } else if (organizer.sub_name) {
            display += display ? `<br><small>${sanitizeHTML(organizer.sub_name)}</small>` : sanitizeHTML(organizer.sub_name);
        }
        
        return display || '-';
    }
    
    return '-';
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

function viewEvent(eventId) {
    window.location.href = `event-details.html?id=${eventId}`;
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

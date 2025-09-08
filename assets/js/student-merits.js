// Student Merits page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!requireAuth()) return;

    // Initialize page
    initializePage();
    setupEventListeners();
});

let allMerits = [];
let filteredMerits = [];
let events = {};
let currentPage = 1;
const recordsPerPage = 15;

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Load data
    loadMeritsData();
}

function setupEventListeners() {
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Search and filters
    document.getElementById('searchMerits').addEventListener('input', 
        debounce(applyFilters, 300));
    document.getElementById('filterLevel').addEventListener('change', applyFilters);
    document.getElementById('filterRole').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    
    // Export
    document.getElementById('exportBtn').addEventListener('click', exportMerits);
}

async function loadMeritsData() {
    try {
        showLoading();
        
        // Load user's merits and events
        await Promise.all([
            loadStudentMerits(),
            loadEvents()
        ]);
        
        // Process data
        populateFilterOptions();
        calculateSummaryStats();
        applyFilters();
        
    } catch (error) {
        console.error('Error loading merits data:', error);
        showToast('Error loading merit records', 'error');
        displayNoMerits('Error loading merit records');
    } finally {
        hideLoading();
    }
}

async function loadStudentMerits() {
    try {
        const user = getCurrentUser();
        const meritsRef = database.ref(`userMerits/${user.uid}`);
        const snapshot = await meritsRef.once('value');
        const meritsData = snapshot.val() || {};
        
        // Flatten merit records
        allMerits = [];
        for (const eventId in meritsData) {
            const eventMerits = meritsData[eventId];
            for (const meritId in eventMerits) {
                allMerits.push({
                    eventId,
                    meritId,
                    ...eventMerits[meritId]
                });
            }
        }
        
    } catch (error) {
        console.error('Error loading student merits:', error);
        allMerits = [];
    }
}

async function loadEvents() {
    try {
        const eventsRef = database.ref('events');
        const snapshot = await eventsRef.once('value');
        events = snapshot.val() || {};
    } catch (error) {
        console.error('Error loading events:', error);
        events = {};
    }
}

function populateFilterOptions() {
    // Populate role filter with unique roles
    const roles = [...new Set(allMerits.map(merit => merit.role).filter(Boolean))];
    const roleSelect = document.getElementById('filterRole');
    
    roleSelect.innerHTML = '<option value="">All Roles</option>';
    roles.sort().forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role;
        roleSelect.appendChild(option);
    });
}

function calculateSummaryStats() {
    const totalMerits = allMerits.reduce((sum, merit) => sum + (merit.meritPoints || 0), 0);
    const uniqueEvents = new Set(allMerits.map(merit => merit.eventId));
    const averageMerit = uniqueEvents.size > 0 ? Math.round(totalMerits / uniqueEvents.size) : 0;
    
    // Find last activity
    const sortedMerits = allMerits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const lastActivity = sortedMerits.length > 0 ? formatDate(sortedMerits[0].createdAt) : '-';
    
    document.getElementById('totalMerits').textContent = totalMerits;
    document.getElementById('totalEvents').textContent = uniqueEvents.size;
    document.getElementById('averageMerit').textContent = averageMerit;
    document.getElementById('lastActivity').textContent = lastActivity;
}

function applyFilters() {
    const searchTerm = document.getElementById('searchMerits').value.toLowerCase();
    const levelFilter = document.getElementById('filterLevel').value;
    const roleFilter = document.getElementById('filterRole').value;
    const sortBy = document.getElementById('sortBy').value;
    
    // Filter merits
    filteredMerits = allMerits.filter(merit => {
        const event = events[merit.eventId] || {};
        
        // Search filter
        const matchesSearch = !searchTerm || 
            (event.name && event.name.toLowerCase().includes(searchTerm)) ||
            (merit.role && merit.role.toLowerCase().includes(searchTerm)) ||
            (merit.additionalNotes && merit.additionalNotes.toLowerCase().includes(searchTerm));
        
        // Level filter
        const matchesLevel = !levelFilter || merit.eventLevel === levelFilter;
        
        // Role filter
        const matchesRole = !roleFilter || merit.role === roleFilter;
        
        return matchesSearch && matchesLevel && matchesRole;
    });
    
    // Sort merits
    sortMerits(sortBy);
    
    currentPage = 1;
    displayMerits();
    updatePagination();
}

function sortMerits(sortBy) {
    switch (sortBy) {
        case 'date-desc':
            filteredMerits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            break;
        case 'date-asc':
            filteredMerits.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            break;
        case 'points-desc':
            filteredMerits.sort((a, b) => (b.meritPoints || 0) - (a.meritPoints || 0));
            break;
        case 'points-asc':
            filteredMerits.sort((a, b) => (a.meritPoints || 0) - (b.meritPoints || 0));
            break;
        case 'event-name':
            filteredMerits.sort((a, b) => {
                const eventA = events[a.eventId]?.name || '';
                const eventB = events[b.eventId]?.name || '';
                return eventA.localeCompare(eventB);
            });
            break;
    }
}

function displayMerits() {
    const tableBody = document.getElementById('meritsTableBody');
    const recordCount = document.getElementById('recordCount');
    
    recordCount.textContent = `${filteredMerits.length} record${filteredMerits.length !== 1 ? 's' : ''}`;
    
    if (filteredMerits.length === 0) {
        displayNoMerits('No merit records found matching your criteria');
        return;
    }
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const meritsToShow = filteredMerits.slice(startIndex, endIndex);
    
    // Update showing info
    document.getElementById('showingFrom').textContent = startIndex + 1;
    document.getElementById('showingTo').textContent = Math.min(endIndex, filteredMerits.length);
    document.getElementById('totalRecords').textContent = filteredMerits.length;
    
    tableBody.innerHTML = meritsToShow.map(merit => {
        const event = events[merit.eventId] || {};
        const eventName = event.name || 'Unknown Event';
        const eventDate = event.date || merit.createdAt;
        
        return `
            <tr>
                <td>
                    <div class="font-medium">${sanitizeHTML(eventName)}</div>
                    ${event.organizer ? `<div class="text-sm text-secondary">${sanitizeHTML(event.organizer)}</div>` : ''}
                </td>
                <td>${formatDate(eventDate)}</td>
                <td><span class="badge bg-primary">${sanitizeHTML(merit.eventLevel || 'Unknown')}</span></td>
                <td><span class="badge bg-secondary">${sanitizeHTML(merit.role || '')}</span></td>
                <td class="font-bold text-success text-lg">${merit.meritPoints || 0}</td>
                <td>
                    ${merit.additionalNotes ? 
                        `<span class="text-sm">${sanitizeHTML(merit.additionalNotes)}</span>` : 
                        '<span class="text-secondary">-</span>'
                    }
                </td>
                <td>
                    ${merit.linkProof ? 
                        `<a href="${sanitizeHTML(merit.linkProof)}" target="_blank" class="btn btn-outline btn-sm">View</a>` : 
                        '<span class="text-secondary">-</span>'
                    }
                </td>
                <td>
                    <button onclick="viewMeritDetail('${merit.eventId}', '${merit.meritId}')" 
                            class="btn btn-outline btn-sm" title="View Details">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function displayNoMerits(message) {
    document.getElementById('meritsTableBody').innerHTML = `
        <tr>
            <td colspan="8" class="text-center text-secondary">${message}</td>
        </tr>
    `;
    document.getElementById('recordCount').textContent = '0 records';
}

function updatePagination() {
    const totalPages = Math.ceil(filteredMerits.length / recordsPerPage);
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
    displayMerits();
    updatePagination();
}

function viewMeritDetail(eventId, meritId) {
    const merit = allMerits.find(m => m.eventId === eventId && m.meritId === meritId);
    const event = events[eventId] || {};
    
    if (!merit) return;
    
    const modalBody = document.getElementById('meritModalBody');
    modalBody.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div>
                <h4 class="font-semibold mb-3">Event Information</h4>
                <div class="space-y-2">
                    <div><strong>Event:</strong> ${sanitizeHTML(event.name || 'Unknown Event')}</div>
                    <div><strong>Level:</strong> ${sanitizeHTML(merit.eventLevel || 'Unknown')}</div>
                    <div><strong>Date:</strong> ${formatDate(event.date || merit.createdAt)}</div>
                    <div><strong>Location:</strong> ${sanitizeHTML(event.location || 'Not specified')}</div>
                    <div><strong>Organizer:</strong> ${sanitizeHTML(event.organizer || 'Not specified')}</div>
                </div>
            </div>
            <div>
                <h4 class="font-semibold mb-3">Merit Details</h4>
                <div class="space-y-2">
                    <div><strong>Role:</strong> ${sanitizeHTML(merit.role || '')}</div>
                    <div><strong>Merit Points:</strong> <span class="text-success font-bold">${merit.meritPoints || 0}</span></div>
                    <div><strong>Merit Type:</strong> ${sanitizeHTML(merit.meritType || 'Standard')}</div>
                    <div><strong>Recorded:</strong> ${formatDateTime(merit.createdAt)}</div>
                </div>
                
                ${merit.additionalNotes ? `
                    <h4 class="font-semibold mt-4 mb-2">Achievement Notes</h4>
                    <p class="text-sm bg-light p-3 rounded">${sanitizeHTML(merit.additionalNotes)}</p>
                ` : ''}
                
                ${merit.linkProof ? `
                    <h4 class="font-semibold mt-4 mb-2">Proof Link</h4>
                    <a href="${sanitizeHTML(merit.linkProof)}" target="_blank" class="btn btn-primary btn-sm">
                        View Evidence
                    </a>
                ` : ''}
            </div>
        </div>
        
        ${event.description ? `
            <div class="mt-4">
                <h4 class="font-semibold mb-2">Event Description</h4>
                <p class="text-sm text-secondary">${sanitizeHTML(event.description)}</p>
            </div>
        ` : ''}
    `;
    
    document.getElementById('meritModal').classList.remove('d-none');
}

function closeMeritModal() {
    document.getElementById('meritModal').classList.add('d-none');
}

function exportMerits() {
    if (filteredMerits.length === 0) {
        showToast('No merit records to export', 'warning');
        return;
    }
    
    const exportData = filteredMerits.map(merit => {
        const event = events[merit.eventId] || {};
        return {
            'Event Name': event.name || 'Unknown Event',
            'Event Date': formatDate(event.date || merit.createdAt),
            'Event Level': merit.eventLevel || '',
            'Event Location': event.location || '',
            'Event Organizer': event.organizer || '',
            'My Role': merit.role || '',
            'Merit Points': merit.meritPoints || 0,
            'Merit Type': merit.meritType || '',
            'Achievement Notes': merit.additionalNotes || '',
            'Proof Link': merit.linkProof || '',
            'Recorded Date': formatDateTime(merit.createdAt)
        };
    });
    
    const user = getCurrentUser();
    const filename = `my_merits_${user.matricNumber || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;
    
    exportToCSV(exportData, filename);
    showToast('Merit records exported successfully', 'success');
}

// Event details page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
});

let currentEventId = null;
let currentEventData = null;

// Map event levels to database level names
function mapEventLevelToDbLevel(eventLevel) {
    const levelMapping = {
        'University': 'University',
        'Faculty': 'National', // Faculty level maps to National level
        'College': 'College',
        'Club': 'Block', // Club level maps to Block level
        'External': 'International'
    };
    return levelMapping[eventLevel] || eventLevel;
}

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Get event ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('id');
    
    if (!currentEventId) {
        showToast('Event ID not provided', 'error');
        window.location.href = 'events.html';
        return;
    }

    // Setup event listeners
    setupEventListeners();
    
    // Load event data
    loadEventDetails();
}

function setupEventListeners() {
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Action buttons
    document.getElementById('editEventBtn').addEventListener('click', () => editEvent(currentEventId));
    document.getElementById('deleteEventBtn').addEventListener('click', () => showDeleteModal());
    document.getElementById('refreshMerits').addEventListener('click', () => loadUploadedMerits());
    document.getElementById('exportMerits').addEventListener('click', exportMerits);
    
    // Delete confirmation
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
}

async function loadEventDetails() {
    try {
        showLoading();
        
        // Load event data
        const eventDoc = await firestore.collection('events').doc(currentEventId).get();
        if (!eventDoc.exists) {
            throw new Error('Event not found');
        }
        
        currentEventData = { id: eventDoc.id, ...eventDoc.data() };
        
        // Load organizer details if needed
        await loadOrganizerDetails(currentEventData);
        
        // Display event information
        displayEventInfo(currentEventData);
        
        // Load merit types for this event
        await loadMeritTypes();
        
        // Load uploaded merits
        await loadUploadedMerits();
        
    } catch (error) {
        console.error('Error loading event details:', error);
        showToast('Error loading event: ' + error.message, 'error');
        setTimeout(() => {
            window.location.href = 'events.html';
        }, 2000);
    } finally {
        hideLoading();
    }
}

async function loadOrganizerDetails(event) {
    try {
        if (event.organizer && typeof event.organizer === 'object') {
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
        }
    } catch (error) {
        console.error('Error loading organizer details:', error);
    }
}

function displayEventInfo(event) {
    // Update page title and breadcrumb
    document.title = `${event.name} - Event Details`;
    document.getElementById('eventBreadcrumb').textContent = event.name;
    
    // Header information
    document.getElementById('eventTitle').textContent = event.name;
    
    // Calculate status information
    const isUpcoming = new Date(event.date).getTime() > Date.now();
    const statusClass = getStatusClass(event.status, isUpcoming);
    const statusText = getStatusText(event.status, isUpcoming);
    
    // Detailed information
    document.getElementById('eventName').textContent = event.name;
    
    // Level badge with proper styling
    const levelBadge = document.getElementById('eventLevelText');
    levelBadge.textContent = event.level;
    levelBadge.className = `badge ${getLevelClass(event.level)}`;
    
    // Status badge with proper styling
    const statusTextBadge = document.getElementById('eventStatusText');
    statusTextBadge.textContent = statusText;
    statusTextBadge.className = `badge ${statusClass}`;
    
    document.getElementById('eventDateTime').textContent = formatDateTime(event.date);
    document.getElementById('eventLocation').textContent = event.location || 'Not specified';
    document.getElementById('eventOrganizer').innerHTML = getOrganizerDisplay(event.organizer);
    
    // Description (optional)
    if (event.description && event.description.trim()) {
        document.getElementById('eventDescription').textContent = event.description;
        document.getElementById('eventDescriptionSection').classList.remove('d-none');
    }
    
    // Update upload merits button
    document.getElementById('uploadMeritsBtn').href = `upload-merits.html?eventId=${event.id}`;
}

async function loadMeritTypes() {
    try {
        // Load merit values
        const meritValuesSnapshot = await firestore.collection('meritvalue').get();
        let meritValues = { roles: {}, levels: {} };
        
        // Process each level document
        meritValuesSnapshot.forEach(doc => {
            const levelName = doc.id; // e.g., "Block Level", "University Level"
            const levelData = doc.data();
            
            // Convert level name to match event levels (remove " Level" suffix)
            const eventLevelName = levelName.replace(' Level', '');
            meritValues.levels[eventLevelName] = levelData;
            
            // For each role in this level, add to roles object
            Object.entries(levelData).forEach(([roleName, points]) => {
                if (!meritValues.roles[roleName]) {
                    meritValues.roles[roleName] = {};
                }
                meritValues.roles[roleName][eventLevelName] = points;
            });
        });
        
        // Display merit types grid
        displayMeritTypes(meritValues);
        
    } catch (error) {
        console.error('Error loading merit types:', error);
        document.getElementById('meritTypesGrid').innerHTML = '<p class="text-secondary col-span-3 text-center">Error loading merit types</p>';
    }
}

function displayMeritTypes(meritValues) {
    const grid = document.getElementById('meritTypesGrid');
    let html = '';
    
    // Base roles
    if (meritValues.roles && currentEventData.level) {
        const dbLevel = mapEventLevelToDbLevel(currentEventData.level);
        const sortedRoles = Object.entries(meritValues.roles)
            .map(([role, levels]) => ({
                role: role,
                points: levels[dbLevel] || 0
            }))
            .sort((a, b) => b.points - a.points);
        
        sortedRoles.forEach(({ role, points }) => {
            html += `
                <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <div class="font-semibold text-gray-800 mb-2">${sanitizeHTML(role)}</div>
                    <div class="text-2xl font-bold text-blue-600 mb-1">${points} points</div>
                    <div class="text-xs text-gray-500 font-medium uppercase tracking-wide">Base Role</div>
                </div>
            `;
        });
    }
    
    // Custom roles
    if (currentEventData.customRoles && currentEventData.customRoles.length > 0) {
        const sortedCustomRoles = [...currentEventData.customRoles]
            .sort((a, b) => b.value - a.value);
        
        sortedCustomRoles.forEach(role => {
            html += `
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-300 shadow-sm hover:shadow-md transition-shadow">
                    <div class="font-semibold text-blue-800 mb-2">${sanitizeHTML(role.name)}</div>
                    <div class="text-2xl font-bold text-blue-600 mb-1">${role.value} points</div>
                    <div class="text-xs text-blue-500 font-medium uppercase tracking-wide">Custom Role</div>
                </div>
            `;
        });
    }
    
    if (!html) {
        html = '<div class="col-span-3 flex items-center justify-center h-32"><p class="text-secondary text-center">No merit types configured for this event</p></div>';
    }
    
    grid.innerHTML = html;
}

async function loadUploadedMerits() {
    try {
        const tableBody = document.getElementById('uploadedMeritsTable');
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">Loading merits...</td></tr>';
        
        // Load all user merits and filter for this event
        const userMeritsSnapshot = await firestore.collection('userMerits').get();
        const uploadedMerits = [];
        let totalMerits = 0;
        const meritBreakdown = {};
        
        userMeritsSnapshot.forEach(userDoc => {
            const userMerits = userDoc.data();
            const userId = userDoc.id;
            
            if (userMerits[currentEventId]) {
                const eventMerits = userMerits[currentEventId];
                Object.entries(eventMerits).forEach(([roleType, merit]) => {
                    uploadedMerits.push({
                        userId: userId,
                        studentName: merit.studentName || 'Unknown',
                        matricNumber: merit.matricNumber || 'Unknown',
                        role: roleType,
                        points: merit.points || 0,
                        uploadDate: merit.uploadDate || 'Unknown'
                    });
                    
                    totalMerits += merit.points || 0;
                    
                    // Count for breakdown
                    if (!meritBreakdown[roleType]) {
                        meritBreakdown[roleType] = { count: 0, totalPoints: 0 };
                    }
                    meritBreakdown[roleType].count++;
                    meritBreakdown[roleType].totalPoints += merit.points || 0;
                });
            }
        });
        
        // Update statistics
        document.getElementById('totalMerits').textContent = totalMerits.toLocaleString();
        displayMeritBreakdown(meritBreakdown);
        
        // Display uploaded merits table
        if (uploadedMerits.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">No merits uploaded yet</td></tr>';
        } else {
            // Sort by upload date (newest first)
            uploadedMerits.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
            
            tableBody.innerHTML = uploadedMerits.map(merit => `
                <tr>
                    <td>${sanitizeHTML(merit.studentName)}</td>
                    <td>${sanitizeHTML(merit.matricNumber)}</td>
                    <td>${sanitizeHTML(merit.role)}</td>
                    <td class="font-medium">${merit.points} points</td>
                    <td>${formatDate(merit.uploadDate)}</td>
                </tr>
            `).join('');
        }
        
    } catch (error) {
        console.error('Error loading uploaded merits:', error);
        document.getElementById('uploadedMeritsTable').innerHTML = 
            '<tr><td colspan="5" class="text-center text-danger">Error loading merits</td></tr>';
    }
}

function displayMeritBreakdown(breakdown) {
    const container = document.getElementById('meritBreakdown');
    
    if (Object.keys(breakdown).length === 0) {
        container.innerHTML = '<div class="text-center text-secondary text-sm">No merits uploaded yet</div>';
        return;
    }
    
    // Sort by total points descending
    const sortedBreakdown = Object.entries(breakdown)
        .sort((a, b) => b[1].totalPoints - a[1].totalPoints);
    
    container.innerHTML = sortedBreakdown.map(([role, data]) => `
        <div class="flex justify-between items-center py-2 border-b last:border-b-0">
            <div>
                <div class="font-medium text-sm">${sanitizeHTML(role)}</div>
                <div class="text-xs text-secondary">${data.count} student${data.count !== 1 ? 's' : ''}</div>
            </div>
            <div class="text-right">
                <div class="font-bold text-primary">${data.totalPoints}</div>
                <div class="text-xs text-secondary">points</div>
            </div>
        </div>
    `).join('');
}

// Utility functions
function getOrganizerDisplay(organizer) {
    if (!organizer) return 'Not specified';
    
    if (typeof organizer === 'string') {
        return organizer;
    }
    
    if (typeof organizer === 'object') {
        let display = '';
        
        // Main organizer with EN/BM format
        if (organizer.main_name_en && organizer.main_name_bm) {
            display = `${organizer.main_name_en} / ${organizer.main_name_bm}`;
        } else if (organizer.main_name) {
            display = organizer.main_name;
        }
        
        // Sub organizer with EN/BM format
        if (organizer.sub_name_en && organizer.sub_name_bm) {
            const subDisplay = `${organizer.sub_name_en} / ${organizer.sub_name_bm}`;
            display += display ? `<br><small class="text-secondary">Sub: ${subDisplay}</small>` : subDisplay;
        } else if (organizer.sub_name) {
            display += display ? `<br><small class="text-secondary">Sub: ${organizer.sub_name}</small>` : organizer.sub_name;
        }
        
        return display || 'Not specified';
    }
    
    return 'Not specified';
}

function getLevelClass(level) {
    switch(level) {
        case 'University': return 'bg-danger';
        case 'Faculty': return 'bg-warning';
        case 'College': return 'bg-light text-gray-700';
        case 'Club': return 'bg-success';
        case 'External': return 'bg-primary';
        default: return 'bg-secondary';
    }
}

function getStatusClass(status, isUpcoming) {
    if (status === 'draft') return 'bg-secondary';
    if (status === 'active' && isUpcoming) return 'bg-warning';
    if (status === 'active' && !isUpcoming) return 'bg-success';
    return 'bg-secondary';
}

function getStatusText(status, isUpcoming) {
    if (status === 'draft') return 'Draft';
    if (status === 'active' && isUpcoming) return 'Upcoming';
    if (status === 'active' && !isUpcoming) return 'Completed';
    return status;
}

function editEvent(eventId) {
    window.location.href = `create-event.html?id=${eventId}`;
}

function showDeleteModal() {
    document.getElementById('deleteModal').classList.remove('d-none');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('d-none');
}

async function confirmDelete() {
    try {
        showLoading();
        
        // Delete the event
        await firestore.collection('events').doc(currentEventId).delete();
        
        // Also delete all associated merits
        const userMeritsSnapshot = await firestore.collection('userMerits').get();
        const batch = firestore.batch();
        
        userMeritsSnapshot.forEach(userDoc => {
            const userMerits = userDoc.data();
            if (userMerits[currentEventId]) {
                delete userMerits[currentEventId];
                batch.update(firestore.collection('userMerits').doc(userDoc.id), userMerits);
            }
        });
        
        await batch.commit();
        
        showToast('Event deleted successfully', 'success');
        
        setTimeout(() => {
            window.location.href = 'events.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error deleting event:', error);
        showToast('Error deleting event: ' + error.message, 'error');
    } finally {
        hideLoading();
        closeDeleteModal();
    }
}

function exportMerits() {
    // This function can be implemented to export merits to CSV/Excel
    showToast('Export functionality coming soon', 'info');
}
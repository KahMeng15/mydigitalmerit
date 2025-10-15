// Event details page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
});

let currentEventId = null;
let currentEventData = null;



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
    
    // Child activity management
    document.getElementById('addChildActivityBtn').addEventListener('click', () => {
        window.location.href = `create-child-activity.html?parentId=${currentEventId}`;
    });
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
        
        // Load sub-activities or parent event info
        await loadHierarchyInfo();
        
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

async function loadHierarchyInfo() {
    if (currentEventData.isSubActivity && currentEventData.parentEventId) {
        // This is a sub-activity, load parent event info
        await loadParentEventInfo();
    } else {
        // This is a parent event, load sub-activities
        await loadSubActivities();
    }
}

async function loadParentEventInfo() {
    try {
        const parentEventDoc = await firestore.collection('events').doc(currentEventData.parentEventId).get();
        if (parentEventDoc.exists) {
            const parentEventData = parentEventDoc.data();
            
            // Show parent event section
            const parentSection = document.getElementById('parentEventSection');
            parentSection.classList.remove('d-none');
            
            // Update parent event info
            document.getElementById('parentEventName').textContent = parentEventData.name;
            
            // Set up view parent event button
            document.getElementById('viewParentEventBtn').onclick = () => {
                window.location.href = `event-details.html?id=${currentEventData.parentEventId}`;
            };
        }
    } catch (error) {
        console.error('Error loading parent event info:', error);
    }
}

async function loadSubActivities() {
    try {
        const eventsSnapshot = await firestore.collection('events')
            .where('parentEventId', '==', currentEventId)
            .get();
        
        const childActivities = [];
        eventsSnapshot.forEach(doc => {
            childActivities.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort child activities
        childActivities.sort((a, b) => {
            if (a.activityOrder && b.activityOrder) {
                return a.activityOrder - b.activityOrder;
            }
            return a.name.localeCompare(b.name);
        });
        
        displaySubActivities(childActivities);
        
    } catch (error) {
        console.error('Error loading child activities:', error);
    }
}

function displaySubActivities(childActivities) {
    const listContainer = document.getElementById('childActivitiesList');
    const noChildActivitiesMsg = document.getElementById('noChildActivities');
    
    if (childActivities.length === 0) {
        noChildActivitiesMsg.style.display = 'block';
        listContainer.innerHTML = '';
        return;
    }
    
    noChildActivitiesMsg.style.display = 'none';
    
    const html = childActivities.map(activity => {
        const statusClass = activity.status === 'active' ? 'bg-success' : 'bg-secondary';
        const statusText = activity.status === 'active' ? 'Active' : 'Draft';
        
        return `
            <div class="bg-light p-4 rounded border mb-3">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <h5 class="font-semibold">${sanitizeHTML(activity.name)}</h5>
                            ${activity.subActivityType ? `<span class="badge bg-info text-xs">${sanitizeHTML(activity.subActivityType)}</span>` : ''}
                            <span class="badge ${statusClass} text-xs">${statusText}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-4 text-sm mb-2">
                            ${activity.date ? `<div><strong>Date:</strong> ${formatDate(activity.date)}</div>` : ''}
                            ${activity.location ? `<div><strong>Location:</strong> ${sanitizeHTML(activity.location)}</div>` : ''}
                            ${activity.activityOrder ? `<div><strong>Order:</strong> ${activity.activityOrder}</div>` : ''}
                        </div>
                        ${activity.description ? `<p class="text-secondary text-sm mt-2">${sanitizeHTML(activity.description)}</p>` : ''}
                    </div>
                    <div class="flex gap-2 ml-4">
                        <button onclick="editChildActivity('${activity.id}')" class="btn btn-outline btn-sm" title="Edit">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="viewChildActivity('${activity.id}')" class="btn btn-secondary btn-sm" title="View Details">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </button>
                        <button onclick="uploadMeritsForChildActivity('${activity.id}')" class="btn btn-primary btn-sm" title="Upload Merits">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                            </svg>
                        </button>
                        <button onclick="deleteChildActivity('${activity.id}')" class="btn btn-danger btn-sm" title="Delete">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    listContainer.innerHTML = html;
}

function viewChildActivity(childActivityId) {
    window.location.href = `event-details.html?id=${childActivityId}`;
}

function uploadMeritsForChildActivity(childActivityId) {
    // Get the parent event ID from the current page
    const parentEventId = currentEventId;
    window.location.href = `upload-merits.html?eventId=${parentEventId}&childActivityId=${childActivityId}`;
}

function editChildActivity(childActivityId) {
    // For now, just navigate to view - could be enhanced to inline edit
    window.location.href = `event-details.html?id=${childActivityId}`;
}

async function deleteChildActivity(childActivityId) {
    if (!confirm('Are you sure you want to delete this child activity? This action cannot be undone.')) {
        return;
    }
    
    try {
        showLoading();
        await firestore.collection('events').doc(childActivityId).delete();
        showToast('Child activity deleted successfully', 'success');
        // Reload child activities
        await loadSubActivities();
    } catch (error) {
        console.error('Error deleting child activity:', error);
        showToast('Error deleting child activity: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}



function displayEventInfo(event) {
    // Update page title and breadcrumb
    document.title = `${event.name} - Event Details`;
    document.getElementById('eventBreadcrumb').textContent = event.name;
    
    // Header information
    document.getElementById('eventTitle').textContent = event.name;
    document.getElementById('eventLevel').textContent = event.level;
    document.getElementById('eventLevel').className = `badge bg-primary`;
    
    // Status badge
    const statusBadge = document.getElementById('eventStatus');
    const isUpcoming = new Date(event.date).getTime() > Date.now();
    const statusClass = getStatusClass(event.status, isUpcoming);
    const statusText = getStatusText(event.status, isUpcoming);
    statusBadge.textContent = statusText;
    statusBadge.className = `badge ${statusClass}`;
    
    // Date
    document.getElementById('eventDate').textContent = formatDate(event.date);
    
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
        // Ensure level metadata is loaded first
        await window.levelManager.ensureLevelMetadata();
        
        // Load merit values from consolidated levels collection
        const roles = window.levelManager.getAllMeritValuesByRole();
        const levels = {};
        
        // Build levels object for backward compatibility
        window.levelManager.getActiveLevels().forEach(level => {
            levels[level.id] = level.meritValues || {};
        });
        
        const meritValues = { roles: roles, levels: levels };
        
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
    if (meritValues.roles && (currentEventData.levelId || currentEventData.level)) {
        // Use levelId if available, otherwise try to map old level name to ID
        let levelId = currentEventData.levelId;
        if (!levelId && currentEventData.level) {
            levelId = window.levelManager.getLevelIdByName(currentEventData.level);
        }
        
        const sortedRoles = Object.entries(meritValues.roles)
            .map(([role, levels]) => ({
                role: role,
                points: levels[levelId] || 0
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
        case 'University': return 'bg-red-500 text-white';
        case 'Faculty': return 'bg-orange-500 text-white';
        case 'College': return 'bg-yellow-500 text-black';
        case 'Club': return 'bg-green-500 text-white';
        case 'External': return 'bg-purple-500 text-white';
        default: return 'bg-gray-500 text-white';
    }
}

function getStatusClass(status, isUpcoming) {
    if (status === 'draft') return 'bg-gray-500 text-white';
    if (status === 'active' && isUpcoming) return 'bg-green-500 text-white';
    if (status === 'active' && !isUpcoming) return 'bg-yellow-500 text-black';
    return 'bg-gray-500 text-white';
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
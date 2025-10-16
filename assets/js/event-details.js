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
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', signOut);
    }
    
    // Action buttons
    const editEventBtn = document.getElementById('editEventBtn');
    if (editEventBtn) {
        editEventBtn.addEventListener('click', () => editEvent(currentEventId));
    }
    
    const deleteEventBtn = document.getElementById('deleteEventBtn');
    if (deleteEventBtn) {
        deleteEventBtn.addEventListener('click', () => {
            showDeleteModal();
        });
    }
    
    const refreshMeritsBtn = document.getElementById('refreshMerits');
    if (refreshMeritsBtn) {
        refreshMeritsBtn.addEventListener('click', () => loadUploadedMerits());
    }
    
    const exportMeritsBtn = document.getElementById('exportMerits');
    if (exportMeritsBtn) {
        exportMeritsBtn.addEventListener('click', exportMerits);
    }
    
    // Delete confirmation
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            confirmDelete();
        });
    }
    
    // Child activity management
    const addChildActivityBtn = document.getElementById('addChildActivityBtn');
    if (addChildActivityBtn) {
        addChildActivityBtn.addEventListener('click', () => {
            window.location.href = `create-child-activity.html?parentId=${currentEventId}`;
        });
    }
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
    // All events can have child activities as subcollections
    await loadSubActivities();
}

async function loadSubActivities() {
    try {
        // Load child activities from subcollection: events/{currentEventId}/activities
        const activitiesSnapshot = await firestore
            .collection('events')
            .doc(currentEventId)
            .collection('activities')
            .get();
        
        const childActivities = [];
        activitiesSnapshot.forEach(doc => {
            childActivities.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort child activities
        childActivities.sort((a, b) => {
            if (a.activityOrder && b.activityOrder) {
                return a.activityOrder - b.activityOrder;
            }
            return a.name.localeCompare(b.name);
        });
        
        // Child activities are now handled by loadMeritRecords function
        // displaySubActivities(childActivities); // Removed as we use new merit records structure
        
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
    if (statusBadge) {
        const eventDate = new Date(event.date || event.startDate);
        const isUpcoming = eventDate.getTime() > Date.now();
        const statusClass = getStatusClass(event.status, isUpcoming);
        const statusText = getStatusText(event.status, isUpcoming);
        statusBadge.textContent = statusText;
        statusBadge.className = statusClass;
        console.log('Status updated:', { status: event.status, statusText, statusClass, isUpcoming }); // Debug log
    }
    
    // Date display (separate from time)
    const dateElement = document.getElementById('eventDate');
    if (dateElement) {
        let dateText = '';
        if (event.startDate && event.endDate && event.startDate !== event.endDate) {
            dateText = `${formatDate(event.startDate)} to ${formatDate(event.endDate)}`;
        } else {
            dateText = formatDate(event.date || event.startDate);
        }
        dateElement.textContent = dateText;
    }
    
    // Time display (separate from date)
    const timeElement = document.getElementById('eventTime');
    if (timeElement) {
        let timeText = '';
        if (event.startTime && event.endTime) {
            timeText = `${event.startTime} to ${event.endTime}`;
        } else if (event.time) {
            timeText = event.time;
        } else {
            // Extract time from datetime if available
            const eventDateTime = new Date(event.date || event.startDate);
            if (!isNaN(eventDateTime.getTime())) {
                timeText = eventDateTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
            } else {
                timeText = 'Not specified';
            }
        }
        timeElement.textContent = timeText;
    }
    
    // Organizer display with proper parent/sub logic
    displayOrganizerInfo(event.organizer);
    
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
        const errorMsg = '<div class="text-center py-8"><p class="text-secondary">Error loading merit types</p></div>';
        document.getElementById('committeeMeritsList').innerHTML = errorMsg;
        document.getElementById('participantMeritsList').innerHTML = errorMsg;
        document.getElementById('customMeritsList').innerHTML = errorMsg;
    }
}

function displayMeritTypes(meritValues) {
    const committeeContainer = document.getElementById('committeeMeritsList');
    const participantContainer = document.getElementById('participantMeritsList');
    const customContainer = document.getElementById('customMeritsList');
    
    let committeeHtml = '';
    let participantHtml = '';
    let customHtml = '';
    
    // Define which roles are committee members vs participants
    const committeeRoles = [
        'President', 'Vice President', 'Secretary', 'Assistant Secretary', 
        'Treasurer', 'Assistant Treasurer', 'Committee Member', 'Director',
        'Co-Director', 'Project Manager', 'Event Manager', 'Chairman',
        'Vice Chairman', 'Chairperson', 'Vice Chairperson', 'Head',
        'Deputy Head', 'Coordinator', 'Assistant Coordinator', 'Emcee',
        'MC', 'Master of Ceremony', 'Jury', 'Judge', 'Volunteer', 'Facilitator'
    ];
    
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
                points: levels[levelId] || 0,
                type: 'base'
            }))
            .sort((a, b) => b.points - a.points);
        
        sortedRoles.forEach(({ role, points }) => {
            const isCommittee = committeeRoles.some(committeeRole => 
                role.toLowerCase().includes(committeeRole.toLowerCase()) ||
                committeeRole.toLowerCase().includes(role.toLowerCase())
            );
            
            const roleHtml = `
                <div class="bg-white flex justify-between items-center hover:shadow-sm transition-shadow">
                    <div class="text-gray-800">${sanitizeHTML(role)}</div>
                    <div class="text-blue-600">${points} pts</div>
                </div>
            `;
            
            if (isCommittee) {
                committeeHtml += roleHtml;
            } else {
                participantHtml += roleHtml;
            }
        });
    }
    
    // Custom roles - always go to custom roles section
    if (currentEventData.customRoles && currentEventData.customRoles.length > 0) {
        const sortedCustomRoles = [...currentEventData.customRoles]
            .sort((a, b) => b.value - a.value);
        
        sortedCustomRoles.forEach(role => {
            const roleHtml = `
                <div class="bg-white p-3 rounded border border-purple-300 flex justify-between items-center hover:shadow-sm transition-shadow">
                    <div class="text-purple-800">${sanitizeHTML(role.name)}</div>
                    <div class="text-purple-600">${role.value} pts</div>
                </div>
            `;
            
            customHtml += roleHtml;
        });
    }
    
    // Display results or fallback messages
    if (!committeeHtml) {
        committeeHtml = '<div class="text-center py-8"><p class="text-secondary">No committee member roles configured</p></div>';
    }
    
    if (!participantHtml) {
        participantHtml = '<div class="text-center py-8"><p class="text-secondary">No participant roles configured</p></div>';
    }
    
    if (!customHtml) {
        customHtml = '<div class="text-center py-8"><p class="text-secondary">No custom roles configured</p></div>';
    }
    
    committeeContainer.innerHTML = committeeHtml;
    participantContainer.innerHTML = participantHtml;
    customContainer.innerHTML = customHtml;
}

async function loadUploadedMerits() {
    try {
        // Load merit data
        const uploadedMerits = [];
        let totalMerits = 0;
        const meritBreakdown = {};
        
        // Load from event participants list
        const participantsSnapshot = await firestore
            .collection('events')
            .doc(currentEventId)
            .collection('participants')
            .get();
        
        // Process the participant list
        participantsSnapshot.forEach(participantDoc => {
            const participantData = participantDoc.data();
            
            uploadedMerits.push({
                matricNumber: participantDoc.id,
                studentName: participantData.studentName || 'Unknown',
                role: participantData.meritType || 'Participant',
                points: participantData.meritPoints || 0,
                uploadDate: participantData.uploadDate || null,
                additionalNotes: participantData.additionalNotes || '',
                linkProof: participantData.linkProof || ''
            });
            
            totalMerits += participantData.meritPoints || 0;
            
            const meritType = participantData.meritType || 'Participant';
            if (!meritBreakdown[meritType]) {
                meritBreakdown[meritType] = { count: 0, totalPoints: 0 };
            }
            meritBreakdown[meritType].count++;
            meritBreakdown[meritType].totalPoints += participantData.meritPoints || 0;
        });
        
        // Update statistics
        document.getElementById('totalMerits').textContent = totalMerits.toLocaleString();
        displayMeritBreakdown(meritBreakdown);
        
        // Load and display merit records structure
        await loadMeritRecords();
        
        
    } catch (error) {
        console.error('Error loading uploaded merits:', error);
        // Error handling for merit records
        const recordsContainer = document.getElementById('meritRecordsList');
        if (recordsContainer) {
            recordsContainer.innerHTML = '<div class="text-center py-4 text-danger">Error loading merit records</div>';
        }
    }
}

// Removed displayMeritSummaryByRole function as merit summary section was removed
// function displayMeritSummaryByRole(breakdown) { ... }

async function loadMeritRecords() {
    try {
        const container = document.getElementById('meritRecordsList');
        container.innerHTML = '<div class="text-center py-4"><p class="text-secondary">Loading merit records...</p></div>';
        
        let recordsHtml = '';
        
        // Add parent event merit records (committee members)
        const parentMerits = await getParentEventMerits();
        if (parentMerits.length > 0) {
            recordsHtml += generateParentMeritRecords(parentMerits);
        }
        
        // Load child activities and their merit records
        const childActivities = await getChildActivities();
        if (childActivities.length > 0) {
            recordsHtml += await generateChildActivitiesMeritRecords(childActivities);
        }
        
        if (!recordsHtml) {
            recordsHtml = '<div class="text-center py-8"><p class="text-secondary">No merit records found</p></div>';
        }
        
        container.innerHTML = recordsHtml;
        
    } catch (error) {
        console.error('Error loading merit records:', error);
        document.getElementById('meritRecordsList').innerHTML = 
            '<div class="text-center py-4 text-danger">Error loading merit records</div>';
    }
}

function generateParentMeritRecords(parentMerits) {
    const committeeCount = parentMerits.filter(m => isCommitteeRole(m.role)).length;
    
    if (committeeCount === 0) return '';
    
    return `
        <div class="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-semibold text-indigo-800">Parent Event Committee</h4>
            </div>
            <div class="ml-4">
                <div class="bg-indigo-100 border border-indigo-300 rounded-lg p-4 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.196-2.121L17 20zM9 12a4 4 0 100-8 4 4 0 000 8zm8 0a4 4 0 100-8 4 4 0 000 8zm-8 8a6 6 0 006-6H3a6 6 0 006 6z"/>
                        </svg>
                        <div>
                            <div class="font-medium text-indigo-800">Committee Members</div>
                            <div class="text-sm text-indigo-600">${committeeCount} records</div>
                        </div>
                    </div>
                    <div class="flex gap-3">
                        <div onclick="viewMeritDetails('parent-committee')" 
                             class="text-blue-600 hover:text-blue-800 transition-colors" style="cursor: pointer" title="View Details">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </div>
                        <div onclick="deleteMeritRecords('parent-committee')" 
                             class="text-red-600 hover:text-red-800 transition-colors" style="cursor: pointer" title="Delete Records">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function generateChildActivitiesMeritRecords(childActivities) {
    let html = '';
    
    for (const activity of childActivities) {
        const merits = await getActivityMerits(activity.id);
        const participantCount = merits.filter(m => !isCommitteeRole(m.role)).length;
        const committeeCount = merits.filter(m => isCommitteeRole(m.role)).length;
        
        html += `
            <div class="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div class="mb-3">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <h4 class="font-semibold text-gray-800 text-lg">${sanitizeHTML(activity.name)}</h4>
                            <div class="mt-2 text-sm text-gray-600 space-y-1">
                                ${activity.date ? `<div><strong>Date:</strong> ${formatDate(activity.date)}</div>` : ''}
                                ${activity.time ? `<div><strong>Time:</strong> ${activity.time}</div>` : ''}
                                ${activity.location ? `<div><strong>Location:</strong> ${sanitizeHTML(activity.location)}</div>` : ''}
                            </div>
                        </div>
                        <div class="flex gap-3 ml-4">
                            <div onclick="editChildActivity('${activity.id}')" 
                                 class="text-blue-600 hover:text-blue-800 transition-colors" style="cursor: pointer" title="Edit Activity">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </div>
                            <div onclick="uploadMeritsForChildActivity('${activity.id}')" 
                                 class="text-green-600 hover:text-green-800 transition-colors" style="cursor: pointer" title="Upload Merits">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                </svg>
                            </div>
                            <div onclick="deleteChildActivity('${activity.id}')" 
                                 class="text-red-600 hover:text-red-800 transition-colors" style="cursor: pointer" title="Delete Activity">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ml-4 space-y-3">
                    ${participantCount > 0 ? `
                        <div class="bg-green-50 border border-green-200 rounded-lg p-4 flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
                                </svg>
                                <div>
                                    <div class="font-medium text-green-800">Participants</div>
                                    <div class="text-sm text-green-600">${participantCount} records</div>
                                </div>
                            </div>
                            <div class="flex gap-3">
                                <div onclick="viewMeritDetails('${activity.id}', 'participants')" 
                                     class="text-green-600 hover:text-green-800 transition-colors" style="cursor: pointer" title="View Details">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                    </svg>
                                </div>
                                <div onclick="deleteMeritRecords('${activity.id}', 'participants')" 
                                     class="text-red-600 hover:text-red-800 transition-colors" style="cursor: pointer" title="Delete Records">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    ${committeeCount > 0 ? `
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.196-2.121L17 20zM9 12a4 4 0 100-8 4 4 0 000 8zm8 0a4 4 0 100-8 4 4 0 000 8zm-8 8a6 6 0 006-6H3a6 6 0 006 6z"/>
                                </svg>
                                <div>
                                    <div class="font-medium text-blue-800">Committee Members</div>
                                    <div class="text-sm text-blue-600">${committeeCount} records</div>
                                </div>
                            </div>
                            <div class="flex gap-3">
                                <div onclick="viewMeritDetails('${activity.id}', 'committee')" 
                                     class="text-blue-600 hover:text-blue-800 transition-colors" style="cursor: pointer" title="View Details">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                    </svg>
                                </div>
                                <div onclick="deleteMeritRecords('${activity.id}', 'committee')" 
                                     class="text-red-600 hover:text-red-800 transition-colors" style="cursor: pointer" title="Delete Records">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    return html;
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
function displayOrganizerInfo(organizer) {
    const organizerElement = document.getElementById('eventOrganizer');
    const parentOrganizerElement = document.getElementById('eventParentOrganizer');
    const parentOrganizerSection = document.getElementById('eventParentOrganizerSection');
    
    if (!organizer) {
        organizerElement.innerHTML = 'Not specified';
        parentOrganizerSection.classList.add('d-none');
        return;
    }
    
    let subOrganizerText = '';
    let parentOrganizerText = '';
    
    if (typeof organizer === 'string') {
        organizerElement.innerHTML = organizer;
        parentOrganizerSection.classList.add('d-none');
        return;
    }
    
    if (typeof organizer === 'object') {
        // Check if there's a sub organizer
        const hasSubOrganizer = organizer.sub_name_en || organizer.sub_name_bm || organizer.sub_name;
        
        if (hasSubOrganizer) {
            // Display sub organizer as main organizer
            if (organizer.sub_name_en && organizer.sub_name_bm) {
                subOrganizerText = `${organizer.sub_name_en} / ${organizer.sub_name_bm}`;
            } else if (organizer.sub_name) {
                subOrganizerText = organizer.sub_name;
            }
            
            // Display parent organizer separately
            if (organizer.main_name_en && organizer.main_name_bm) {
                parentOrganizerText = `${organizer.main_name_en} / ${organizer.main_name_bm}`;
            } else if (organizer.main_name) {
                parentOrganizerText = organizer.main_name;
            }
            
            organizerElement.innerHTML = subOrganizerText;
            parentOrganizerElement.innerHTML = parentOrganizerText;
            parentOrganizerSection.classList.remove('d-none');
        } else {
            // No sub organizer, just display main organizer
            if (organizer.main_name_en && organizer.main_name_bm) {
                organizerElement.innerHTML = `${organizer.main_name_en} / ${organizer.main_name_bm}`;
            } else if (organizer.main_name) {
                organizerElement.innerHTML = organizer.main_name;
            } else {
                organizerElement.innerHTML = 'Not specified';
            }
            parentOrganizerSection.classList.add('d-none');
        }
        
        return;
    }
    
    organizerElement.innerHTML = 'Not specified';
    parentOrganizerSection.classList.add('d-none');
}

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
    if (!status) return 'badge bg-secondary';
    
    switch (status.toLowerCase()) {
        case 'draft':
            return 'badge bg-secondary';
        case 'active':
        case 'published':
            return isUpcoming ? 'badge bg-success' : 'badge bg-warning';
        case 'completed':
            return 'badge bg-info';
        case 'cancelled':
            return 'badge bg-danger';
        default:
            return 'badge bg-secondary';
    }
}

function getStatusText(status, isUpcoming) {
    if (!status) return 'Unknown';
    
    switch (status.toLowerCase()) {
        case 'draft':
            return 'Draft';
        case 'active':
        case 'published':
            return isUpcoming ? 'Upcoming' : 'Completed';
        case 'completed':
            return 'Completed';
        case 'cancelled':
            return 'Cancelled';
        default:
            return status.charAt(0).toUpperCase() + status.slice(1);
    }
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

// Make closeDeleteModal available globally for onclick handlers
window.closeDeleteModal = closeDeleteModal;

async function confirmDelete() {
    try {
        if (!currentEventId) {
            showToast('No event ID found', 'error');
            return;
        }
        
        showLoading();
        
        // Delete the event
        await firestore.collection('events').doc(currentEventId).delete();
        
        // Delete associated merits and participants
        const batch = firestore.batch();
        let deletionCount = 0;
        
        // Delete merit records from students/{matricNumber}/events/{eventId}
        const eventMeritsQuery = await firestore.collectionGroup('events')
            .where(firebase.firestore.FieldPath.documentId(), '==', currentEventId)
            .get();
        
        eventMeritsQuery.forEach(eventMeritDoc => {
            batch.delete(eventMeritDoc.ref);
            deletionCount++;
        });
        
        // Delete participant records from events/{eventId}/participants
        const participantsSnapshot = await firestore
            .collection('events')
            .doc(currentEventId)
            .collection('participants')
            .get();
        
        participantsSnapshot.forEach(participantDoc => {
            batch.delete(participantDoc.ref);
        });
        
        // Delete child activities from events/{eventId}/activities
        const activitiesSnapshot = await firestore
            .collection('events')
            .doc(currentEventId)
            .collection('activities')
            .get();
        
        activitiesSnapshot.forEach(activityDoc => {
            batch.delete(activityDoc.ref);
        });
        
        // Commit all deletions
        await batch.commit();
        
        if (deletionCount > 0) {
            showToast(`Event and ${deletionCount} associated merit record(s) deleted successfully`, 'success');
        } else {
            showToast('Event deleted successfully (no merit records found)', 'success');
        }
        
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

// Helper functions for new merit records structure
function isCommitteeRole(role) {
    const committeeRoles = [
        'President', 'Vice President', 'Secretary', 'Assistant Secretary', 
        'Treasurer', 'Assistant Treasurer', 'Committee Member', 'Director',
        'Co-Director', 'Project Manager', 'Event Manager', 'Chairman',
        'Vice Chairman', 'Chairperson', 'Vice Chairperson', 'Head',
        'Deputy Head', 'Coordinator', 'Assistant Coordinator', 'Emcee',
        'MC', 'Master of Ceremony', 'Jury', 'Judge', 'Volunteer', 'Facilitator'
    ];
    
    return committeeRoles.some(committeeRole => 
        role.toLowerCase().includes(committeeRole.toLowerCase()) ||
        committeeRole.toLowerCase().includes(role.toLowerCase())
    );
}

async function getChildActivities() {
    try {
        const activitiesSnapshot = await firestore
            .collection('events')
            .doc(currentEventId)
            .collection('activities')
            .get();
        
        const childActivities = [];
        activitiesSnapshot.forEach(doc => {
            childActivities.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort child activities
        childActivities.sort((a, b) => {
            if (a.activityOrder && b.activityOrder) {
                return a.activityOrder - b.activityOrder;
            }
            return a.name.localeCompare(b.name);
        });
        
        return childActivities;
    } catch (error) {
        console.error('Error loading child activities:', error);
        return [];
    }
}

async function getParentEventMerits() {
    try {
        const participantsSnapshot = await firestore
            .collection('events')
            .doc(currentEventId)
            .collection('participants')
            .get();
        
        const merits = [];
        participantsSnapshot.forEach(participantDoc => {
            const data = participantDoc.data();
            merits.push({
                matricNumber: participantDoc.id,
                studentName: data.studentName || 'Unknown',
                role: data.meritType || 'Participant',
                points: data.meritPoints || 0,
                uploadDate: data.uploadDate || null
            });
        });
        
        return merits;
    } catch (error) {
        console.error('Error loading parent event merits:', error);
        return [];
    }
}

async function getActivityMerits(activityId) {
    try {
        const participantsSnapshot = await firestore
            .collection('events')
            .doc(activityId)
            .collection('participants')
            .get();
        
        const merits = [];
        participantsSnapshot.forEach(participantDoc => {
            const data = participantDoc.data();
            merits.push({
                matricNumber: participantDoc.id,
                studentName: data.studentName || 'Unknown',
                role: data.meritType || 'Participant',
                points: data.meritPoints || 0,
                uploadDate: data.uploadDate || null
            });
        });
        
        return merits;
    } catch (error) {
        console.error('Error loading activity merits:', error);
        return [];
    }
}

function viewRoleDetails(roleName) {
    // Navigate to a detailed view of all records for this role
    const params = new URLSearchParams({
        eventId: currentEventId,
        role: roleName,
        view: 'role-details'
    });
    window.open(`merit-records.html?${params.toString()}`, '_blank');
}

function viewMeritDetails(activityId, category = 'all') {
    // Navigate to a detailed view of merit records for this activity/category
    const params = new URLSearchParams({
        eventId: activityId,
        category: category,
        view: 'activity-details'
    });
    window.open(`merit-records.html?${params.toString()}`, '_blank');
}

async function deleteMeritRecords(activityId, category = 'all') {
    const categoryText = category === 'all' ? 'all merit records' : 
                        category === 'participants' ? 'participant records' :
                        category === 'committee' ? 'committee member records' : 'records';
    
    const activityText = activityId === 'parent-committee' ? 'parent event' : 'this activity';
    
    if (!confirm(`Are you sure you want to delete ${categoryText} for ${activityText}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading();
        
        const eventId = activityId === 'parent-committee' ? currentEventId : activityId;
        
        // Get all participants for this event/activity
        const participantsSnapshot = await firestore
            .collection('events')
            .doc(eventId)
            .collection('participants')
            .get();
        
        const batch = firestore.batch();
        let deletionCount = 0;
        
        participantsSnapshot.forEach(participantDoc => {
            const data = participantDoc.data();
            const role = data.meritType || 'Participant';
            
            // Filter by category if specified
            if (category === 'participants' && isCommitteeRole(role)) {
                return; // Skip committee roles
            }
            if (category === 'committee' && !isCommitteeRole(role)) {
                return; // Skip non-committee roles
            }
            
            // Delete from participants collection
            batch.delete(participantDoc.ref);
            deletionCount++;
            
            // Also delete from student's events subcollection
            const studentEventRef = firestore
                .collection('students')
                .doc(participantDoc.id)
                .collection('events')
                .doc(eventId);
            batch.delete(studentEventRef);
        });
        
        if (deletionCount > 0) {
            await batch.commit();
            showToast(`${deletionCount} ${categoryText} deleted successfully`, 'success');
            
            // Reload merit records to reflect changes
            await loadMeritRecords();
            await loadUploadedMerits(); // Refresh statistics
        } else {
            showToast(`No ${categoryText} found to delete`, 'info');
        }
        
    } catch (error) {
        console.error('Error deleting merit records:', error);
        showToast('Error deleting records: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}
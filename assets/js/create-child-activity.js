// Create Child Activity functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();

    // Form event listeners
    document.getElementById('childActivityForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('saveDraftBtn').addEventListener('click', saveDraft);
    document.getElementById('cancelBtn').addEventListener('click', () => {
        if (parentEventId) {
            window.location.href = `event-details.html?id=${parentEventId}`;
        } else {
            window.location.href = 'events.html';
        }
    });
    document.getElementById('backToParentBtn').addEventListener('click', () => {
        if (parentEventId) {
            window.location.href = `event-details.html?id=${parentEventId}`;
        } else {
            window.location.href = 'events.html';
        }
    });
    document.getElementById('signOutBtn').addEventListener('click', signOut);
});

let parentEventId = null;
let parentEventData = null;

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Get parent event ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    parentEventId = urlParams.get('parentId');
    
    if (!parentEventId) {
        showToast('Parent event ID not provided', 'error');
        window.location.href = 'events.html';
        return;
    }

    // Load parent event data
    loadParentEventData();
}

async function loadParentEventData() {
    try {
        showLoading();
        
        const parentEventDoc = await firestore.collection('events').doc(parentEventId).get();
        if (!parentEventDoc.exists) {
            showToast('Parent event not found', 'error');
            window.location.href = 'events.html';
            return;
        }

        parentEventData = { id: parentEventDoc.id, ...parentEventDoc.data() };
        
        // Update page with parent event information
        displayParentEventInfo();
        
        // Pre-fill form with inherited values
        prefillForm();
        
    } catch (error) {
        console.error('Error loading parent event:', error);
        showToast('Error loading parent event: ' + error.message, 'error');
        setTimeout(() => {
            window.location.href = 'events.html';
        }, 2000);
    } finally {
        hideLoading();
    }
}

function displayParentEventInfo() {
    // Update breadcrumb
    document.getElementById('parentEventLink').textContent = parentEventData.name;
    document.getElementById('parentEventLink').href = `event-details.html?id=${parentEventId}`;
    
    // Update header info
    document.getElementById('parentEventName').textContent = parentEventData.name;
    
    // Update inherited information display
    document.getElementById('inheritedLevel').textContent = parentEventData.level;
    
    // Format organizer display
    let organizerText = 'Not specified';
    if (parentEventData.organizer) {
        if (typeof parentEventData.organizer === 'string') {
            organizerText = parentEventData.organizer;
        } else if (parentEventData.organizer.main_name) {
            organizerText = parentEventData.organizer.main_name;
            if (parentEventData.organizer.sub_name) {
                organizerText += ` / ${parentEventData.organizer.sub_name}`;
            }
        }
    }
    document.getElementById('inheritedOrganizer').textContent = organizerText;
    
    document.getElementById('inheritedDate').textContent = formatDate(parentEventData.date);
    document.getElementById('inheritedLocation').textContent = parentEventData.location || 'Not specified';
}

function prefillForm() {
    // Pre-fill location with parent event location
    if (parentEventData.location) {
        document.getElementById('childActivityLocation').value = parentEventData.location;
    }
    
    // Focus on name field
    setTimeout(() => {
        document.getElementById('childActivityName').focus();
    }, 100);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    await saveChildActivity('active');
}

async function saveDraft() {
    await saveChildActivity('draft');
}

async function saveChildActivity(status) {
    try {
        // Validate required fields
        const name = document.getElementById('childActivityName').value.trim();
        if (!name) {
            showToast('Please enter an activity name', 'error');
            return;
        }
        
        showLoading();
        
        // Prepare child activity data
        const activityTime = document.getElementById('childActivityTime').value;
        
        // Use parent event date and optionally update time
        let dateTime = parentEventData.date.split('T')[0]; // Inherit date from parent
        if (activityTime) {
            dateTime += 'T' + activityTime;
        } else if (parentEventData.date.includes('T')) {
            // Inherit time from parent if no specific time is set
            const parentTime = parentEventData.date.split('T')[1];
            dateTime += 'T' + parentTime;
        }
        
        const childActivityData = {
            name: name,
            level: parentEventData.level, // Inherit from parent
            date: dateTime,
            location: document.getElementById('childActivityLocation').value.trim() || parentEventData.location,
            organizer: parentEventData.organizer, // Inherit from parent
            description: document.getElementById('childActivityDescription').value.trim(),
            status: status,
            
            // Child activity specific fields
            isSubActivity: true,
            parentEventId: parentEventId,
            activityOrder: parseInt(document.getElementById('childActivityOrder').value) || null,
            hasSubActivities: false,
            
            // Inherit custom roles from parent
            customRoles: parentEventData.customRoles || [],
            
            // Metadata
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: getCurrentUser().uid
        };
        
        // Generate new event ID
        const eventId = await generateNumericEventId();
        childActivityData.id = eventId;
        
        // Save to Firestore
        await firestore.collection('events').doc(String(eventId)).set(childActivityData);
        
        // Update parent event to indicate it has sub-activities
        await firestore.collection('events').doc(parentEventId).update({
            hasSubActivities: true
        });
        
        const statusText = status === 'draft' ? 'saved as draft' : 'created';
        showToast(`Child activity ${statusText} successfully!`, 'success');
        
        // Redirect to parent event details page
        setTimeout(() => {
            window.location.href = `event-details.html?id=${parentEventId}`;
        }, 1500);
        
    } catch (error) {
        console.error('Error saving child activity:', error);
        showToast('Error creating child activity: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Generate numeric event ID using Firestore transaction
async function generateNumericEventId() {
    const counterDocRef = firestore.collection('counters').doc('eventId');
    let newId = null;
    await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(counterDocRef);
        const current = doc.exists ? doc.data().value : 0;
        newId = current + 1;
        transaction.set(counterDocRef, { value: newId });
    });
    return newId;
}
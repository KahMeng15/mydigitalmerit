// Create Event functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();

    // Form event listeners
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
    document.getElementById('saveDraftBtn').addEventListener('click', saveDraft);
    document.getElementById('eventLevel').addEventListener('change', updateMeritPreview);
    document.getElementById('signOutBtn').addEventListener('click', signOut);
});

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('eventDate').min = today;
    document.getElementById('eventEndDate').min = today;
    
    // Update end date minimum when start date changes
    document.getElementById('eventDate').addEventListener('change', function() {
        const startDate = this.value;
        const endDateField = document.getElementById('eventEndDate');
        if (startDate) {
            endDateField.min = startDate;
            // Clear end date if it's now before start date
            if (endDateField.value && endDateField.value < startDate) {
                endDateField.value = '';
            }
        }
    });

    // Load merit values for preview
    loadMeritValues();
    
    // Load organizers for dropdown
    loadOrganizers();
}

let meritValues = null;

async function loadMeritValues() {
    try {
        const meritValuesRef = database.ref('meritValues');
        const snapshot = await meritValuesRef.once('value');
        meritValues = snapshot.val();
        
        if (meritValues) {
            updateMeritPreview();
        }
    } catch (error) {
        console.error('Error loading merit values:', error);
    }
}

async function loadOrganizers() {
    try {
        const organizersRef = database.ref('organizers');
        const snapshot = await organizersRef.once('value');
        const organizersData = snapshot.val();
        
        const organizerSelect = document.getElementById('eventOrganizer');
        
        // Clear existing options except the first one
        organizerSelect.innerHTML = '<option value="">Select organizer</option>';
        
        if (organizersData) {
            // Convert to array and sort by name
            const organizers = Object.values(organizersData)
                .filter(org => org.status === 'active')
                .sort((a, b) => a.name.localeCompare(b.name));
            
            // Add organizers to dropdown
            organizers.forEach(organizer => {
                const option = document.createElement('option');
                option.value = organizer.name;
                option.textContent = organizer.name;
                organizerSelect.appendChild(option);
            });
        }
        
        // Add "Others" option at the end
        const othersOption = document.createElement('option');
        othersOption.value = 'Others';
        othersOption.textContent = 'Others';
        organizerSelect.appendChild(othersOption);
        
    } catch (error) {
        console.error('Error loading organizers:', error);
        // If error loading organizers, still add "Others" option
        const organizerSelect = document.getElementById('eventOrganizer');
        const othersOption = document.createElement('option');
        othersOption.value = 'Others';
        othersOption.textContent = 'Others';
        organizerSelect.appendChild(othersOption);
    }
}

function updateMeritPreview() {
    const eventLevel = document.getElementById('eventLevel').value;
    const previewContainer = document.getElementById('meritPreview');
    
    if (!eventLevel || !meritValues) {
        previewContainer.innerHTML = '<p class="text-secondary">Select an event level to see merit points preview</p>';
        return;
    }
    
    let previewHTML = '<div class="grid grid-cols-2 gap-4">';
    
    // Roles preview
    if (meritValues.roles) {
        previewHTML += '<div><h4 class="font-semibold mb-3">Roles</h4><div class="space-y-2">';
        for (const [role, levels] of Object.entries(meritValues.roles)) {
            const points = levels[eventLevel] || 0;
            previewHTML += `
                <div class="flex justify-between">
                    <span>${sanitizeHTML(role)}</span>
                    <span class="font-medium">${points} points</span>
                </div>
            `;
        }
        previewHTML += '</div></div>';
    }
    
    // Achievements preview
    if (meritValues.achievements) {
        previewHTML += '<div><h4 class="font-semibold mb-3">Achievement Bonuses</h4><div class="space-y-2">';
        for (const [achievement, levels] of Object.entries(meritValues.achievements)) {
            const points = levels[eventLevel] || 0;
            previewHTML += `
                <div class="flex justify-between">
                    <span>${sanitizeHTML(achievement)}</span>
                    <span class="font-medium">+${points} points</span>
                </div>
            `;
        }
        previewHTML += '</div></div>';
    }
    
    previewHTML += '</div>';
    previewContainer.innerHTML = previewHTML;
}

async function handleEventSubmit(e) {
    e.preventDefault();
    await saveEvent('active');
}

async function saveDraft() {
    await saveEvent('draft');
}

async function saveEvent(status) {
    try {
        showLoading();
        
        // Get form data
        const formData = getFormData();
        if (!formData) return;
        
        // Set status
        formData.status = status;
        
        // Validate required fields for active events
        if (status === 'active' && !validateRequiredFields(formData)) {
            return;
        }
        
        // Generate numeric event ID
        const eventId = await generateNumericEventId();
        
        // Create event object
        const eventData = {
            ...formData,
            id: eventId,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: getCurrentUser().uid
        };
        
        // Save to database
        const eventRef = database.ref(`events/${eventData.id}`);
        await eventRef.set(eventData);
        
        showToast(`Event ${status === 'draft' ? 'saved as draft' : 'created'} successfully!`, 'success');
        
        // Redirect to events page
        setTimeout(() => {
            window.location.href = 'events.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error saving event:', error);
        showToast('Error saving event: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function getFormData() {
    const eventName = document.getElementById('eventName').value.trim();
    const eventLevel = document.getElementById('eventLevel').value;
    const eventDate = document.getElementById('eventDate').value;
    const eventEndDate = document.getElementById('eventEndDate').value;
    const eventTime = document.getElementById('eventTime').value;
    const eventLocation = document.getElementById('eventLocation').value.trim();
    const eventOrganizer = document.getElementById('eventOrganizer').value.trim();
    const eventDescription = document.getElementById('eventDescription').value.trim();
    const eventStatus = document.querySelector('input[name="eventStatus"]:checked').value;
    
    // Combine date and time
    let dateTime = eventDate;
    if (eventTime) {
        dateTime += 'T' + eventTime;
    }
    
    const formData = {
        name: eventName,
        level: eventLevel,
        date: dateTime,
        location: eventLocation,
        organizer: eventOrganizer,
        description: eventDescription,
        status: eventStatus
    };
    
    // Add end date if provided
    if (eventEndDate) {
        formData.endDate = eventEndDate;
    }
    
    return formData;
}

function validateRequiredFields(formData) {
    const requiredFields = ['name', 'level', 'date'];
    
    for (const field of requiredFields) {
        if (!formData[field]) {
            showToast(`Please fill in all required fields`, 'error');
            return false;
        }
    }
    
    // Validate date is not in the past
    const eventDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (eventDate < today) {
        showToast('Event date cannot be in the past', 'error');
        return false;
    }
    
    // Validate end date if provided
    if (formData.endDate) {
        const endDate = new Date(formData.endDate);
        if (endDate < eventDate) {
            showToast('End date cannot be before start date', 'error');
            return false;
        }
    }
    
    return true;
}

// Generate numeric event ID using counter
async function generateNumericEventId() {
    try {
        const counterRef = database.ref('counters/eventId');
        
        // Use transaction to safely increment counter
        const result = await counterRef.transaction((currentValue) => {
            return (currentValue || 0) + 1;
        });
        
        return result.snapshot.val();
    } catch (error) {
        console.error('Error generating event ID:', error);
        // Fallback to timestamp-based ID if counter fails
        return Date.now();
    }
}

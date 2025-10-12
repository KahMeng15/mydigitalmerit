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
    document.getElementById('addCustomRoleBtn').addEventListener('click', addCustomRoleRow);
    document.getElementById('organizerMain').addEventListener('change', (e) => loadSubOrganizers(e.target.value));
});

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

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
    
    // Check if editing an existing event
    checkForEditMode();
}

let meritValues = null;
let editingEventId = null;

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


async function loadMeritValues() {
    try {
        const snapshot = await firestore.collection('meritvalue').get();
        const roles = {};
        const levels = {};
        const availableLevels = [];
        
        // Process each level document
        snapshot.forEach(doc => {
            const levelName = doc.id; // e.g., "Block Level", "University Level"
            const levelData = doc.data();
            
            // Convert level name to match event levels (remove " Level" suffix)
            const eventLevelName = levelName.replace(' Level', '');
            levels[eventLevelName] = levelData;
            availableLevels.push(eventLevelName);
            
            // For each role in this level, add to roles object
            Object.entries(levelData).forEach(([roleName, points]) => {
                if (!roles[roleName]) {
                    roles[roleName] = {};
                }
                roles[roleName][eventLevelName] = points;
            });
        });
        
        meritValues = { roles: roles, levels: levels, achievements: {} };
        console.log('Loaded merit values:', meritValues);
        
        // Populate event level dropdown
        populateEventLevelDropdown(availableLevels);
        
        // Update preview after loading
        if (meritValues) {
            updateMeritPreview();
        }
        
    } catch (error) {
        console.error('Error loading merit values:', error);
    }
}

function populateEventLevelDropdown(availableLevels) {
    const levelSelect = document.getElementById('eventLevel');
    levelSelect.innerHTML = '<option value="">Select event level</option>';
    
    // Sort levels in a logical order
    const levelOrder = ['University', 'National', 'College', 'Block', 'International'];
    const sortedLevels = availableLevels.sort((a, b) => {
        const aIndex = levelOrder.indexOf(a);
        const bIndex = levelOrder.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    
    // Use Firebase level names directly
    sortedLevels.forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = level;
        levelSelect.appendChild(option);
    });
}


async function loadOrganizers() {
    const mainSelect = document.getElementById('organizerMain');
    const subSelect = document.getElementById('organizerSub');
    mainSelect.innerHTML = '<option value="">Loading...</option>';
    subSelect.innerHTML = '<option value="">Select main organizer first</option>';
    subSelect.disabled = true;

    try {
        const snapshot = await firestore.collection('organizers').get();
        const activeOrganizers = [];
        
        snapshot.forEach(doc => {
            const organizer = { id: doc.id, ...doc.data() };
            if (organizer.status === 'active') {
                activeOrganizers.push(organizer);
            }
        });
        
        // Sort by name_en
        activeOrganizers.sort((a, b) => a.name_en.localeCompare(b.name_en));
        
        // Populate dropdown
        mainSelect.innerHTML = '<option value="">Select main organizer</option>';
        activeOrganizers.forEach(organizer => {
            const option = document.createElement('option');
            option.value = organizer.id;
            option.textContent = `${organizer.name_en} / ${organizer.name_bm}`;
            mainSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading main organizers: ", error);
        mainSelect.innerHTML = '<option value="">Error loading</option>';
    }
}

async function loadSubOrganizers(mainOrganizerId) {
    const subSelect = document.getElementById('organizerSub');
    if (!mainOrganizerId) {
        subSelect.innerHTML = '<option value="">Select main organizer first</option>';
        subSelect.disabled = true;
        return;
    }

    subSelect.innerHTML = '<option value="">Loading...</option>';
    subSelect.disabled = false;

    try {
        const snapshot = await firestore.collection('organizers').doc(mainOrganizerId).collection('subOrganizers').get();
        const subOrganizers = [];
        
        snapshot.forEach(doc => {
            const subOrganizer = { id: doc.id, ...doc.data() };
            // Filter active ones (if status field exists) or include all
            if (!subOrganizer.status || subOrganizer.status === 'active') {
                subOrganizers.push(subOrganizer);
            }
        });
        
        // Sort by name_en
        subOrganizers.sort((a, b) => a.name_en.localeCompare(b.name_en));
        
        // Populate dropdown
        subSelect.innerHTML = '<option value="">None (select if main body is organizer)</option>';
        subOrganizers.forEach(subOrganizer => {
            const option = document.createElement('option');
            option.value = subOrganizer.id;
            option.textContent = `${subOrganizer.name_en} / ${subOrganizer.name_bm}`;
            subSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading sub-organizers: ", error);
        subSelect.innerHTML = '<option value="">Error loading</option>';
    }
}

function addCustomRoleRow() {
    const container = document.getElementById('customRolesContainer');
    const noRolesText = document.getElementById('noCustomRolesText');
    if (noRolesText) {
        noRolesText.remove();
    }

    const roleRow = document.createElement('div');
    roleRow.className = 'grid grid-cols-3 gap-4 items-center custom-role-row';
    roleRow.innerHTML = `
        <div class="col-span-2 grid grid-cols-2 gap-4">
            <input type="text" class="form-control custom-role-name" placeholder="Role Name">
            <input type="number" class="form-control custom-role-value" placeholder="Merit Value" min="0">
        </div>
        <button type="button" class="btn btn-danger btn-sm remove-custom-role-btn">Remove</button>
    `;

    container.appendChild(roleRow);

    roleRow.querySelector('.remove-custom-role-btn').addEventListener('click', (e) => {
        e.target.closest('.custom-role-row').remove();
        if (container.children.length === 0) {
            container.innerHTML = '<p id="noCustomRolesText" class="text-secondary">No custom roles added yet.</p>';
        }
        updateMeritPreview(); // Update preview when a role is removed
    });

    // Add event listeners to update preview on input change
    roleRow.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateMeritPreview);
    });
}

function updateMeritPreview() {
    const eventLevel = document.getElementById('eventLevel').value;
    const previewContainer = document.getElementById('meritPreview');
    
    if (!eventLevel || !meritValues) {
        previewContainer.innerHTML = '<p class="text-secondary">Select an event level to see merit points preview</p>';
        return;
    }
    
    let previewHTML = '<div class="grid grid-cols-2 gap-4">';
    
    // Base roles preview
    if (meritValues.roles) {
        previewHTML += '<div><h4 class="font-semibold mb-3">Base Roles</h4><div class="space-y-2">';
        
        // Create array of roles with their points for sorting
        const dbLevel = mapEventLevelToDbLevel(eventLevel);
        const rolesWithPoints = Object.entries(meritValues.roles).map(([role, levels]) => ({
            role: role,
            points: levels[dbLevel] || 0
        }));
        
        // Sort by points from highest to lowest
        rolesWithPoints.sort((a, b) => b.points - a.points);
        
        // Display sorted roles
        rolesWithPoints.forEach(({ role, points }) => {
            previewHTML += `
                <div class="flex justify-between">
                    <span>${sanitizeHTML(role)}</span>
                    <span class="font-medium">${points} points</span>
                </div>
            `;
        });
        previewHTML += '</div></div>';
    }
    
    // Custom roles preview
    const customRoles = getCustomRolesFromForm();
    previewHTML += '<div><h4 class="font-semibold mb-3">Custom Roles</h4><div class="space-y-2">';
    if (customRoles.length > 0) {
        // Filter and sort custom roles by value from highest to lowest
        const validCustomRoles = customRoles
            .filter(role => role.name && role.value) // Only include roles with both name and value
            .sort((a, b) => parseFloat(b.value) - parseFloat(a.value)); // Sort by value descending
        
        validCustomRoles.forEach(role => {
            previewHTML += `
                <div class="flex justify-between">
                    <span>${sanitizeHTML(role.name)}</span>
                    <span class="font-medium">${role.value} points</span>
                </div>
            `;
        });
    } else {
        previewHTML += '<p class="text-secondary">No custom roles added.</p>';
    }
    previewHTML += '</div></div>';
    
    previewHTML += '</div>';
    previewContainer.innerHTML = previewHTML;
}

async function checkForEditMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');
    
    if (eventId) {
        editingEventId = eventId;
        await loadEventForEditing(eventId);
        // Update page title to indicate editing
        document.title = 'Edit Event - Digital Merit System';
        const pageTitle = document.querySelector('h1');
        if (pageTitle) {
            pageTitle.textContent = 'Edit Event';
        }
    }
}

async function loadEventForEditing(eventId) {
    try {
        showLoading();
        
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        if (!eventDoc.exists) {
            showToast('Event not found', 'error');
            window.location.href = 'events.html';
            return;
        }
        
        const eventData = eventDoc.data();
        
        // Populate form fields
        document.getElementById('eventName').value = eventData.name || '';
        document.getElementById('eventLevel').value = eventData.level || '';
        document.getElementById('eventDescription').value = eventData.description || '';
        document.getElementById('eventLocation').value = eventData.location || '';
        
        // Handle date and time
        if (eventData.date) {
            if (eventData.date.includes('T')) {
                const [datePart, timePart] = eventData.date.split('T');
                document.getElementById('eventDate').value = datePart;
                document.getElementById('eventTime').value = timePart;
            } else {
                document.getElementById('eventDate').value = eventData.date;
            }
        }
        
        if (eventData.endDate) {
            document.getElementById('eventEndDate').value = eventData.endDate;
        }
        
        // Set status radio button
        if (eventData.status) {
            const statusRadio = document.querySelector(`input[name="eventStatus"][value="${eventData.status}"]`);
            if (statusRadio) {
                statusRadio.checked = true;
            }
        }
        
        // Handle organizer selection - wait for organizers to load first
        setTimeout(() => {
            if (eventData.organizer) {
                if (eventData.organizer.main_id) {
                    document.getElementById('organizerMain').value = eventData.organizer.main_id;
                    // Trigger change event to load sub-organizers
                    if (eventData.organizer.sub_id) {
                        loadSubOrganizers(eventData.organizer.main_id).then(() => {
                            document.getElementById('organizerSub').value = eventData.organizer.sub_id;
                        });
                    }
                }
            }
        }, 1000);
        
        // Handle custom roles
        if (eventData.customRoles && eventData.customRoles.length > 0) {
            // Clear existing custom roles
            document.getElementById('customRolesContainer').innerHTML = '';
            
            // Add each custom role
            eventData.customRoles.forEach(role => {
                addCustomRole();
                const roleRows = document.querySelectorAll('#customRolesContainer .custom-role-row');
                const lastRow = roleRows[roleRows.length - 1];
                lastRow.querySelector('.custom-role-name').value = role.name;
                lastRow.querySelector('.custom-role-value').value = role.value;
            });
        }
        
        // Update merit preview after all data is loaded
        setTimeout(updateMeritPreview, 1200);
        
        showToast('Event loaded for editing', 'success');
        
    } catch (error) {
        console.error('Error loading event for editing:', error);
        showToast('Error loading event: ' + error.message, 'error');
        window.location.href = 'events.html';
    } finally {
        hideLoading();
    }
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
        
        let eventData;
        let eventId;
        
        if (editingEventId) {
            // Editing existing event
            eventId = editingEventId;
            eventData = {
                ...formData,
                id: eventId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: getCurrentUser().uid
            };
            
            // Merge with existing data to preserve createdAt and createdBy
            await firestore.collection('events').doc(String(eventId)).update(eventData);
            showToast(`Event ${status === 'draft' ? 'saved as draft' : 'updated'} successfully!`, 'success');
        } else {
            // Creating new event
            eventId = await generateNumericEventId();
            eventData = {
                ...formData,
                id: eventId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: getCurrentUser().uid
            };
            
            // Save to Firestore
            await firestore.collection('events').doc(String(eventId)).set(eventData);
            showToast(`Event ${status === 'draft' ? 'saved as draft' : 'created'} successfully!`, 'success');
        }
        
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

function getCustomRolesFromForm() {
    const customRoles = [];
    const roleRows = document.querySelectorAll('#customRolesContainer .custom-role-row');
    roleRows.forEach(row => {
        const nameInput = row.querySelector('.custom-role-name');
        const valueInput = row.querySelector('.custom-role-value');
        const name = nameInput.value.trim();
        const value = parseInt(valueInput.value, 10);
        if (name && !isNaN(value)) {
            customRoles.push({ name, value });
        }
    });
    return customRoles;
}

function getFormData() {
    const eventName = document.getElementById('eventName').value.trim();
    const eventLevel = document.getElementById('eventLevel').value;
    const eventDate = document.getElementById('eventDate').value;
    const eventEndDate = document.getElementById('eventEndDate').value;
    const eventTime = document.getElementById('eventTime').value;
    const eventLocation = document.getElementById('eventLocation').value.trim();
    
    const mainOrganizerSelect = document.getElementById('organizerMain');
    const subOrganizerSelect = document.getElementById('organizerSub');
    const organizer = {
        main_id: mainOrganizerSelect.value,
        main_name: mainOrganizerSelect.options[mainOrganizerSelect.selectedIndex].textContent,
        sub_id: subOrganizerSelect.value || null,
        sub_name: subOrganizerSelect.value ? subOrganizerSelect.options[subOrganizerSelect.selectedIndex].textContent : null
    };

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
        organizer: organizer,
        description: eventDescription,
        status: eventStatus,
        customRoles: getCustomRolesFromForm()
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

    if (!formData.organizer.main_id) {
        showToast('Please select a main organizer.', 'error');
        return false;
    }
    
    // Validate date is within the allowed year range
    const eventDate = new Date(formData.date);
    const eventYear = eventDate.getFullYear();
    const currentYear = new Date().getFullYear();

    if (eventYear < currentYear - 1 || eventYear > currentYear + 1) {
        showToast(`Event date must be within ${currentYear - 1}, ${currentYear}, or ${currentYear + 1}.`, 'error');
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

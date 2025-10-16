// Utility functions
function requireAdmin() {
    // This should be implemented based on your auth system
    // For now, just return true to avoid blocking
    return true;
}

function signOut() {
    // Implement sign out functionality
    console.log('Sign out clicked');
    if (confirm('Are you sure you want to sign out?')) {
        window.location.href = '/';
    }
}

function showToast(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
    // Could implement actual toast notifications here
}

function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function generateUniqueId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Create Event functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();

    // Form event listeners
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
    document.getElementById('saveDraftBtn').addEventListener('click', saveDraft);
    document.getElementById('eventLevel').addEventListener('change', onEventLevelChange);
    document.getElementById('competitionLevel').addEventListener('change', updateMeritPreview);
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

    // Load level configurations and merit values
    loadMeritValues();
    
    // Load organizers for dropdown
    loadOrganizers();
    
    // Check if editing an existing event
    checkForEditMode();
}

let meritValues = null;
let editingEventId = null;


async function loadMeritValues() {
    try {
        const firestore = window.firestore;
        if (!firestore) {
            throw new Error('Firestore not available');
        }

        // Load from hierarchical structure
        const result = await loadMeritValuesHierarchical();
        
        // Load level configurations
        await loadLevelConfigurations();
        
        // Build compatibility format for updateMeritPreview function
        const roles = {};
        
        // Process committee roles
        Object.entries(result.committee || {}).forEach(([roleId, roleData]) => {
            if (roleData.levelValues) {
                roles[roleData.nameBM || roleData.nameEN || roleId] = roleData.levelValues;
            }
        });
        
        // Process non-committee roles
        Object.entries(result.nonCommittee || {}).forEach(([roleId, roleData]) => {
            if (roleData.levelValues) {
                roles[roleData.nameBM || roleData.nameEN || roleId] = roleData.levelValues;
            }
        });
        
        // Store in global variable for preview function
        meritValues = { 
            roles: roles, 
            rawData: result 
        };
        
        console.log('Loaded hierarchical merit values:', meritValues);
        
        // Update preview after loading
        if (meritValues) {
            updateMeritPreview();
            populateEventLevels();
            populateCompetitionLevels();
        }
        
    } catch (error) {
        console.error('Error loading merit values:', error);
        // Initialize empty structure on error
        meritValues = { roles: {}, rawData: { committee: {}, nonCommittee: {}, competitions: {} } };
    }
}

// Hierarchical Data Loading Function for create-event
async function loadMeritValuesHierarchical() {
    try {
        const firestore = window.firestore;
        const result = {
            committee: {},
            nonCommittee: {},
            competitions: {}
        };

        // Load committee roles from hierarchical structure
        const committeeSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata').collection('committee').get();
        
        committeeSnapshot.forEach(doc => {
            result.committee[doc.id] = doc.data();
        });

        // Load non-committee roles
        const nonCommitteeSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata').collection('nonCommittee').get();
        
        nonCommitteeSnapshot.forEach(doc => {
            result.nonCommittee[doc.id] = doc.data();
        });

        // Load competition achievements
        const competitionSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata').collection('competition').get();
        
        competitionSnapshot.forEach(doc => {
            result.competitions[doc.id] = doc.data();
        });

        return result;

    } catch (error) {
        console.error('Error loading hierarchical merit values:', error);
        return {
            committee: {},
            nonCommittee: {},
            competitions: {}
        };
    }
}

// Level configurations loading
let currentLevelConfigs = { eventLevels: [], competitionLevels: [] };

// Helper functions for level management
function getLevelIdByName(levelName) {
    if (!levelName || !currentLevelConfigs.eventLevels) return null;
    
    const level = currentLevelConfigs.eventLevels.find(level => 
        level.nameEN === levelName || 
        level.nameBM === levelName || 
        level.key === levelName
    );
    
    return level ? level.id : null;
}

function getLevelName(levelId) {
    if (!levelId || !currentLevelConfigs.eventLevels) return '';
    
    const level = currentLevelConfigs.eventLevels.find(level => level.id === levelId);
    return level ? (level.nameEN || level.nameBM || level.key || 'Unknown Level') : '';
}

function getCompetitionLevelName(levelId) {
    if (!levelId || !currentLevelConfigs.competitionLevels) return '';
    
    const level = currentLevelConfigs.competitionLevels.find(level => level.id === levelId);
    return level ? (level.nameEN || level.nameBM || level.key || 'Unknown Level') : '';
}

function getCompetitionLevelIdByName(levelName) {
    if (!levelName || !currentLevelConfigs.competitionLevels) return null;
    
    const level = currentLevelConfigs.competitionLevels.find(level => 
        level.nameEN === levelName || 
        level.nameBM === levelName || 
        level.key === levelName
    );
    
    return level ? level.id : null;
}

async function loadLevelConfigurations() {
    try {
        const firestore = window.firestore;
        
        // Load event levels from hierarchical structure
        const eventLevelsSnapshot = await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection('event')
            .get();
        
        currentLevelConfigs.eventLevels = [];
        eventLevelsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.sortOrder === undefined) {
                data.sortOrder = 999;
            }
            currentLevelConfigs.eventLevels.push(data);
        });
        
        // Sort by sortOrder after loading
        currentLevelConfigs.eventLevels.sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
        
        // Load competition levels from hierarchical structure
        const competitionLevelsSnapshot = await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection('competition')
            .get();
        
        currentLevelConfigs.competitionLevels = [];
        competitionLevelsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.sortOrder === undefined) {
                data.sortOrder = 999;
            }
            currentLevelConfigs.competitionLevels.push(data);
        });
        
        // Sort by sortOrder after loading
        currentLevelConfigs.competitionLevels.sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
        
        console.log('Loaded level configurations for create-event:', {
            eventLevels: currentLevelConfigs.eventLevels.length,
            competitionLevels: currentLevelConfigs.competitionLevels.length
        });
        
    } catch (error) {
        console.error('Error loading level configurations:', error);
        // Fallback to empty arrays
        currentLevelConfigs.eventLevels = [];
        currentLevelConfigs.competitionLevels = [];
    }
}

function populateEventLevels() {
    const levelSelect = document.getElementById('eventLevel');
    const currentValue = levelSelect.value; // Preserve current selection
    
    try {
        // Clear existing options
        levelSelect.innerHTML = '<option value="">Select event level</option>';
        
        // Populate with event levels from hierarchical structure
        if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
            currentLevelConfigs.eventLevels.forEach(level => {
                const option = document.createElement('option');
                option.value = level.id;
                option.textContent = level.nameEN || level.nameBM || level.key || 'Unknown Level';
                
                // Restore selection if editing
                if (currentValue === level.id) {
                    option.selected = true;
                }
                
                levelSelect.appendChild(option);
            });
        }
        
        console.log('Populated event levels:', currentLevelConfigs.eventLevels.length, 'levels');
        
    } catch (error) {
        console.error('Error populating event levels:', error);
        levelSelect.innerHTML = '<option value="">Error loading levels</option>';
    }
}

function populateCompetitionLevels() {
    const competitionSelect = document.getElementById('competitionLevel');
    const currentValue = competitionSelect.value; // Preserve current selection
    
    try {
        // Clear existing options and add "None" option
        competitionSelect.innerHTML = '<option value="">None</option>';
        
        // Populate with competition levels from hierarchical structure
        if (currentLevelConfigs && currentLevelConfigs.competitionLevels) {
            currentLevelConfigs.competitionLevels.forEach(level => {
                const option = document.createElement('option');
                option.value = level.id;
                option.textContent = level.nameEN || level.nameBM || level.key || 'Unknown Level';
                
                // Restore selection if editing
                if (currentValue === level.id) {
                    option.selected = true;
                }
                
                competitionSelect.appendChild(option);
            });
        }
        
        console.log('Populated competition levels:', currentLevelConfigs.competitionLevels.length, 'levels');
        
    } catch (error) {
        console.error('Error populating competition levels:', error);
        competitionSelect.innerHTML = '<option value="">None</option>';
    }
}

function onEventLevelChange() {
    const eventLevelId = document.getElementById('eventLevel').value;
    
    // Auto-select matching competition level
    autoSelectCompetitionLevel(eventLevelId);
    
    // Update merit preview
    updateMeritPreview();
}

function autoSelectCompetitionLevel(eventLevelId) {
    const competitionSelect = document.getElementById('competitionLevel');
    
    if (!eventLevelId || !currentLevelConfigs.eventLevels || !currentLevelConfigs.competitionLevels) {
        return;
    }
    
    // Find the selected event level
    const eventLevel = currentLevelConfigs.eventLevels.find(level => level.id === eventLevelId);
    if (!eventLevel) return;
    
    // Try to find matching competition level with flexible mapping
    const matchingCompLevel = currentLevelConfigs.competitionLevels.find(compLevel => {
        // Get normalized names for comparison
        const eventLevelName = (eventLevel.nameEN || eventLevel.nameBM || eventLevel.key || '').toLowerCase().trim();
        const compLevelName = (compLevel.nameEN || compLevel.nameBM || compLevel.key || '').toLowerCase().trim();
        
        // Match by key first (most reliable)
        if (eventLevel.key && compLevel.key) {
            if (eventLevel.key.toLowerCase() === compLevel.key.toLowerCase()) {
                return true;
            }
        }
        
        // Exact name matches (normalize spaces and punctuation)
        const normalizedEventName = eventLevelName.replace(/[\/\-\s]+/g, ' ').trim();
        const normalizedCompName = compLevelName.replace(/[\/\-\s]+/g, ' ').trim();
        
        if (normalizedEventName === normalizedCompName) {
            return true;
        }
        
        // Define flexible mapping rules (order matters - check more specific matches first)
        const isMatch = (
            // International matches International (check before National to avoid conflict)
            (eventLevelName.includes('international') && compLevelName.includes('international') && !compLevelName.includes('national')) ||
            
            // National matches National (but not International)
            (eventLevelName.includes('national') && !eventLevelName.includes('international') && 
             compLevelName.includes('national') && !compLevelName.includes('international')) ||
            
            // Block matches Block
            (eventLevelName.includes('block') && compLevelName.includes('block')) ||
            
            // College maps to Block (since no College level in competitions)
            (eventLevelName.includes('college') && compLevelName.includes('block')) ||
            
            // Club/Association matches Club Association
            ((eventLevelName.includes('club') || eventLevelName.includes('association')) && 
             (compLevelName.includes('club') || compLevelName.includes('association'))) ||
            
            // Faculty matches Faculty/Club
            (eventLevelName.includes('faculty') && compLevelName.includes('faculty')) ||
            
            // University matches University (but not Inter-University)
            (eventLevelName.includes('university') && compLevelName.includes('university') && 
             !compLevelName.includes('inter'))
        );
        
        return isMatch;
    });
    
    if (matchingCompLevel) {
        competitionSelect.value = matchingCompLevel.id;
    } else {
        // No matching competition level found, set to "None"
        competitionSelect.value = '';
    }
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
    const eventLevelId = document.getElementById('eventLevel').value; // Contains level ID
    const previewContainer = document.getElementById('meritPreview');
    
    if (!eventLevelId || !meritValues) {
        previewContainer.innerHTML = '<p class="text-secondary">Select an event level to see merit points preview</p>';
        return;
    }
    
    // Get level display name from current level configs
    const selectedLevel = currentLevelConfigs.eventLevels.find(level => level.id === eventLevelId);
    const levelDisplayName = selectedLevel ? (selectedLevel.nameEN || selectedLevel.nameBM || selectedLevel.key) : 'Unknown Level';
    
    // Get competition level info
    const competitionLevelId = document.getElementById('competitionLevel').value;
    const selectedCompLevel = competitionLevelId ? 
        currentLevelConfigs.competitionLevels.find(level => level.id === competitionLevelId) : null;
    
    let previewHTML = '<div class="grid grid-cols-3 gap-4">';
    
    // Base roles preview
    if (meritValues.roles) {
        previewHTML += `<div><h4 class="font-semibold mb-3">Base Roles (${sanitizeHTML(levelDisplayName)})</h4><div class="space-y-2">`;
        
        // Create array of roles with their points for sorting
        const rolesWithPoints = Object.entries(meritValues.roles).map(([role, levels]) => ({
            role: role,
            points: levels[eventLevelId] || 0
        }));
        
        // Sort by points from highest to lowest, then filter out zero-point roles for cleaner display
        rolesWithPoints
            .filter(({ points }) => points > 0)
            .sort((a, b) => b.points - a.points)
            .forEach(({ role, points }) => {
                previewHTML += `
                    <div class="flex justify-between">
                        <span>${sanitizeHTML(role)}</span>
                        <span class="font-medium">${points} points</span>
                    </div>
                `;
            });
        
        // Show message if no roles have points at this level
        const hasRolesWithPoints = rolesWithPoints.some(({ points }) => points > 0);
        if (!hasRolesWithPoints) {
            previewHTML += '<p class="text-secondary">No roles configured with points for this level.</p>';
        }
        
        previewHTML += '</div></div>';
    }
    
    // Competition achievements preview
    previewHTML += '<div><h4 class="font-semibold mb-3">Competition Achievements';
    if (selectedCompLevel) {
        previewHTML += ` (${sanitizeHTML(selectedCompLevel.nameEN || selectedCompLevel.nameBM || selectedCompLevel.key)})`;
    }
    previewHTML += '</h4><div class="space-y-2">';
    
    if (competitionLevelId && meritValues.rawData && meritValues.rawData.competitions) {
        // Show competition achievements with points for the selected competition level
        const competitionsWithPoints = Object.entries(meritValues.rawData.competitions)
            .map(([compId, compData]) => ({
                name: compData.nameBM || compData.nameEN || compId,
                points: compData.levelValues ? (compData.levelValues[competitionLevelId] || 0) : 0
            }))
            .filter(({ points }) => points > 0)
            .sort((a, b) => b.points - a.points);
        
        if (competitionsWithPoints.length > 0) {
            competitionsWithPoints.forEach(({ name, points }) => {
                previewHTML += `
                    <div class="flex justify-between">
                        <span>${sanitizeHTML(name)}</span>
                        <span class="font-medium">${points} points</span>
                    </div>
                `;
            });
        } else {
            previewHTML += '<p class="text-secondary">No competition achievements configured for this level.</p>';
        }
    } else {
        previewHTML += '<p class="text-secondary">No competition level selected.</p>';
    }
    previewHTML += '</div></div>';
    
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
        
        if (validCustomRoles.length === 0) {
            previewHTML += '<p class="text-secondary">No valid custom roles added yet.</p>';
        }
    } else {
        previewHTML += '<p class="text-secondary">No custom roles added yet.</p>';
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
        
        // Handle both new levelId format and legacy level format
        let levelToSelect = eventData.levelId; // New format with level ID
        if (!levelToSelect && eventData.level) {
            // Legacy format - try to find level ID by name
            levelToSelect = getLevelIdByName(eventData.level);
        }
        document.getElementById('eventLevel').value = levelToSelect || '';
        
        // Handle competition level (new feature)
        if (eventData.competitionLevelId) {
            document.getElementById('competitionLevel').value = eventData.competitionLevelId;
        } else if (eventData.competitionLevel) {
            // Legacy format - try to find competition level ID by name
            const competitionLevelId = getCompetitionLevelIdByName(eventData.competitionLevel);
            if (competitionLevelId) {
                document.getElementById('competitionLevel').value = competitionLevelId;
            }
        }
        
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
                addCustomRoleRow();
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
    const eventLevelId = document.getElementById('eventLevel').value; // This is now a level ID
    const competitionLevelId = document.getElementById('competitionLevel').value; // Competition level ID
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
        levelId: eventLevelId,                                    // Store level ID
        level: getLevelName(eventLevelId),                        // Store display name for backward compatibility
        competitionLevelId: competitionLevelId || null,           // Store competition level ID (null if "None")
        competitionLevel: competitionLevelId ? getCompetitionLevelName(competitionLevelId) : null, // Store display name for backward compatibility
        date: dateTime,
        location: eventLocation,
        organizer: organizer,
        description: eventDescription,
        status: eventStatus,
        customRoles: getCustomRolesFromForm(),
        
        // Events can have child activities added as subcollections
        hasSubActivities: false
    };
    
    // Add end date if provided
    if (eventEndDate) {
        formData.endDate = eventEndDate;
    }
    
    return formData;
}

function validateRequiredFields(formData) {
    const requiredFields = ['name', 'levelId', 'date'];
    
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

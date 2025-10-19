// Upload Merits functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
    setupEventListeners();
    
    // Load saved progress from localStorage and URL
    loadSavedProgress();
});

let selectedEvent = null;
let meritValues = null;
let levelConfigurations = {
    eventLevels: [],
    competitionLevels: []
};
let processedData = [];
let validRecords = [];
let invalidRecords = [];
let excelData = null;
let columnHeaders = [];
let columnMapping = {};
let currentWorkbook = null;

// LocalStorage management
const STORAGE_KEY = 'upload_merits_progress';

function saveProgressToStorage() {
    // Get filename from file input if available
    let filename = null;
    const fileInput = document.getElementById('excelFile');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        filename = fileInput.files[0].name;
    }

    const progressData = {
        currentStep: currentStepNumber,
        selectedEvent: selectedEvent,
        excelData: excelData,
        columnHeaders: columnHeaders,
        columnMapping: columnMapping,
        processedData: processedData,
        validRecords: validRecords,
        invalidRecords: invalidRecords,
        filename: filename, // Save filename for user reference
        // Save form values
        formData: {
            eventSelect: getFormValue('eventSelect'),
            childActivitySelect: getFormValue('childActivitySelect'),
            meritSource: getFormValue('meritSource'),
            customMeritValue: getFormValue('customMeritValue'),
            customLevel: getFormValue('customLevel'),
            customCategory: getFormValue('customCategory'),
            customSubcategory: getFormValue('customSubcategory'),
            customMeritPerAchievement: getFormValue('customMeritPerAchievement'),
            sheetSelect: getFormValue('sheetSelect')
        },
        timestamp: Date.now()
    };
    
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
        console.log('Progress saved to localStorage');
    } catch (error) {
        console.warn('Failed to save progress to localStorage:', error);
    }
}

function loadSavedProgress() {
    try {
        // First check URL parameters for step
        const urlParams = new URLSearchParams(window.location.search);
        const urlStep = urlParams.get('step');
        
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) {
            // If there's a step in URL but no saved data, just go to that step
            if (urlStep && !isNaN(urlStep)) {
                const stepNumber = parseInt(urlStep);
                if (stepNumber >= 1 && stepNumber <= 8) {
                    setTimeout(() => goToStep(stepNumber), 100);
                }
            }
            return;
        }
        
        const progressData = JSON.parse(savedData);
        
        // Check if data is not too old (24 hours)
        const dataAge = Date.now() - progressData.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (dataAge > maxAge) {
            clearSavedProgress();
            return;
        }
        
        // Restore data
        if (progressData.selectedEvent) {
            selectedEvent = progressData.selectedEvent;
        }
        if (progressData.excelData) {
            excelData = progressData.excelData;
        }
        if (progressData.columnHeaders) {
            columnHeaders = progressData.columnHeaders;
        }
        if (progressData.columnMapping) {
            columnMapping = progressData.columnMapping;
        }
        if (progressData.processedData) {
            processedData = progressData.processedData;
        }
        if (progressData.validRecords) {
            validRecords = progressData.validRecords;
        }
        if (progressData.invalidRecords) {
            invalidRecords = progressData.invalidRecords;
        }
        
        // Restore form values after DOM is ready
        setTimeout(() => {
            restoreFormData(progressData.formData);
            
            // Show filename info if available
            if (progressData.filename) {
                showFileRestoreInfo(progressData.filename);
            }
            
            // If we have Excel data but no current file, show the restoration info
            if (progressData.excelData && progressData.filename) {
                updateFileDisplay(progressData.filename, true);
            }
            
            // Use URL step if provided, otherwise use saved step
            const targetStep = urlStep && !isNaN(urlStep) ? parseInt(urlStep) : progressData.currentStep;
            if (targetStep && targetStep >= 1 && targetStep <= 8) {
                goToStep(targetStep);
                updateStepUrl(targetStep);
            }
        }, 500);
        
        console.log('Progress loaded from localStorage');
        
    } catch (error) {
        console.warn('Failed to load saved progress:', error);
        clearSavedProgress();
    }
}

function restoreFormData(formData) {
    if (!formData) return;
    
    // Restore all form values first
    Object.entries(formData).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            setFormValue(key, value);
        }
    });
    
    // Trigger events to update dependent elements and UI
    setTimeout(() => {
        // Trigger event select change
        if (formData.eventSelect) {
            const eventSelect = document.getElementById('eventSelect');
            if (eventSelect && eventSelect.value) {
                // Trigger the change event to update dependent dropdowns
                eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        // Trigger merit source change
        if (formData.meritSource) {
            const sourceSelect = document.getElementById('meritSource');
            if (sourceSelect && sourceSelect.value) {
                // Trigger the change event to show/hide appropriate fields
                sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        // Trigger child activity change if exists
        if (formData.childActivitySelect) {
            const childActivitySelect = document.getElementById('childActivitySelect');
            if (childActivitySelect && childActivitySelect.value) {
                childActivitySelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        // Trigger sheet select change if exists
        if (formData.sheetSelect) {
            const sheetSelect = document.getElementById('sheetSelect');
            if (sheetSelect && sheetSelect.value) {
                sheetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, 100);
}

function getFormValue(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return null;
    
    if (element.type === 'checkbox') {
        return element.checked;
    } else if (element.type === 'radio') {
        const radioGroup = document.querySelectorAll(`input[name="${element.name}"]`);
        for (const radio of radioGroup) {
            if (radio.checked) return radio.value;
        }
        return null;
    } else {
        return element.value;
    }
}

function setFormValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (element.type === 'checkbox') {
        element.checked = value;
    } else if (element.type === 'radio') {
        const radioGroup = document.querySelectorAll(`input[name="${element.name}"]`);
        for (const radio of radioGroup) {
            if (radio.value === value) {
                radio.checked = true;
                break;
            }
        }
    } else {
        element.value = value;
    }
}

function handleMeritSourceChange() {
    // This function will be called when merit source changes
    // Save progress whenever form data changes
    saveProgressToStorage();
}

function clearSavedProgress() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        console.log('Saved progress cleared');
    } catch (error) {
        console.warn('Failed to clear saved progress:', error);
    }
}

function showFileRestoreInfo(filename) {
    // Find a suitable place to show the file restoration info
    const fileInput = document.getElementById('excelFile');
    if (fileInput && fileInput.parentNode) {
        // Remove any existing restore info
        const existingInfo = fileInput.parentNode.querySelector('.file-restore-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        
        // Create new info element
        const infoDiv = document.createElement('div');
        infoDiv.className = 'file-restore-info alert alert-info mt-2';
        infoDiv.innerHTML = `
            <i class="fas fa-info-circle me-2"></i>
            <strong>File data restored:</strong> ${filename}
            <br><small>Your previous progress has been restored. You can continue from where you left off or upload a new file.</small>
        `;
        
        fileInput.parentNode.appendChild(infoDiv);
    }
}

function updateFileDisplay(filename, isRestored = false) {
    const fileInput = document.getElementById('excelFile');
    if (fileInput && fileInput.parentNode) {
        // Find or create file display area
        let displayArea = fileInput.parentNode.querySelector('.file-display-area');
        if (!displayArea) {
            displayArea = document.createElement('div');
            displayArea.className = 'file-display-area mt-2';
            fileInput.parentNode.appendChild(displayArea);
        }
        
        const statusClass = isRestored ? 'text-info' : 'text-success';
        const icon = isRestored ? 'fas fa-history' : 'fas fa-file-excel';
        const label = isRestored ? 'Restored file data' : 'Selected file';
        
        displayArea.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="${icon} ${statusClass} me-2"></i>
                <span class="${statusClass}"><strong>${label}:</strong> ${filename}</span>
            </div>
        `;
    }
}

function updateStepUrl(stepNumber) {
    const url = new URL(window.location);
    url.searchParams.set('step', stepNumber);
    window.history.replaceState({}, '', url);
}

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Add a small delay to ensure Firebase is fully initialized
    setTimeout(async () => {
        await loadEvents();
        await loadMeritValues();
    }, 100);
    
    // Check for eventId and childActivityId in URL params (legacy support)
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');
    const childActivityId = urlParams.get('childActivityId');
    
    if (eventId) {
        // Pre-select event if provided in URL
        setTimeout(async () => {
            document.getElementById('eventSelect').value = eventId;
            await handleEventSelect();
            
            // If childActivityId is also provided, pre-select it
            if (childActivityId) {
                setTimeout(() => {
                    const childActivitySelect = document.getElementById('childActivitySelect');
                    if (childActivitySelect) {
                        childActivitySelect.value = childActivityId;
                        handleChildActivitySelect();
                    }
                }, 500);
            }
        }, 1000);
    }
}

function setupEventListeners() {
    // Helper function to safely add event listeners
    function addEventListenerSafely(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with id '${id}' not found`);
        }
    }
    
    // Sign out
    addEventListenerSafely('signOutBtn', 'click', signOut);
    
    // Event selection
    addEventListenerSafely('eventSelect', 'change', handleEventSelect);
    addEventListenerSafely('childActivitySelect', 'change', () => saveProgressToStorage());
    
    // Merit type selection
    addEventListenerSafely('meritType', 'change', handleMeritTypeChange);
    addEventListenerSafely('overrideMeritValue', 'change', handleOverrideToggle);
    
    // Merit source selection
    addEventListenerSafely('meritSource', 'change', handleMeritSourceChange);
    
    // Custom merit fields
    addEventListenerSafely('customMeritValue', 'input', () => saveProgressToStorage());
    addEventListenerSafely('customLevel', 'change', () => saveProgressToStorage());
    addEventListenerSafely('customCategory', 'change', () => saveProgressToStorage());
    addEventListenerSafely('customSubcategory', 'change', () => saveProgressToStorage());
    addEventListenerSafely('customMeritPerAchievement', 'input', () => saveProgressToStorage());
    
    // File upload
    addEventListenerSafely('excelFile', 'change', handleFileSelect);
    // Removed processFileBtn since Step 5 was eliminated
    
    // Template download
    addEventListenerSafely('downloadTemplateBtn', 'click', downloadTemplate);
    
    // Preview actions
    addEventListenerSafely('exportPreviewBtn', 'click', exportPreview);
    
    // Page navigation
    addEventListenerSafely('nextFromStep1', 'click', () => goToStep(2));
    addEventListenerSafely('backFromStep2', 'click', () => goToStep(1));
    addEventListenerSafely('nextFromStep2', 'click', () => goToStep(3));
    addEventListenerSafely('backFromStep3', 'click', () => goToStep(2));
    addEventListenerSafely('nextFromStep3', 'click', handleFileUploadNext);
    addEventListenerSafely('backFromStep4', 'click', () => goToStep(3));
    addEventListenerSafely('nextFromStep4', 'click', handleSheetSelectionNext);
    addEventListenerSafely('backFromStep5', 'click', () => goToStep(4));
    addEventListenerSafely('nextFromStep5', 'click', proceedToRoleAssignment);
    addEventListenerSafely('backFromStep6', 'click', () => goToStep(5));
    addEventListenerSafely('nextFromStep6', 'click', proceedToValidation);
    addEventListenerSafely('assignGeneralCommitteeBtn', 'click', assignGeneralCommitteeToUnassigned);
    addEventListenerSafely('backFromStep7', 'click', () => goToStep(6));
    addEventListenerSafely('nextFromStep7', 'click', () => {
        updateUploadSummary();
        goToStep(8);
    });
    addEventListenerSafely('backFromStep8', 'click', () => goToStep(7));
    addEventListenerSafely('nextFromStep8', 'click', () => {
        goToStep(9);
        finalizeUpload();
    });
    addEventListenerSafely('finishUploadBtn', 'click', () => window.location.href = 'events.html');
    
    // Role assignment will be handled in Step 6
}

async function loadEvents() {
    try {
        // Check if firestore is available
        if (!window.firebase || !window.firestore) {
            console.error('Firebase or Firestore not initialized');
            throw new Error('Firebase not properly initialized');
        }
        
        // Load only parent events (not sub-activities) for the main dropdown
        const eventsSnapshot = await firestore.collection('events').get();
        const parentEvents = {};
        
        eventsSnapshot.forEach(doc => {
            const event = doc.data();
            if (!event.isSubActivity) {
                parentEvents[doc.id] = { id: doc.id, ...event };
            }
        });
        
        const eventSelect = document.getElementById('eventSelect');
        eventSelect.innerHTML = '<option value="">Select a parent event...</option>';
        
        // Sort parent events by date (most recent first)
        const sortedParents = Object.entries(parentEvents)
            .sort(([,a], [,b]) => new Date(b.date) - new Date(a.date));
        
        sortedParents.forEach(([id, event]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${event.name} (${formatDate(event.date)})`;
            eventSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading events:', error);
        showToast('Error loading events', 'error');
    }
}

async function loadMeritValues() {
    try {
        // Check if firestore is available
        if (!window.firebase || !window.firestore) {
            console.error('Firebase or Firestore not initialized');
            throw new Error('Firebase not properly initialized');
        }
        
        // Load level configurations first
        await loadLevelConfigurations();
        
        // Try hierarchical structure first, fall back to legacy
        try {
            await loadMeritValuesHierarchical();
            console.log('Successfully loaded hierarchical merit values');
        } catch (hierarchicalError) {
            console.warn('Hierarchical merit values not found, trying legacy format:', hierarchicalError);
            try {
                await loadMeritValuesLegacy();
                console.log('Successfully loaded legacy merit values');
            } catch (legacyError) {
                console.warn('Legacy merit values not found either:', legacyError);
                // Initialize empty structure
                meritValues = { roles: {}, achievements: {} };
                console.log('Initialized empty merit values structure');
            }
        }
        
        console.log('Loaded merit values:', meritValues);
    } catch (error) {
        console.error('Error loading merit values:', error);
    }
}

async function loadLevelConfigurations() {
    try {
        const firestore = window.firestore;
        
        // Load level configurations from hierarchical structure
        const [eventLevelsSnapshot, competitionLevelsSnapshot] = await Promise.all([
            firestore.collection('meritValues').doc('levelMetadata').collection('event').orderBy('sortOrder').get(),
            firestore.collection('meritValues').doc('levelMetadata').collection('competition').orderBy('sortOrder').get()
        ]);
        
        if (eventLevelsSnapshot.empty && competitionLevelsSnapshot.empty) {
            console.warn('No level configurations found, creating defaults');
            await createDefaultLevelConfigurations();
            return;
        }
        
        levelConfigurations.eventLevels = [];
        levelConfigurations.competitionLevels = [];
        
        // Process event levels
        eventLevelsSnapshot.forEach(doc => {
            const levelData = { id: doc.id, ...doc.data() };
            levelConfigurations.eventLevels.push(levelData);
        });
        
        // Process competition levels  
        competitionLevelsSnapshot.forEach(doc => {
            const levelData = { id: doc.id, ...doc.data() };
            levelConfigurations.competitionLevels.push(levelData);
        });
        
    } catch (error) {
        console.error('Error loading level configurations:', error);
        throw error;
    }
}

async function createDefaultLevelConfigurations() {
    const firestore = window.firestore;
    const eventLevelsRef = firestore.collection('meritValues').doc('levelMetadata').collection('event');
    const competitionLevelsRef = firestore.collection('meritValues').doc('levelMetadata').collection('competition');
    
    const defaultEventLevels = [
        { key: 'college', nameBM: 'Kolej', nameEN: 'College', sortOrder: 0 },
        { key: 'block', nameBM: 'Blok', nameEN: 'Block', sortOrder: 1 },
        { key: 'university', nameBM: 'Universiti', nameEN: 'University', sortOrder: 2 },
        { key: 'national', nameBM: 'Kebangsaan', nameEN: 'National', sortOrder: 3 },
        { key: 'international', nameBM: 'Antarabangsa', nameEN: 'International', sortOrder: 4 }
    ];
    
    const defaultCompetitionLevels = [
        { key: 'college', nameBM: 'Kolej', nameEN: 'College', sortOrder: 0 },
        { key: 'block', nameBM: 'Blok', nameEN: 'Block', sortOrder: 1 },
        { key: 'faculty', nameBM: 'Fakulti', nameEN: 'Faculty', sortOrder: 2 },
        { key: 'university', nameBM: 'Universiti', nameEN: 'University', sortOrder: 3 },
        { key: 'interuniversity', nameBM: 'Antara Universiti', nameEN: 'Inter-University', sortOrder: 4 },
        { key: 'state', nameBM: 'Negeri', nameEN: 'State', sortOrder: 5 },
        { key: 'national', nameBM: 'Kebangsaan', nameEN: 'National', sortOrder: 6 },
        { key: 'international', nameBM: 'Antarabangsa', nameEN: 'International', sortOrder: 7 }
    ];
    
    const batch = firestore.batch();
    
    // Add event levels
    defaultEventLevels.forEach(level => {
        const docRef = eventLevelsRef.doc(); // Auto-generate ID
        batch.set(docRef, level);
    });
    
    // Add competition levels  
    defaultCompetitionLevels.forEach(level => {
        const docRef = competitionLevelsRef.doc(); // Auto-generate ID
        batch.set(docRef, level);
    });
    
    await batch.commit();
    
    // Update local configurations
    levelConfigurations.eventLevels = defaultEventLevels;
    levelConfigurations.competitionLevels = defaultCompetitionLevels;
}

async function loadMeritValuesHierarchical() {
    const firestore = window.firestore;
    
    // Load role metadata from hierarchical structure using the correct paths
    const [committeeSnapshot, nonCommitteeSnapshot, competitionSnapshot] = await Promise.all([
        firestore.collection('meritValues').doc('roleMetadata').collection('committee').get(),
        firestore.collection('meritValues').doc('roleMetadata').collection('nonCommittee').get(),
        firestore.collection('meritValues').doc('roleMetadata').collection('competition').get()
    ]);
    
    const roles = {};
    const committeeRoles = {};
    const achievements = {};
    
    // Process committee roles (keep separate for role assignment but don't show in dropdown)
    committeeSnapshot.forEach(doc => {
        const roleData = doc.data();
        const roleName = roleData.nameEN || roleData.nameBM;
        if (roleName) {
            committeeRoles[roleName] = roleData.levelValues || {};
        }
    });
    
    // Process non-committee roles (these will show individually in dropdown)
    nonCommitteeSnapshot.forEach(doc => {
        const roleData = doc.data();
        const roleName = roleData.nameEN || roleData.nameBM;
        if (roleName) {
            roles[roleName] = roleData.levelValues || {};
        }
    });
    
    // Process competition achievements
    competitionSnapshot.forEach(doc => {
        const roleData = doc.data();
        const achievementName = roleData.nameEN || roleData.nameBM;
        if (achievementName) {
            achievements[achievementName] = roleData.levelValues || {};
        }
    });
    
    meritValues = {
        roles: roles,
        committeeRoles: committeeRoles,
        achievements: achievements
    };
    
    // Validate that we got some data
    if (Object.keys(roles).length === 0 && Object.keys(committeeRoles).length === 0 && Object.keys(achievements).length === 0) {
        throw new Error('No role or achievement data found in hierarchical structure');
    }
}

async function loadMeritValuesLegacy() {
    // Fallback to legacy format for backward compatibility
    const firestore = window.firestore;
    const snapshot = await firestore.collection('meritValues').limit(1).get();
    
    if (snapshot.empty) {
        console.log('No legacy merit values found');
        throw new Error('No merit values found in legacy format');
    }
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    meritValues = {
        roles: data.roles || {},
        committeeRoles: data.committeeRoles || data.roles || {}, // Fallback to roles for backwards compatibility
        achievements: data.achievements || {}
    };
    
    // Validate that we got some data
    if (Object.keys(meritValues.roles).length === 0 && 
        Object.keys(meritValues.committeeRoles).length === 0 && 
        Object.keys(meritValues.achievements).length === 0) {
        throw new Error('Legacy merit values document is empty');
    }
}

// Helper functions for level management
function getLevelName(levelId) {
    const allLevels = [...levelConfigurations.eventLevels, ...levelConfigurations.competitionLevels];
    const level = allLevels.find(l => l.id === levelId);
    return level ? level.nameEN : levelId;
}

function getLevelIdByName(levelName) {
    const allLevels = [...levelConfigurations.eventLevels, ...levelConfigurations.competitionLevels];
    const level = allLevels.find(l => 
        l.nameEN.toLowerCase() === levelName.toLowerCase() || 
        l.nameBM.toLowerCase() === levelName.toLowerCase()
    );
    return level ? level.id : null;
}

async function handleEventSelect() {
    const eventId = document.getElementById('eventSelect').value;
    const childActivityGroup = document.getElementById('childActivityGroup');
    const nextBtn = document.getElementById('nextFromStep1');
    
    if (!eventId) {
        // Reset everything
        childActivityGroup.classList.add('d-none');
        const meritTypeSelect = document.getElementById('meritType');
        meritTypeSelect.innerHTML = '<option value="">Select an event first...</option>';
        if (nextBtn) nextBtn.disabled = true;
        return;
    }
    
    try {
        // Load parent event details
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        selectedEvent = { id: eventId, ...eventDoc.data() };
        
        // Load child activities for this parent event
        await loadChildActivities(eventId);
        
        // Show child activity selection
        childActivityGroup.classList.remove('d-none');
        
        // Display event info (will be updated when child activity is selected)
        displayEventInfo();
        
        // Populate merit types for this event
        await populateMeritTypes();
        
        // Enable next button (parent event is sufficient to proceed)
        if (nextBtn) nextBtn.disabled = false;
        
        // Save progress
        saveProgressToStorage();
        
    } catch (error) {
        console.error('Error loading event:', error);
        showToast('Error loading event details', 'error');
    }
}

async function loadChildActivities(parentEventId) {
    try {
        const childActivitySelect = document.getElementById('childActivitySelect');
        childActivitySelect.innerHTML = '<option value="">Upload to Main Event (No specific activity)</option>';
        
        // Load child activities from subcollection: events/{parentEventId}/activities
        const childActivitiesSnapshot = await firestore
            .collection('events')
            .doc(parentEventId)
            .collection('activities')
            .get();
        
        const childActivities = [];
        childActivitiesSnapshot.forEach(doc => {
            childActivities.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort child activities by order or name
        childActivities.sort((a, b) => {
            if (a.activityOrder && b.activityOrder) {
                return a.activityOrder - b.activityOrder;
            }
            return a.name.localeCompare(b.name);
        });
        
        // Add child activities to dropdown
        childActivities.forEach(activity => {
            const option = document.createElement('option');
            option.value = activity.id;
            option.textContent = `${activity.name}${activity.subActivityType ? ` (${activity.subActivityType})` : ''}`;
            childActivitySelect.appendChild(option);
        });
        
        // Add event listener for child activity selection
        childActivitySelect.removeEventListener('change', handleChildActivitySelect);
        childActivitySelect.addEventListener('change', handleChildActivitySelect);
        
    } catch (error) {
        console.error('Error loading child activities:', error);
        showToast('Error loading child activities', 'error');
    }
}

async function handleChildActivitySelect() {
    const childActivityId = document.getElementById('childActivitySelect').value;
    
    if (!childActivityId) {
        // Selected "Main Event" - use parent event
        await populateMeritTypes();
        displayEventInfo();
    } else {
        // Selected a child activity - load its details from subcollection
        try {
            const parentEventId = document.getElementById('eventSelect').value;
            const childActivityDoc = await firestore
                .collection('events')
                .doc(parentEventId)
                .collection('activities')
                .doc(childActivityId)
                .get();
                
            if (childActivityDoc.exists) {
                const childActivityData = { id: childActivityId, ...childActivityDoc.data() };
                // Update selected event to be the child activity (inherit from parent)
                const parentEvent = selectedEvent;
                selectedEvent = {
                    ...parentEvent, // Inherit parent event properties
                    ...childActivityData, // Override with child activity specifics
                    isChildActivity: true,
                    parentEventId: parentEventId
                };
                await populateMeritTypes();
                displayEventInfo();
            }
        } catch (error) {
            console.error('Error loading child activity:', error);
            showToast('Error loading child activity details', 'error');
        }
    }
}

async function populateMeritTypes() {
    const meritTypeSelect = document.getElementById('meritType');
    meritTypeSelect.innerHTML = '<option value="">Select merit type...</option>';
    
    try {
        // 1. Committee Member (Roles Defined Later)
        const committeeOption = document.createElement('option');
        committeeOption.value = 'committee';
        committeeOption.textContent = 'Committee Member (Roles Defined Later)';
        committeeOption.setAttribute('data-type', 'committee');
        meritTypeSelect.appendChild(committeeOption);
        
        // 2. Competition (Results Defined Later)
        if (meritValues && meritValues.achievements && Object.keys(meritValues.achievements).length > 0) {
            const competitionOption = document.createElement('option');
            competitionOption.value = 'competition';
            competitionOption.textContent = 'Competition (Results Defined Later)';
            competitionOption.setAttribute('data-type', 'competition');
            meritTypeSelect.appendChild(competitionOption);
        }
        
        // 3. Individual Non-Committee Roles (from nonCommittee collection only)
        if (meritValues && meritValues.roles && Object.keys(meritValues.roles).length > 0) {
            // Add separator
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '--- Individual Roles ---';
            meritTypeSelect.appendChild(separator);
            
            // Sort and add non-committee roles
            Object.keys(meritValues.roles).sort().forEach(role => {
                const option = document.createElement('option');
                option.value = role;
                option.textContent = role;
                option.setAttribute('data-type', 'individual');
                meritTypeSelect.appendChild(option);
            });
        }
        
        // 4. Custom roles from selected event
        if (selectedEvent && selectedEvent.customRoles && selectedEvent.customRoles.length > 0) {
            // Add separator
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '--- Custom Roles for this Event ---';
            meritTypeSelect.appendChild(separator);
            
            // Sort custom roles by name
            const sortedCustomRoles = [...selectedEvent.customRoles].sort((a, b) => a.name.localeCompare(b.name));
            
            sortedCustomRoles.forEach(customRole => {
                const option = document.createElement('option');
                option.value = customRole.name;
                option.textContent = `${customRole.name} (${customRole.value} points)`;
                option.setAttribute('data-type', 'custom');
                option.setAttribute('data-value', customRole.value);
                meritTypeSelect.appendChild(option);
            });
        }
        
        // 5. Add "Custom" option at the end
        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Custom';
        customOption.setAttribute('data-type', 'manual-custom');
        meritTypeSelect.appendChild(customOption);
        
    } catch (error) {
        console.error('Error populating merit types:', error);
        showToast('Error loading merit types', 'error');
    }
}



function calculateMeritPointsForUpload(role, eventLevel, additionalNotes = '', meritValues, event) {
    if (!meritValues) return 0;
    
    let basePoints = 0;
    
    // First, check if this is a custom role from the event
    if (event && event.customRoles && event.customRoles.length > 0) {
        const customRole = event.customRoles.find(cr => cr.name === role);
        if (customRole) {
            return customRole.value; // Custom roles have fixed values
        }
    }
    
    // Check for override from merit type selection
    const meritTypeSelect = document.getElementById('meritType');
    const selectedOption = meritTypeSelect.selectedOptions[0];
    if (selectedOption && selectedOption.getAttribute('data-type') === 'custom') {
        const customValue = selectedOption.getAttribute('data-value');
        if (customValue) {
            return parseInt(customValue);
        }
    }
    
    // Check override value
    if (document.getElementById('overrideMeritValue').checked) {
        const customValue = parseInt(document.getElementById('customMeritValue').value);
        if (!isNaN(customValue)) {
            return customValue;
        }
    }
    
    // Handle both new levelId format and legacy level format
    let levelId = eventLevel;
    if (eventLevel && !eventLevel.startsWith('level_') && !eventLevel.startsWith('comp_')) {
        // Legacy format - try to find level ID by name
        levelId = getLevelIdByName(eventLevel);
    }
    
    // Check if this is a competition achievement
    if (meritValues.achievements && meritValues.achievements[role] && meritValues.achievements[role][levelId]) {
        basePoints = meritValues.achievements[role][levelId];
    }
    // Check if this is a committee role
    else if (meritValues.committeeRoles && meritValues.committeeRoles[role] && meritValues.committeeRoles[role][levelId]) {
        basePoints = meritValues.committeeRoles[role][levelId];
    }
    // Fall back to non-committee role calculation using level ID
    else if (meritValues.roles && meritValues.roles[role] && meritValues.roles[role][levelId]) {
        basePoints = meritValues.roles[role][levelId];
    }
    
    // Add bonus points for achievements in additional notes (if implemented)
    let bonusPoints = 0;
    if (additionalNotes && meritValues.achievements) {
        const notes = additionalNotes.toLowerCase();
        for (const [achievement, values] of Object.entries(meritValues.achievements)) {
            if (notes.includes(achievement.toLowerCase()) && values[levelId]) {
                bonusPoints = Math.max(bonusPoints, values[levelId]);
            }
        }
    }
    
    return basePoints + bonusPoints;
}

function displayEventInfo() {
    const eventInfo = document.getElementById('eventInfo');
    const eventDetails = document.getElementById('eventDetails');
    
    if (!selectedEvent || !eventDetails) {
        return;
    }

    // Display basic event information
    displayBasicEventInfo();
    
    // Load and display merit types
    displayMeritTypesHierarchical();
    
    eventInfo.classList.remove('d-none');
}

function displayBasicEventInfo() {
    const eventDetails = document.getElementById('eventDetails');
    
    // Determine what type of selection we have
    const childActivitySelect = document.getElementById('childActivitySelect');
    const selectedChildActivityId = childActivitySelect ? childActivitySelect.value : '';
    
    // Build basic event information grid with event level and competition level
    let eventInfoHtml = `
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-blue-50 p-3 rounded">
                <label class="form-label text-sm font-semibold text-blue-600">Event Level</label>
                <div id="eventLevelBadge" class="mt-2">
                    <span id="eventLevel" class="badge bg-primary">Loading...</span>
                </div>
            </div>
            <div class="bg-orange-50 p-3 rounded">
                <label class="form-label text-sm font-semibold text-orange-600">Competition Level</label>
                <div id="competitionLevelBadge" class="mt-2">
                    <span id="competitionLevel" class="badge bg-warning">Loading...</span>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-purple-50 p-3 rounded">
                <label class="form-label text-sm font-semibold text-purple-600">Date</label>
                <div class="font-medium text-purple-900 mt-1">${formatDate(selectedEvent.date || selectedEvent.startDate)}</div>
            </div>
            <div class="bg-pink-50 p-3 rounded">
                <label class="form-label text-sm font-semibold text-pink-600">Location</label>
                <div class="font-medium text-pink-900 mt-1">${sanitizeHTML(selectedEvent.location || 'Not specified')}</div>
            </div>
        </div>`;
    
    eventDetails.innerHTML = eventInfoHtml;
    
    // Load and display the actual level values
    displayEventAndCompetitionLevels();
}

// Helper function to display event level and competition level
async function displayEventAndCompetitionLevels() {
    try {
        // Display event level
        await displayEventLevel();
        
        // Display competition level
        await displayCompetitionLevel();
        
    } catch (error) {
        console.error('Error displaying levels:', error);
        
        // Set fallback values
        const eventLevelElement = document.getElementById('eventLevel');
        const competitionLevelElement = document.getElementById('competitionLevel');
        
        if (eventLevelElement) {
            eventLevelElement.textContent = selectedEvent.level || 'Unknown';
            eventLevelElement.className = 'badge bg-primary';
        }
        
        if (competitionLevelElement) {
            competitionLevelElement.textContent = selectedEvent.competitionLevel || selectedEvent.level || 'Unknown';
            competitionLevelElement.className = 'badge bg-warning';
        }
    }
}

// Helper function to display event level
async function displayEventLevel() {
    const eventLevelElement = document.getElementById('eventLevel');
    if (!eventLevelElement) return;
    
    console.log('Displaying event level for event:', selectedEvent);
    
    try {
        let levelDisplayName = 'Not Set';
        
        // First try to use the level name directly if available
        if (selectedEvent.level) {
            levelDisplayName = selectedEvent.level;
            console.log('Using selectedEvent.level:', levelDisplayName);
        }
        // If we have a levelId, try to get the proper display name from database
        else if (selectedEvent.levelId) {
            console.log('Using selectedEvent.levelId:', selectedEvent.levelId);
            const levelDoc = await firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('event')
                .doc(selectedEvent.levelId)
                .get();
            
            if (levelDoc.exists) {
                const levelData = levelDoc.data();
                levelDisplayName = levelData.nameEN || levelData.nameBM || selectedEvent.levelId;
                console.log('Found level data:', levelData, 'Display name:', levelDisplayName);
            } else {
                console.log('Level document not found for ID:', selectedEvent.levelId);
            }
        } else {
            console.log('No level or levelId found in event data');
        }
        
        eventLevelElement.textContent = levelDisplayName;
        eventLevelElement.className = 'badge bg-primary';
        console.log('Set event level display to:', levelDisplayName);
        
    } catch (error) {
        console.error('Error displaying event level:', error);
        eventLevelElement.textContent = selectedEvent.level || 'Error';
        eventLevelElement.className = 'badge bg-primary';
    }
}

// Helper function to display competition level
async function displayCompetitionLevel() {
    const competitionLevelElement = document.getElementById('competitionLevel');
    if (!competitionLevelElement) return;
    
    console.log('Displaying competition level for event:', selectedEvent);
    
    try {
        let levelDisplayName = 'Not Set';
        
        // Check if event has competition level information
        if (selectedEvent.competitionLevel) {
            levelDisplayName = selectedEvent.competitionLevel;
            console.log('Using selectedEvent.competitionLevel:', levelDisplayName);
        }
        // If we have a competitionLevelId, try to get the proper display name from database
        else if (selectedEvent.competitionLevelId) {
            console.log('Using selectedEvent.competitionLevelId:', selectedEvent.competitionLevelId);
            const levelDoc = await firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('competition')
                .doc(selectedEvent.competitionLevelId)
                .get();
            
            if (levelDoc.exists) {
                const levelData = levelDoc.data();
                levelDisplayName = levelData.nameEN || levelData.nameBM || selectedEvent.competitionLevelId;
                console.log('Found competition level data:', levelData, 'Display name:', levelDisplayName);
            } else {
                console.log('Competition level document not found for ID:', selectedEvent.competitionLevelId);
            }
        }
        // If no competition level is set, it might use the same as event level
        else if (selectedEvent.level) {
            console.log('No competition level set, trying to map from event level:', selectedEvent.level);
            // Try to map event level to competition level
            const competitionLevelsSnapshot = await firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('competition')
                .get();
            
            let foundLevel = false;
            competitionLevelsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.key === selectedEvent.level.toLowerCase() || 
                    data.nameEN?.toLowerCase() === selectedEvent.level.toLowerCase() ||
                    data.nameBM?.toLowerCase() === selectedEvent.level.toLowerCase()) {
                    levelDisplayName = data.nameEN || data.nameBM || selectedEvent.level;
                    foundLevel = true;
                    console.log('Mapped event level to competition level:', levelDisplayName);
                }
            });
            
            if (!foundLevel) {
                levelDisplayName = selectedEvent.level; // Fallback to event level
                console.log('No competition level mapping found, using event level as fallback:', levelDisplayName);
            }
        } else {
            console.log('No competition level or event level found');
        }
        
        competitionLevelElement.textContent = levelDisplayName;
        competitionLevelElement.className = 'badge bg-warning';
        console.log('Set competition level display to:', levelDisplayName);
        
    } catch (error) {
        console.error('Error displaying competition level:', error);
        competitionLevelElement.textContent = selectedEvent.competitionLevel || selectedEvent.level || 'Error';
        competitionLevelElement.className = 'badge bg-warning';
    }
}

async function displayMeritTypesHierarchical() {
    try {
        console.log('Loading merit types from hierarchical database...');
        
        // Load merit values from hierarchical structure
        const [committeeSnapshot, nonCommitteeSnapshot, competitionSnapshot] = await Promise.all([
            firestore.collection('meritValues').doc('roleMetadata').collection('committee').get(),
            firestore.collection('meritValues').doc('roleMetadata').collection('nonCommittee').get(),
            firestore.collection('meritValues').doc('roleMetadata').collection('competition').get()
        ]);
        
        const committeeRoles = {};
        const nonCommitteeRoles = {};
        const competitionRoles = {};
        
        // Process committee roles
        committeeSnapshot.forEach(doc => {
            const data = doc.data();
            committeeRoles[doc.id] = data;
        });
        
        // Process non-committee roles (participants)
        nonCommitteeSnapshot.forEach(doc => {
            const data = doc.data();
            nonCommitteeRoles[doc.id] = data;
        });
        
        // Process competition achievements
        competitionSnapshot.forEach(doc => {
            const data = doc.data();
            competitionRoles[doc.id] = data;
        });
        
        console.log('Loaded roles:', { 
            committee: Object.keys(committeeRoles).length,
            nonCommittee: Object.keys(nonCommitteeRoles).length,
            competition: Object.keys(competitionRoles).length
        });
        
        // Display merit types grid
        await displayMeritGrid(committeeRoles, nonCommitteeRoles, competitionRoles);
        
    } catch (error) {
        console.error('Error loading merit types:', error);
        // Fallback to showing basic message
        const meritValuesGrid = document.getElementById('meritValuesGrid');
        if (meritValuesGrid) {
            meritValuesGrid.innerHTML = '<div class="col-span-3 text-center text-secondary p-4">Error loading merit values</div>';
        }
    }
}

async function displayMeritGrid(committeeRoles, nonCommitteeRoles, competitionRoles) {
    const meritValuesGrid = document.getElementById('meritValuesGrid');
    if (!meritValuesGrid) return;
    
    const eventLevelId = await getEventLevelId();
    const competitionLevelId = await getCompetitionLevelId();
    
    console.log('Level IDs:', { eventLevelId, competitionLevelId });
    
    let gridHtml = '';
    
    // Committee Members
    gridHtml += `
        <div class="bg-white border border-gray-200 rounded-lg">
            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                <h4 class="font-semibold text-blue-800 p-4">Committee Members</h5>
            </div>
            <div class="p-4">`;
    
    if (Object.keys(committeeRoles).length > 0) {
        // Sort committee roles by sortOrder, then by name
        const sortedCommitteeRoles = Object.entries(committeeRoles)
            .sort(([,a], [,b]) => {
                const sortOrderA = a.sortOrder !== undefined ? a.sortOrder : 999;
                const sortOrderB = b.sortOrder !== undefined ? b.sortOrder : 999;
                if (sortOrderA !== sortOrderB) {
                    return sortOrderA - sortOrderB;
                }
                // Secondary sort by name
                const nameA = a.nameEN || a.nameBM || '';
                const nameB = b.nameEN || b.nameBM || '';
                return nameA.localeCompare(nameB);
            });
        
        sortedCommitteeRoles.forEach(([roleId, roleData]) => {
            const points = getMeritPointsForLevel(roleData, eventLevelId);
            gridHtml += `
                <div class="flex justify-between items-center py-1">
                    <span class="text-gray-700">${sanitizeHTML(roleData.nameEN || roleData.nameBM || roleId)}</span>
                    <span class="text-gray-600 font-medium">${points} pts</span>
                </div>`;
        });
    } else {
        gridHtml += '<div class="text-gray-500 text-sm">No committee roles available</div>';
    }
    
    gridHtml += `
            </div>
        </div>`;
    
    // Non-Committee (Participants + Competition)
    gridHtml += `
        <div class="bg-white border border-gray-200 rounded-lg">
            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                <h4 class="font-semibold text-blue-800 p-4">Participants</h5>
            </div>
            <div class="p-4">`;
    
    // Participant Roles subsection
    if (Object.keys(nonCommitteeRoles).length > 0) {
        gridHtml += `
                <div class="mb-4">
                    <h6 class="text-sm font-medium text-gray-600 mb-2 border-b pb-1">Participant Roles</h6>`;
                    
        
        // Sort non-committee roles by sortOrder, then by name
        const sortedNonCommitteeRoles = Object.entries(nonCommitteeRoles)
            .sort(([,a], [,b]) => {
                const sortOrderA = a.sortOrder !== undefined ? a.sortOrder : 999;
                const sortOrderB = b.sortOrder !== undefined ? b.sortOrder : 999;
                if (sortOrderA !== sortOrderB) {
                    return sortOrderA - sortOrderB;
                }
                // Secondary sort by name
                const nameA = a.nameEN || a.nameBM || '';
                const nameB = b.nameEN || b.nameBM || '';
                return nameA.localeCompare(nameB);
            });
        
        sortedNonCommitteeRoles.forEach(([roleId, roleData]) => {
            const points = getMeritPointsForLevel(roleData, eventLevelId);
            gridHtml += `
                    <div class="flex justify-between items-center py-1">
                        <span class="text-gray-700">${sanitizeHTML(roleData.nameEN || roleData.nameBM || roleId)}</span>
                        <span class="text-gray-600 font-medium">${points} pts</span>
                    </div>`;
        });
        
        gridHtml += `
                </div>`;
    }
    
    // Competition Achievements subsection
    if (Object.keys(competitionRoles).length > 0) {
        // Filter and sort competition roles that have points for the current competition level
        const availableCompetitionRoles = Object.entries(competitionRoles)
            .filter(([roleId, roleData]) => {
                const points = getMeritPointsForLevel(roleData, competitionLevelId);
                return points > 0;
            })
            .sort(([,a], [,b]) => {
                const sortOrderA = a.sortOrder !== undefined ? a.sortOrder : 999;
                const sortOrderB = b.sortOrder !== undefined ? b.sortOrder : 999;
                if (sortOrderA !== sortOrderB) {
                    return sortOrderA - sortOrderB;
                }
                // Secondary sort by name
                const nameA = a.nameEN || a.nameBM || '';
                const nameB = b.nameEN || b.nameBM || '';
                return nameA.localeCompare(nameB);
            });
        
        if (availableCompetitionRoles.length > 0) {
            gridHtml += `
                <div class="mb-2">
                    <h6 class="text-sm font-medium text-gray-600 mb-2 border-b pb-1">Competition Achievements</h6>`;
            
            availableCompetitionRoles.forEach(([roleId, roleData]) => {
                const points = getMeritPointsForLevel(roleData, competitionLevelId);
                gridHtml += `
                    <div class="flex justify-between items-center py-1">
                        <span class="text-gray-700">${sanitizeHTML(roleData.nameEN || roleData.nameBM || roleId)}</span>
                        <span class="text-gray-600 font-medium">${points} pts</span>
                    </div>`;
            });
            
            gridHtml += `
                </div>`;
        }
    }
    
    // Show message if no participant roles or competition achievements
    if (Object.keys(nonCommitteeRoles).length === 0 && Object.keys(competitionRoles).length === 0) {
        gridHtml += '<div class="text-gray-500 text-sm">No participant roles or competition achievements available</div>';
    }
    
    gridHtml += `
            </div>
        </div>`;
    
    // Custom Roles
    gridHtml += `
        <div class="bg-white border border-gray-200 rounded-lg">
            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                <h4 class="font-semibold text-blue-800 p-4">Custom Roles</h5>
            </div>
            <div class="p-4">`;
    
    // Check for custom roles in the selected event
    if (selectedEvent && selectedEvent.customRoles && selectedEvent.customRoles.length > 0) {
        // Sort custom roles by name or order if available
        const sortedCustomRoles = selectedEvent.customRoles.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            const nameA = a.name || '';
            const nameB = b.name || '';
            return nameA.localeCompare(nameB);
        });
        
        sortedCustomRoles.forEach(customRole => {
            gridHtml += `
                <div class="flex justify-between items-center py-1">
                    <span class="text-gray-700">${sanitizeHTML(customRole.name)}</span>
                    <span class="text-gray-600 font-medium">${customRole.value} pts</span>
                </div>`;
        });
    } else {
        gridHtml += '<div class="text-gray-500 text-sm">No custom roles for this event</div>';
    }
    
    gridHtml += `
            </div>
        </div>`;
    
    meritValuesGrid.innerHTML = gridHtml;
}

// Helper function to get event level ID
async function getEventLevelId() {
    if (selectedEvent.levelId) {
        return selectedEvent.levelId;
    }
    
    // Otherwise, try to map the old level name to a level ID from the database
    const levelName = selectedEvent.level;
    if (!levelName) {
        console.warn('No level information found for event');
        return null;
    }
    
    try {
        // Load level metadata to get proper ID mapping
        const eventLevelsSnapshot = await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection('event')
            .get();
        
        // Check event levels
        let levelId = null;
        eventLevelsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.key === levelName.toLowerCase() || 
                data.nameEN?.toLowerCase() === levelName.toLowerCase() ||
                data.nameBM?.toLowerCase() === levelName.toLowerCase()) {
                levelId = doc.id;
            }
        });
        
        return levelId;
        
    } catch (error) {
        console.error('Error loading level metadata:', error);
        
        // Fallback to basic mapping if database call fails
        const levelNameToIdMap = {
            'college': 'level_college',
            'block': 'level_block', 
            'university': 'level_university',
            'national': 'level_national',
            'international': 'level_international'
        };
        
        return levelNameToIdMap[levelName.toLowerCase()] || null;
    }
}

// Helper function to get competition level ID
async function getCompetitionLevelId() {
    if (selectedEvent.competitionLevelId) {
        return selectedEvent.competitionLevelId;
    }
    
    // If no specific competition level, try to map from event level
    const eventLevelId = await getEventLevelId();
    if (!eventLevelId) {
        return null;
    }
    
    try {
        // Load competition level metadata
        const competitionLevelsSnapshot = await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection('competition')
            .get();
        
        let levelId = null;
        const eventLevelName = selectedEvent.level;
        
        if (eventLevelName) {
            competitionLevelsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.key === eventLevelName.toLowerCase() || 
                    data.nameEN?.toLowerCase() === eventLevelName.toLowerCase() ||
                    data.nameBM?.toLowerCase() === eventLevelName.toLowerCase()) {
                    levelId = doc.id;
                }
            });
        }
        
        return levelId;
        
    } catch (error) {
        console.error('Error loading competition level metadata:', error);
        return null;
    }
}

// Helper function to get merit points for a specific level
function getMeritPointsForLevel(roleData, levelId) {
    if (!roleData || !levelId) {
        return 0;
    }
    
    // Return the merit points for the specific level
    return roleData.levelValues?.[levelId] || 0;
}

async function loadParentEventName(parentEventId) {
    try {
        const parentEventDoc = await firestore.collection('events').doc(parentEventId).get();
        const parentEventNameElement = document.getElementById('parentEventName');
        
        if (parentEventDoc.exists && parentEventNameElement) {
            const parentEventData = parentEventDoc.data();
            parentEventNameElement.textContent = parentEventData.name || 'Unknown Event';
        } else if (parentEventNameElement) {
            parentEventNameElement.textContent = 'Event not found';
        }
    } catch (error) {
        console.error('Error loading parent event name:', error);
        const parentEventNameElement = document.getElementById('parentEventName');
        if (parentEventNameElement) {
            parentEventNameElement.textContent = 'Error loading';
        }
    }
}

function handleMeritTypeChange() {
    const meritType = document.getElementById('meritType').value;
    const customGroup = document.getElementById('customMeritTypeGroup');
    const nextBtn = document.getElementById('nextFromStep2');
    
    if (meritType === 'custom') {
        customGroup.classList.remove('d-none');
    } else {
        customGroup.classList.add('d-none');
    }
    
    // Enable/disable next button
    if (nextBtn) {
        nextBtn.disabled = !meritType;
    }
    
    // Update role definition section visibility on step 5
    updateRoleDefinitionVisibility();
    
    // Save progress
    saveProgressToStorage();
}

function updateRoleDefinitionVisibility() {
    // Role assignment is now handled in Step 6, so this function is simplified
    // The role column is always available for reference
}

function handleOverrideToggle() {
    const override = document.getElementById('overrideMeritValue').checked;
    const customValueGroup = document.getElementById('customMeritValueGroup');
    
    if (override) {
        customValueGroup.classList.remove('d-none');
    } else {
        customValueGroup.classList.add('d-none');
    }
    
    // Save progress
    saveProgressToStorage();
}

function handleFileSelect() {
    const fileInput = document.getElementById('excelFile');
    const nextBtn = document.getElementById('nextFromStep3');
    
    if (nextBtn) {
        nextBtn.disabled = !fileInput.files[0];
    }
    
    // Show file display if file selected
    if (fileInput.files && fileInput.files.length > 0) {
        updateFileDisplay(fileInput.files[0].name, false);
        
        // Clear any existing restore info since user selected a new file
        const existingInfo = fileInput.parentNode?.querySelector('.file-restore-info');
        if (existingInfo) {
            existingInfo.remove();
        }
    }
    
    // Save progress
    saveProgressToStorage();
}

async function handleFileUploadNext() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Parse file to get sheet information
        const result = await parseExcelFile(file);
        
        // Store workbook globally for later use
        if (result.workbook) {
            window.currentWorkbook = result.workbook;
        }
        
        // Check if single or multiple sheets
        if (result.sheetNames && result.sheetNames.length > 1) {
            // Multiple sheets - populate sheet selector
            setupMultipleSheetSelection(result.sheetNames);
        } else {
            // Single sheet - get filtered row count immediately
            const sheetName = result.sheetNames ? result.sheetNames[0] : 'Sheet1';
            
            let filteredRowCount = 0;
            try {
                if (window.currentWorkbook && window.currentWorkbook.Sheets[sheetName]) {
                    const sheet = window.currentWorkbook.Sheets[sheetName];
                    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    
                    // Apply the same filtering logic as Step 5
                    if (sheetData && Array.isArray(sheetData)) {
                        // Use the filterEmptyRows function if available, otherwise manual filtering
                        if (typeof filterEmptyRows === 'function') {
                            const filteredData = filterEmptyRows(sheetData);
                            filteredRowCount = filteredData.length;
                        } else {
                            // Manual filtering (same logic as filterEmptyRows)
                            const filteredData = [];
                            for (let i = 0; i < sheetData.length; i++) {
                                if (i === 0) {
                                    // Always keep the header row
                                    filteredData.push(sheetData[i]);
                                } else {
                                    // For data rows, only keep non-empty rows
                                    const row = sheetData[i];
                                    if (row && Array.isArray(row)) {
                                        const hasData = row.some(cell => {
                                            if (cell === null || cell === undefined) return false;
                                            if (typeof cell === 'string') return cell.trim() !== '';
                                            if (typeof cell === 'number') return true;
                                            return String(cell).trim() !== '';
                                        });
                                        if (hasData) {
                                            filteredData.push(row);
                                        }
                                    }
                                }
                            }
                            filteredRowCount = filteredData.length;
                        }
                    }
                }
            } catch (e) {
                console.warn('Error calculating filtered row count for Step 4:', e);
                filteredRowCount = result.length || 0; // Fallback
            }
            
            setupSingleSheetSelection(sheetName, filteredRowCount);
        }
        
        hideLoading();
        goToStep(4);
        
    } catch (error) {
        hideLoading();
        console.error('Error processing file:', error);
        showToast('Error reading Excel file: ' + error.message, 'error');
    }
}

function setupSingleSheetSelection(sheetName, rowCount) {
    // Show single sheet info
    const singleSheetInfo = document.getElementById('singleSheetInfo');
    const multipleSheetSelection = document.getElementById('multipleSheetSelection');
    const nextBtn = document.getElementById('nextFromStep4');
    
    if (singleSheetInfo) {
        singleSheetInfo.classList.remove('d-none');
        
        // Update sheet information
        const singleSheetNameElement = document.getElementById('singleSheetName');
        const singleSheetNameDisplay = document.getElementById('singleSheetNameDisplay');
        const singleSheetRows = document.getElementById('singleSheetRows');
        
        if (singleSheetNameElement) singleSheetNameElement.textContent = sheetName;
        if (singleSheetNameDisplay) singleSheetNameDisplay.textContent = sheetName;
        if (singleSheetRows) singleSheetRows.textContent = rowCount;
        
        // Store selected sheet for processing
        window.selectedSheet = sheetName;
    }
    
    if (multipleSheetSelection) {
        multipleSheetSelection.classList.add('d-none');
    }
    
    // Enable next button
    if (nextBtn) {
        nextBtn.disabled = false;
    }
}

function setupMultipleSheetSelection(sheetNames) {
    // Show multiple sheet selection
    const singleSheetInfo = document.getElementById('singleSheetInfo');
    const multipleSheetSelection = document.getElementById('multipleSheetSelection');
    const sheetCountElement = document.getElementById('sheetCount');
    const nextBtn = document.getElementById('nextFromStep4');
    
    if (singleSheetInfo) {
        singleSheetInfo.classList.add('d-none');
    }
    
    if (multipleSheetSelection) {
        multipleSheetSelection.classList.remove('d-none');
        
        if (sheetCountElement) {
            sheetCountElement.textContent = sheetNames.length;
        }
        
        // Populate sheet selector
        populateSheetSelector(sheetNames);
        
        // Set up sheet selection change handler
        const sheetSelect = document.getElementById('sheetSelect');
        if (sheetSelect) {
            sheetSelect.onchange = function() {
                const selectedSheet = this.value;
                const previewInfo = document.getElementById('sheetPreviewInfo');
                
                if (selectedSheet) {
                    // Show preview info
                    if (previewInfo) {
                        previewInfo.classList.remove('d-none');
                        
                                // Get filtered row count for selected sheet
                        try {
                            if (window.currentWorkbook && window.currentWorkbook.Sheets[selectedSheet]) {
                                const sheet = window.currentWorkbook.Sheets[selectedSheet];
                                const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                                
                                // Apply filtering to get accurate count
                                let rowCount = 0;
                                if (sheetData && Array.isArray(sheetData)) {
                                    if (typeof filterEmptyRows === 'function') {
                                        const filteredData = filterEmptyRows(sheetData);
                                        rowCount = filteredData.length;
                                    } else {
                                        // Manual filtering
                                        const filteredData = [];
                                        for (let i = 0; i < sheetData.length; i++) {
                                            if (i === 0) {
                                                filteredData.push(sheetData[i]);
                                            } else {
                                                const row = sheetData[i];
                                                if (row && Array.isArray(row)) {
                                                    const hasData = row.some(cell => {
                                                        if (cell === null || cell === undefined) return false;
                                                        if (typeof cell === 'string') return cell.trim() !== '';
                                                        if (typeof cell === 'number') return true;
                                                        return String(cell).trim() !== '';
                                                    });
                                                    if (hasData) {
                                                        filteredData.push(row);
                                                    }
                                                }
                                            }
                                        }
                                        rowCount = filteredData.length;
                                    }
                                } else {
                                    rowCount = sheetData ? sheetData.length : 0;
                                }                                document.getElementById('selectedSheetName').textContent = selectedSheet;
                                document.getElementById('selectedSheetRows').textContent = rowCount;
                            }
                        } catch (e) {
                            console.warn('Error getting sheet preview:', e);
                            // Fallback to showing sheet name without row count
                            document.getElementById('selectedSheetName').textContent = selectedSheet;
                            document.getElementById('selectedSheetRows').textContent = 'N/A';
                        }
                    }
                    
                    // Enable next button
                    if (nextBtn) {
                        nextBtn.disabled = false;
                    }
                    
                    // Store selected sheet
                    window.selectedSheet = selectedSheet;
                } else {
                    // Hide preview and disable next button
                    if (previewInfo) {
                        previewInfo.classList.add('d-none');
                    }
                    if (nextBtn) {
                        nextBtn.disabled = true;
                    }
                    window.selectedSheet = null;
                }
            };
        }
    }
    
    // Initially disable next button until sheet is selected
    if (nextBtn) {
        nextBtn.disabled = true;
    }
}

function handleSheetSelectionNext() {
    if (!window.selectedSheet) {
        showToast('Please select a sheet to process', 'warning');
        return;
    }
    
    // Process the file data immediately and go to column mapping
    processFileData();
}

async function processFileData() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file first', 'error');
        return;
    }
    
    if (!window.selectedSheet) {
        showToast('Please select a sheet first', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Parse the selected sheet
        excelData = await parseExcelFile(file, window.selectedSheet);
        
        if (excelData.length < 2) {
            throw new Error('Excel file must have headers and at least one data row');
        }
        
        // Process dates in the data (convert Excel date serial numbers)
        excelData = excelData.map(row => 
            row.map(cell => {
                // Handle Excel date serial numbers more carefully
                if (typeof cell === 'number' && cell > 25567 && cell < 100000) {
                    try {
                        // Likely an Excel date serial number
                        return excelDateToJSDate(cell);
                    } catch (error) {
                        return cell; // Return original value if conversion fails
                    }
                }
                return cell;
            })
        );
        
        // Filter out empty rows (keep header + non-empty data rows only)
        const originalRowCount = excelData.length;
        excelData = filterEmptyRows(excelData);
        const filteredRowCount = excelData.length;
        
        console.log(`Filtered out ${originalRowCount - filteredRowCount} empty rows. Remaining: ${filteredRowCount} rows (including header)`);
        
        if (excelData.length < 2) {
            throw new Error('No valid data rows found after filtering empty rows');
        }
        
        // Get column headers
        columnHeaders = excelData[0].map((header, index) => ({
            index: index,
            name: header || `Column ${index + 1}`
        }));
        
        // Populate column mapping dropdowns
        populateColumnMappingDropdowns();
        
        // Role selection now handled in Step 6
        
        // Display file preview
        displayFilePreview();
        
        // Update role definition visibility based on current merit type
        updateRoleDefinitionVisibility();
        
        // Show success message with sheet info
        const dataRows = excelData.length - 1; // Subtract header row
        showToast(`Successfully loaded "${window.selectedSheet}" with ${dataRows} data ${dataRows === 1 ? 'row' : 'rows'}`, 'success');
        
        goToStep(5); // Go directly to column mapping (new step 5)
        
    } catch (error) {
        console.error('Error loading sheet:', error);
        showToast('Error loading sheet: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function processFile() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file first', 'error');
        return;
    }
    
    if (!window.selectedSheet) {
        showToast('Please select a sheet first', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Parse the selected sheet
        excelData = await parseExcelFile(file, window.selectedSheet);
        
        if (excelData.length < 2) {
            throw new Error('Excel file must have headers and at least one data row');
        }
        
        // Process dates in the data (convert Excel date serial numbers)
        excelData = excelData.map(row => 
            row.map(cell => {
                // Handle Excel date serial numbers more carefully
                if (typeof cell === 'number' && cell > 25567 && cell < 100000) {
                    try {
                        // Likely an Excel date serial number
                        return excelDateToJSDate(cell);
                    } catch (error) {
                        return cell; // Return original value if conversion fails
                    }
                }
                return cell;
            })
        );
        
        // Filter out empty rows (keep header + non-empty data rows only)
        const originalRowCount = excelData.length;
        excelData = filterEmptyRows(excelData);
        const filteredRowCount = excelData.length;
        
        console.log(`Filtered out ${originalRowCount - filteredRowCount} empty rows. Remaining: ${filteredRowCount} rows (including header)`);
        
        if (excelData.length < 2) {
            throw new Error('No valid data rows found after filtering empty rows');
        }
        
        // Get column headers
        columnHeaders = excelData[0].map((header, index) => ({
            index: index,
            name: header || `Column ${index + 1}`
        }));
        
        // Populate column mapping dropdowns
        populateColumnMappingDropdowns();
        
        // Role selection now handled in Step 6
        
        // Display file preview
        displayFilePreview();
        
        // Update role definition visibility based on current merit type
        updateRoleDefinitionVisibility();
        
        // Show success message with sheet info
        const dataRows = excelData.length - 1; // Subtract header row
        showToast(`Successfully loaded "${window.selectedSheet}" with ${dataRows} data ${dataRows === 1 ? 'row' : 'rows'}`, 'success');
        
        goToStep(5); // Go to column mapping (new step 5)
        
    } catch (error) {
        console.error('Error loading sheet:', error);
        showToast('Error loading sheet: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Populate sheet selector dropdown
function populateSheetSelector(sheetNames) {
    const sheetSelect = document.getElementById('sheetSelect');
    sheetSelect.innerHTML = '<option value="">Choose a sheet to process...</option>';
    
    let bestSheetIndex = 0; // Default to first sheet
    
    sheetNames.forEach((sheetName, index) => {
        const option = document.createElement('option');
        option.value = sheetName;
        
        // Try to get sheet row count if possible
        let displayName = sheetName;
        try {
            if (window.currentWorkbook && window.currentWorkbook.Sheets[sheetName]) {
                const sheet = window.currentWorkbook.Sheets[sheetName];
                const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                // Get filtered row count for dropdown
                let rowCount = 0;
                if (sheetData && Array.isArray(sheetData)) {
                    if (typeof filterEmptyRows === 'function') {
                        const filteredData = filterEmptyRows(sheetData);
                        rowCount = filteredData.length;
                    } else {
                        // Manual filtering
                        const filteredData = [];
                        for (let i = 0; i < sheetData.length; i++) {
                            if (i === 0) {
                                filteredData.push(sheetData[i]);
                            } else {
                                const row = sheetData[i];
                                if (row && Array.isArray(row)) {
                                    const hasData = row.some(cell => {
                                        if (cell === null || cell === undefined) return false;
                                        if (typeof cell === 'string') return cell.trim() !== '';
                                        if (typeof cell === 'number') return true;
                                        return String(cell).trim() !== '';
                                    });
                                    if (hasData) {
                                        filteredData.push(row);
                                    }
                                }
                            }
                        }
                        rowCount = filteredData.length;
                    }
                } else {
                    rowCount = sheetData ? sheetData.length : 0;
                }
                displayName = rowCount > 0 ? `${sheetName} (${rowCount} rows)` : sheetName;
            }
        } catch (e) {
            console.warn('Error getting sheet row count for', sheetName, ':', e);
            // Fallback to just sheet name
            displayName = sheetName;
        }
        
        option.textContent = displayName;
        
        // Auto-select sheets with common data names or the first non-empty sheet
        const lowerName = sheetName.toLowerCase();
        if (lowerName.includes('data') || 
            lowerName.includes('student') ||
            lowerName.includes('record') ||
            lowerName.includes('merit') ||
            lowerName.includes('main')) {
            bestSheetIndex = index;
        }
        
        sheetSelect.appendChild(option);
    });
    
    // Don't auto-select any sheet - let user choose
    // Keep default "Choose a sheet to process..." option selected
    
    // Add change handler for immediate feedback
    sheetSelect.onchange = function() {
        this.classList.remove('border-warning');
        if (this.value) {
            const processBtn = document.getElementById('processFileBtn');
            if (processBtn) {
                processBtn.disabled = false;
                processBtn.classList.remove('btn-secondary');
                processBtn.classList.add('btn-primary');
            }
        }
    };
    
    // Scroll to sheet selection and show helpful message
    setTimeout(() => {
        const sheetSection = document.getElementById('sheetSelectionSection');
        if (sheetSection) {
            sheetSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        showToast(`Found ${sheetNames.length} sheets. Please select which sheet contains your merit data.`, 'info');
    }, 100);
}

function populateColumnMappingDropdowns() {
    const dropdowns = ['nameColumnSelect', 'matricColumnSelect', 'roleColumnSelect', 'notesColumnSelect', 'proofLinkColumnSelect'];
    let autoDetectedCount = 0;
    
    dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        const isRequired = dropdownId.includes('name') || dropdownId.includes('matric');
        
        dropdown.innerHTML = `<option value="">Select column${isRequired ? ' (Required)' : ' (Optional)'}...</option>`;
        
        columnHeaders.forEach(header => {
            const option = document.createElement('option');
            option.value = header.index;
            option.textContent = header.name;
            dropdown.appendChild(option);
        });
        
        // Clear any existing auto-detection styling
        clearAutoDetectionStyling(dropdown);
        
        // Auto-detect common columns
        const wasAutoDetected = autoDetectColumn(dropdown, dropdownId);
        if (wasAutoDetected) {
            autoDetectedCount++;
        }
        
        // Add change event listener to clear auto-detection styling when manually changed
        dropdown.addEventListener('change', function() {
            if (this.style.borderColor) {
                clearAutoDetectionStyling(this);
            }
        });
    });
    
    // Show auto-detection summary
    showAutoDetectionSummary(autoDetectedCount, dropdowns.length);
}

function clearAutoDetectionStyling(dropdown) {
    dropdown.style.borderColor = '';
    dropdown.style.backgroundColor = '';
    
    const indicator = dropdown.parentElement.querySelector('.auto-detected-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function showAutoDetectionSummary(detectedCount, totalCount) {
    // Remove existing summary
    const existingSummary = document.querySelector('.auto-detect-summary');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    if (detectedCount > 0) {
        // Find the column mapping section
        const columnMappingSection = document.querySelector('.mb-6 h4');
        if (columnMappingSection && columnMappingSection.textContent.includes('Column Mapping')) {
            const summary = document.createElement('div');
            summary.className = 'auto-detect-summary';
            summary.innerHTML = `
                <div class="flex items-start gap-3">
                    <svg class="w-5 h-5 success-icon mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div>
                        <h5 class="font-medium text-success mb-1">Auto-Detection Results</h5>
                        <p class="text-sm text-secondary mb-0">
                            Successfully auto-detected ${detectedCount} out of ${totalCount} columns. 
                            ${detectedCount === totalCount ? 'All columns mapped automatically!' : 'Please verify and map any remaining columns manually.'}
                        </p>
                        ${detectedCount < totalCount ? '<p class="text-xs text-secondary mt-1"><em>Tip: Auto-detection works best with column headers in English or Bahasa Malaysia.</em></p>' : ''}
                    </div>
                </div>
            `;
            
            // Insert after the column mapping heading
            const columnMappingDiv = columnMappingSection.closest('.mb-6');
            const nextSibling = columnMappingDiv.nextElementSibling;
            if (nextSibling && nextSibling.classList.contains('grid')) {
                columnMappingDiv.insertBefore(summary, nextSibling);
            } else {
                columnMappingDiv.appendChild(summary);
            }
        }
    }
}

function autoDetectColumn(dropdown, dropdownId) {
    const detectionRules = {
        'nameColumnSelect': [
            // English variations
            'name', 'student name', 'full name', 'student full name', 'participant name',
            'first name', 'last name', 'full_name', 'student_name', 'participant_name',
            // Bahasa Malaysia variations
            'nama', 'nama pelajar', 'nama penuh', 'nama peserta', 'nama lengkap'
        ],
        'matricColumnSelect': [
            // English variations
            'matric', 'matric number', 'matric no', 'student id', 'student number', 
            'id', 'student_id', 'matric_number', 'matriculation number', 'registration number',
            'reg no', 'regno', 'student no', 'no', 'number', 'ic', 'nric', 'identity',
            // Common patterns with prefixes/suffixes
            'matric no.', 'matric_no', 'matric-no', 'student-id', 'student.id',
            // Bahasa Malaysia variations  
            'matriks', 'no matriks', 'nombor matriks', 'no matrik', 'matrik',
            'no pelajar', 'nombor pelajar', 'id pelajar', 'no peserta', 'nombor peserta',
            // Common BM abbreviations and variations
            'no. matriks', 'no.matriks', 'no_matriks', 'no-matriks', 'matriks no',
            'no. matrik', 'no.matrik', 'no_matrik', 'no-matrik', 'matrik no'
        ],
        'roleColumnSelect': [
            // English variations
            'role', 'position', 'committee', 'committee role', 'responsibility', 
            'designation', 'title', 'job title', 'function', 'duty', 'post',
            'committee position', 'rank', 'level', 'achievement', 'result', 'placing',
            'award', 'competition result', 'competition placing', 'prize',
            // Common committee abbreviations and roles
            'ajk', 'ahli', 'ketua', 'naib', 'setiausaha', 'bendahari', 'pengarah',
            'president', 'vice', 'secretary', 'treasurer', 'director', 'member',
            'chairman', 'chairperson', 'advisor', 'adviser', 'coordinator',
            // Competition terms
            '1st', '2nd', '3rd', 'first', 'second', 'third', 'winner', 'champion',
            'participant', 'participation', 'bronze', 'silver', 'gold', 'merit',
            // Bahasa Malaysia variations
            'jawatan', 'peranan', 'tanggungjawab', 'gelaran', 'pangkat', 'kedudukan',
            'ahli jawatankuasa', 'jawatan ajk', 'pencapaian', 'keputusan', 'hadiah',
            'keputusan pertandingan', 'kedudukan pertandingan', 'juara', 'tempat',
            // BM competition terms
            'pertama', 'kedua', 'ketiga', 'penyertaan', 'gangsa', 'perak', 'emas',
            'johan', 'naib johan', 'tempat ketiga', 'peserta', 'pemenang'
        ],
        'notesColumnSelect': [
            // English variations
            'notes', 'note', 'remarks', 'comments', 'additional notes', 'description',
            'details', 'information', 'memo', 'observation', 'comment', 'remark',
            'additional information', 'extra notes', 'misc', 'miscellaneous',
            // Bahasa Malaysia variations
            'catatan', 'nota', 'komen', 'ulasan', 'keterangan', 'maklumat tambahan',
            'butiran', 'penerangan', 'pemerhatian', 'tambahan', 'lain-lain'
        ],
        'proofLinkColumnSelect': [
            // English variations
            'proof', 'proof link', 'link', 'url', 'evidence', 'documentation',
            'certificate', 'cert', 'attachment', 'file', 'document', 'photo',
            'image', 'pic', 'picture', 'screenshot', 'scan', 'pdf', 'verification',
            'bukti', 'pautan bukti', 'sijil', 'gambar', 'foto', 'dokumen',
            // Bahasa Malaysia variations
            'bukti', 'pautan', 'pautan bukti', 'sijil', 'dokumentasi', 'lampiran',
            'fail', 'dokumen', 'gambar', 'foto', 'tangkapan skrin', 'imbasan',
            'pengesahan', 'verifikasi'
        ]
    };
    
    const rules = detectionRules[dropdownId];
    if (!rules) return;
    
    // Enhanced matching with priority scoring
    let bestMatch = null;
    let bestScore = 0;
    
    for (const header of columnHeaders) {
        const headerLower = header.name.toLowerCase().trim();
        
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            let score = 0;
            
            // Exact match gets highest priority
            if (headerLower === rule) {
                score = 1000 - i; // Earlier rules get higher priority
            }
            // Contains match gets medium priority
            else if (headerLower.includes(rule)) {
                score = 500 - i;
            }
            // Word boundary match gets slightly lower priority
            else if (new RegExp(`\\b${rule}\\b`).test(headerLower)) {
                score = 300 - i;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = header;
            }
        }
    }
    
    if (bestMatch) {
        dropdown.value = bestMatch.index;
        
        // Visual feedback for auto-detected columns
        dropdown.style.borderColor = '#10b981';
        dropdown.style.backgroundColor = '#f0fdf4';
        
        // Add a small indicator
        const existingIndicator = dropdown.parentElement.querySelector('.auto-detected-indicator');
        if (!existingIndicator) {
            const indicator = document.createElement('small');
            indicator.className = 'text-success auto-detected-indicator';
            indicator.innerHTML = '✓ Auto-detected';
            indicator.style.fontSize = '0.75rem';
            dropdown.parentElement.appendChild(indicator);
        }
        
        return true; // Successfully auto-detected
    }
    
    return false; // No match found
}

function populateRoleSelectionDropdown() {
    const roleSelect = document.getElementById('singleRoleSelect');
    const meritType = document.getElementById('meritType').value;
    
    roleSelect.innerHTML = '<option value="">Select...</option>';
    
    if (!meritValues || !selectedEvent) return;
    
    // Handle both new levelId format and legacy level format
    let levelId = selectedEvent.levelId || selectedEvent.level;
    if (levelId && !levelId.startsWith('level_') && !levelId.startsWith('comp_')) {
        levelId = getLevelIdByName(levelId);
    }
    
    if (meritType === 'committee') {
        // Add committee roles from the separate committeeRoles collection
        if (meritValues.committeeRoles) {
            Object.keys(meritValues.committeeRoles).forEach(role => {
                const option = document.createElement('option');
                option.value = role;
                option.textContent = `${role} (${meritValues.committeeRoles[role][levelId] || 0} points)`;
                roleSelect.appendChild(option);
            });
        }
    } else if (meritType === 'competition') {
        // Add competition results/achievements
        if (meritValues.achievements) {
            Object.keys(meritValues.achievements).forEach(achievement => {
                const option = document.createElement('option');
                option.value = achievement;
                option.textContent = `${achievement} (${meritValues.achievements[achievement][levelId] || 0} points)`;
                roleSelect.appendChild(option);
            });
        }
    }
    
    // Add custom roles if available
    if (selectedEvent.customRoles && selectedEvent.customRoles.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '--- Custom Roles ---';
        roleSelect.appendChild(separator);
        
        selectedEvent.customRoles.forEach(customRole => {
            const option = document.createElement('option');
            option.value = `custom:${customRole.name}`;
            option.textContent = `${customRole.name} (${customRole.value} points)`;
            roleSelect.appendChild(option);
        });
    }
}

// Helper function to check if a row is empty or contains only whitespace
function isRowEmpty(row) {
    if (!row || !Array.isArray(row)) return true;
    
    return row.every(cell => {
        if (cell === null || cell === undefined) return true;
        if (typeof cell === 'string') return cell.trim() === '';
        if (typeof cell === 'number') return false; // Numbers are considered valid data
        return String(cell).trim() === '';
    });
}

// Helper function to filter out empty rows from Excel data
function filterEmptyRows(data) {
    if (!data || !Array.isArray(data)) return data;
    
    // Keep the first row (header) regardless, then filter out empty rows
    const filteredData = [];
    
    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            // Always keep the header row (first row)
            filteredData.push(data[i]);
        } else {
            // For data rows, only keep non-empty rows
            if (!isRowEmpty(data[i])) {
                filteredData.push(data[i]);
            }
        }
    }
    
    return filteredData;
}

function displayFilePreview() {
    const head = document.getElementById('mappingPreviewHead');
    const body = document.getElementById('mappingPreviewBody');
    
    // Clear existing content
    head.innerHTML = '';
    body.innerHTML = '';
    
    if (!excelData || excelData.length < 1) return;
    
    // Find the maximum number of columns across all rows
    const maxColumns = Math.max(...excelData.map(row => row ? row.length : 0));
    
    // Ensure all rows have the same number of columns by padding with empty cells
    const normalizedData = excelData.map(row => {
        const normalizedRow = [...(row || [])];
        while (normalizedRow.length < maxColumns) {
            normalizedRow.push('');
        }
        return normalizedRow;
    });
    
    // Show all data rows (including header row) in the body, no separate header
    normalizedData.forEach((rowData, rowIndex) => {
        const row = document.createElement('tr');
        row.setAttribute('data-row-index', rowIndex);
        
        // Add delete action column (first column)
        const actionTd = document.createElement('td');
        actionTd.style.textAlign = 'center';
        actionTd.style.verticalAlign = 'middle';
        actionTd.style.width = '60px';
        actionTd.style.minWidth = '60px';
        
        if (rowIndex === 0) {
            // First row - header delete button
            actionTd.innerHTML = `
                <button class="btn btn-sm btn-outline-danger" onclick="deleteExcelRow(${rowIndex})" title="Delete this header row (next row becomes header)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            `;
            actionTd.style.backgroundColor = '#f8f9fa';
            actionTd.style.borderBottom = '2px solid #dee2e6';
        } else {
            // Data rows - delete button
            actionTd.innerHTML = `
                <button class="btn btn-sm btn-outline-danger" onclick="deleteExcelRow(${rowIndex})" title="Delete this row">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            `;
        }
        row.appendChild(actionTd);
        
        // Add row number column (second column)
        const rowNumberTd = document.createElement('td');
        rowNumberTd.style.textAlign = 'center';
        rowNumberTd.style.verticalAlign = 'middle';
        rowNumberTd.style.width = '60px';
        rowNumberTd.style.minWidth = '60px';
        rowNumberTd.style.fontWeight = '500';
        
        if (rowIndex === 0) {
            // First row - mark as Header
            rowNumberTd.innerHTML = `<small class="text-primary fw-bold">Header</small>`;
            rowNumberTd.style.backgroundColor = '#f8f9fa';
            rowNumberTd.style.borderBottom = '2px solid #dee2e6';
        } else {
            // Data rows - show row number
            rowNumberTd.innerHTML = `<small class="text-secondary">${rowIndex}</small>`;
        }
        row.appendChild(rowNumberTd);
        
        // Add data cells - don't truncate the content
        rowData.forEach((cell, cellIndex) => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            td.style.padding = '8px 12px';
            td.style.wordWrap = 'break-word';
            td.style.minWidth = '120px'; // Ensure columns are wide enough
            
            // Special styling for header row
            if (rowIndex === 0) {
                td.style.fontWeight = 'bold';
                td.style.backgroundColor = '#f8f9fa';
                td.style.borderBottom = '2px solid #dee2e6';
            }
            
            row.appendChild(td);
        });
        
        // Special styling for header row
        if (rowIndex === 0) {
            row.style.backgroundColor = '#f8f9fa';
        }
        
        body.appendChild(row);
    });
    
    // Add summary info
    const summaryRow = document.createElement('tr');
    const summaryCell = document.createElement('td');
    summaryCell.colSpan = maxColumns + 2; // +2 for row number and action columns
    summaryCell.innerHTML = `<em class="text-info">Showing: ${excelData.length} rows with data (empty rows filtered out)</em>`;
    summaryCell.style.textAlign = 'center';
    summaryCell.style.padding = '10px';
    summaryCell.style.backgroundColor = '#f8f9fa';
    summaryCell.style.borderTop = '2px solid #dee2e6';
    summaryRow.appendChild(summaryCell);
    body.appendChild(summaryRow);
    
    // Update header column count display
    updateColumnMappingOptions();
}

function deleteExcelRow(rowIndex) {
    if (!excelData || rowIndex < 0 || rowIndex >= excelData.length) return;
    
    // Remove the row from excelData
    excelData.splice(rowIndex, 1);
    
    // Refresh the preview
    displayFilePreview();
    
    // Show success message
    if (rowIndex === 0 && excelData.length > 0) {
        showToast(`Header row deleted successfully. Row 1 is now the new header.`, 'success');
    } else if (excelData.length === 0) {
        showToast(`All data deleted. Please upload a new file.`, 'warning');
    } else {
        showToast(`Row ${rowIndex} deleted successfully`, 'success');
    }
}

function updateColumnMappingOptions() {
    // Repopulate column mapping dropdowns with updated headers
    if (excelData && excelData.length > 0) {
        // Rebuild columnHeaders array with proper structure
        columnHeaders = excelData[0].map((header, index) => ({
            index: index,
            name: header || `Column ${index + 1}`
        }));
        populateColumnMappingDropdowns();
    }
}

function displayRoleAssignment() {
    const tableBody = document.getElementById('roleMappingTableBody');
    const recordCount = document.getElementById('recordCount');
    
    // Update record count
    recordCount.textContent = `${processedData.length} records to assign roles`;
    
    // Get available roles based on merit type
    const availableRoles = getAvailableRoles();
    
    // Auto-map roles before displaying
    autoMapRoles(availableRoles);
    
    tableBody.innerHTML = processedData.map((record, index) => {
        const statusClass = record.assignedRole ? 'text-success' : 'text-warning';
        const statusIcon = record.assignedRole ? '✓' : '⚠';
        const points = record.assignedRole ? calculateMeritPointsForUpload(record.assignedRole, selectedEvent.level, record.additionalNotes, meritValues, selectedEvent) : 0;
        
        // Check if this was auto-mapped
        const wasAutoMapped = record.autoMapped;
        const autoMappedClass = wasAutoMapped ? 'auto-mapped-role' : '';
        const autoMappedIndicator = wasAutoMapped ? '<small class="text-success auto-mapped-indicator">✓ Auto-mapped</small>' : '';
        
        return `
            <tr data-record-index="${index}">
                <td class="text-center">${index + 1}</td>
                <td>${sanitizeHTML(record.name)}</td>
                <td>${sanitizeHTML(record.matricNumber)}</td>
                <td class="text-muted">${sanitizeHTML(record.originalRole || 'Not specified')}</td>
                <td>
                    <div class="role-search-container position-relative">
                        <input type="text" 
                               class="form-control role-search-input ${autoMappedClass}" 
                               id="roleInput_${index}"
                               placeholder="Type to search roles..." 
                               value="${sanitizeHTML(record.assignedRole)}"
                               data-record-index="${index}"
                               autocomplete="off">
                        <div class="role-suggestions d-none position-absolute bg-white border rounded shadow-sm w-100" 
                             id="roleSuggestions_${index}" 
                             style="top: 100%; z-index: 1000; max-height: 200px; overflow-y: auto;">
                        </div>
                        ${autoMappedIndicator}
                    </div>
                </td>
                <td class="text-center" id="points_${index}">${points}</td>
                <td class="text-center ${statusClass}" id="status_${index}">${statusIcon}</td>
            </tr>
        `;
    }).join('');
    
    // Add event listeners for role search inputs
    processedData.forEach((record, index) => {
        setupRoleSearchInput(index, availableRoles);
    });
    
    // Show auto-mapping summary
    showAutoMappingSummary();
    
    // Update unassigned count
    updateUnassignedCount();
}

function updateUnassignedCount() {
    const unassignedCount = processedData.filter(record => !record.assignedRole).length;
    const unassignedCountElement = document.getElementById('unassignedCount');
    const assignBtn = document.getElementById('assignGeneralCommitteeBtn');
    
    if (unassignedCountElement) {
        if (unassignedCount > 0) {
            unassignedCountElement.textContent = `${unassignedCount} unassigned roles`;
            unassignedCountElement.className = 'text-sm text-warning self-center';
        } else {
            unassignedCountElement.textContent = 'All roles assigned';
            unassignedCountElement.className = 'text-sm text-success self-center';
        }
    }
    
    if (assignBtn) {
        assignBtn.disabled = unassignedCount === 0;
        if (unassignedCount === 0) {
            assignBtn.classList.add('disabled');
        } else {
            assignBtn.classList.remove('disabled');
        }
    }
}

function assignGeneralCommitteeToUnassigned() {
    const availableRoles = getAvailableRoles();
    
    // Find "General Committee" role or similar
    const generalCommitteeRole = availableRoles.find(role => 
        role.toLowerCase().includes('general committee') ||
        role.toLowerCase().includes('committee member') ||
        role.toLowerCase().includes('ahli jawatankuasa')
    );
    
    if (!generalCommitteeRole) {
        showToast('No "General Committee" or similar role found in available roles', 'error');
        return;
    }
    
    let assignedCount = 0;
    
    processedData.forEach(record => {
        if (!record.assignedRole) {
            record.assignedRole = generalCommitteeRole;
            record.autoMapped = false; // Mark as manually assigned
            record.meritPoints = calculateMeritPointsForUpload(generalCommitteeRole, selectedEvent.level, record.additionalNotes, meritValues, selectedEvent);
            assignedCount++;
        }
    });
    
    if (assignedCount > 0) {
        showToast(`Successfully assigned "${generalCommitteeRole}" to ${assignedCount} unassigned roles`, 'success');
        
        // Refresh the display
        displayRoleAssignment();
    } else {
        showToast('No unassigned roles found', 'info');
    }
}

function getAvailableRoles() {
    const meritType = document.getElementById('meritType').value;
    let roles = [];
    
    if (meritType === 'committee' && meritValues.committeeRoles) {
        roles = Object.keys(meritValues.committeeRoles);
    } else if (meritType === 'competition' && meritValues.achievements) {
        roles = Object.keys(meritValues.achievements);
    } else if (meritType && meritType !== 'custom' && meritType !== 'committee' && meritType !== 'competition') {
        // Individual role
        roles = [meritType];
    } else if (meritValues.roles) {
        // All non-committee roles
        roles = Object.keys(meritValues.roles);
    }
    
    // Add custom roles from event
    if (selectedEvent && selectedEvent.customRoles) {
        selectedEvent.customRoles.forEach(customRole => {
            roles.push(customRole.name);
        });
    }
    
    return roles.sort();
}

function setupRoleSearchInput(recordIndex, availableRoles) {
    const input = document.getElementById(`roleInput_${recordIndex}`);
    const suggestions = document.getElementById(`roleSuggestions_${recordIndex}`);
    
    if (!input || !suggestions) return;
    
    // Handle input changes
    input.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        
        if (query.length === 0) {
            suggestions.classList.add('d-none');
            return;
        }
        
        // Filter roles based on input
        const filtered = availableRoles.filter(role => 
            role.toLowerCase().includes(query)
        );
        
        if (filtered.length > 0) {
            suggestions.innerHTML = filtered.map(role => `
                <div class="role-suggestion p-2 border-bottom cursor-pointer hover:bg-light" 
                     data-role="${sanitizeHTML(role)}"
                     data-record-index="${recordIndex}">
                    ${sanitizeHTML(role)}
                </div>
            `).join('');
            suggestions.classList.remove('d-none');
            
            // Add click handlers for suggestions
            suggestions.querySelectorAll('.role-suggestion').forEach(suggestion => {
                suggestion.addEventListener('click', function() {
                    selectRole(recordIndex, this.dataset.role);
                });
            });
        } else {
            suggestions.classList.add('d-none');
        }
    });
    
    // Handle focus and blur
    input.addEventListener('focus', function() {
        if (this.value.length > 0) {
            this.dispatchEvent(new Event('input'));
        }
    });
    
    input.addEventListener('blur', function() {
        // Delay hiding to allow for clicks
        setTimeout(() => {
            suggestions.classList.add('d-none');
        }, 200);
    });
    
    // Handle enter key
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const firstSuggestion = suggestions.querySelector('.role-suggestion');
            if (firstSuggestion) {
                selectRole(recordIndex, firstSuggestion.dataset.role);
            }
        }
    });
}

function selectRole(recordIndex, role) {
    const input = document.getElementById(`roleInput_${recordIndex}`);
    const suggestions = document.getElementById(`roleSuggestions_${recordIndex}`);
    const pointsCell = document.getElementById(`points_${recordIndex}`);
    const statusCell = document.getElementById(`status_${recordIndex}`);
    
    // Update input value
    input.value = role;
    suggestions.classList.add('d-none');
    
    // Clear auto-mapped styling if user manually changes
    if (processedData[recordIndex].autoMapped) {
        input.classList.remove('auto-mapped-role');
        const autoIndicator = input.parentElement.querySelector('.auto-mapped-indicator');
        if (autoIndicator) {
            autoIndicator.remove();
        }
        processedData[recordIndex].autoMapped = false;
    }
    
    // Update record
    processedData[recordIndex].assignedRole = role;
    
    // Calculate and display merit points
    const points = calculateMeritPointsForUpload(role, selectedEvent.level, processedData[recordIndex].additionalNotes, meritValues, selectedEvent);
    processedData[recordIndex].meritPoints = points;
    pointsCell.textContent = points;
    
    // Update status
    statusCell.innerHTML = '✓';
    statusCell.className = 'text-center text-success';
    
    // Update unassigned count
    updateUnassignedCount();
}

function validateRoleAssignments() {
    const unassignedRecords = processedData.filter(record => !record.assignedRole);
    
    if (unassignedRecords.length > 0) {
        showToast(`Please assign roles to all ${unassignedRecords.length} remaining students`, 'warning');
        hideLoading();
        return false;
    }
    
    return true;
}

function autoMapRoles(availableRoles) {
    let autoMappedCount = 0;
    
    console.log('=== AUTO-MAPPING DEBUG ===');
    console.log('Available roles:', availableRoles);
    console.log('Records to process:', processedData.length);
    
    // Dynamic role matching using fuzzy search
    function calculateFuzzyScore(inputRole, dbRole, dbRoleData) {
        const input = inputRole.toLowerCase().trim();
        const dbNameEN = (dbRoleData.nameEN || '').toLowerCase().trim();
        const dbNameBM = (dbRoleData.nameBM || '').toLowerCase().trim();
        const keywords = (dbRoleData.keywords || []).map(k => k.toLowerCase().trim());
        const alternateNames = (dbRoleData.alternateNames || []).map(k => k.toLowerCase().trim());
        
        let maxScore = 0;
        
        // Direct exact matches get highest score
        if (input === dbNameEN || input === dbNameBM) {
            return 1000;
        }
        
        // Check exact matches with keywords and alternate names (database keywords get priority)
        if (keywords.includes(input)) {
            console.log(`  🎯 Exact keyword match: "${input}"`);
            return 950; // High score for exact keyword match
        }
        
        if (alternateNames.includes(input)) {
            console.log(`  🎯 Exact alternate name match: "${input}"`);
            return 940;
        }
        
        // Check if input contains database role name or vice versa
        if (input.includes(dbNameEN) || dbNameEN.includes(input)) {
            maxScore = Math.max(maxScore, 820);
            console.log(`  📝 Name match with nameEN: ${maxScore}`);
        }
        if (input.includes(dbNameBM) || dbNameBM.includes(input)) {
            maxScore = Math.max(maxScore, 820);
            console.log(`  📝 Name match with nameBM: ${maxScore}`);
        }
        
        // Check keywords for contains match (database keywords are more reliable)
        keywords.forEach(keyword => {
            if (keyword && keyword.length >= 2) { // Only check meaningful keywords
                if (input.includes(keyword)) {
                    maxScore = Math.max(maxScore, 780); // Input contains keyword
                    console.log(`  🔍 Input contains keyword "${keyword}": ${maxScore}`);
                } else if (keyword.includes(input) && input.length >= 3) {
                    maxScore = Math.max(maxScore, 770); // Keyword contains input
                    console.log(`  🔍 Keyword "${keyword}" contains input: ${maxScore}`);
                }
            }
        });
        
        // Check alternate names for contains match
        alternateNames.forEach(altName => {
            if (altName && altName.length >= 2) {
                if (input.includes(altName)) {
                    maxScore = Math.max(maxScore, 760);
                    console.log(`  🔄 Input contains alternate "${altName}": ${maxScore}`);
                } else if (altName.includes(input) && input.length >= 3) {
                    maxScore = Math.max(maxScore, 750);
                    console.log(`  🔄 Alternate "${altName}" contains input: ${maxScore}`);
                }
            }
        });
        
        // Calculate Levenshtein distance for fuzzy matching
        function levenshteinDistance(str1, str2) {
            const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));
            
            for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
            for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
            
            for (let j = 1; j <= str2.length; j++) {
                for (let i = 1; i <= str1.length; i++) {
                    const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                    matrix[j][i] = Math.min(
                        matrix[j][i - 1] + 1,
                        matrix[j - 1][i] + 1,
                        matrix[j - 1][i - 1] + cost
                    );
                }
            }
            
            return matrix[str2.length][str1.length];
        }
        
        function calculateSimilarity(str1, str2) {
            if (!str1 || !str2) return 0;
            const distance = levenshteinDistance(str1, str2);
            const maxLength = Math.max(str1.length, str2.length);
            return ((maxLength - distance) / maxLength) * 100;
        }
        
        // Calculate similarity scores
        const enSimilarity = calculateSimilarity(input, dbNameEN);
        const bmSimilarity = calculateSimilarity(input, dbNameBM);
        
        // Also calculate similarity with keywords and alternate names
        let keywordSimilarity = 0;
        keywords.forEach(keyword => {
            keywordSimilarity = Math.max(keywordSimilarity, calculateSimilarity(input, keyword));
        });
        
        let alternateSimilarity = 0;
        alternateNames.forEach(altName => {
            alternateSimilarity = Math.max(alternateSimilarity, calculateSimilarity(input, altName));
        });
        
        maxScore = Math.max(maxScore, enSimilarity, bmSimilarity, keywordSimilarity, alternateSimilarity);
        
        // Special patterns for common variations
        const patterns = {
            // Committee variations
            'ajk': ['committee member', 'ahli jawatankuasa', 'general committee'],
            'committee member': ['ajk', 'ahli jawatankuasa', 'ahli'],
            'ahli': ['committee member', 'ajk', 'member'],
            
            // Position variations
            'president': ['ketua', 'chairman', 'chairperson'],
            'ketua': ['president', 'chairman', 'chairperson'],
            'vice president': ['naib ketua', 'timbalan ketua', 'vp'],
            'naib ketua': ['vice president', 'timbalan ketua'],
            'secretary': ['setiausaha'],
            'setiausaha': ['secretary'],
            'treasurer': ['bendahari'],
            'bendahari': ['treasurer'],
            'director': ['pengarah'],
            'pengarah': ['director'],
            
            // Competition results
            '1st': ['first', 'johan', 'juara', 'champion', 'winner', 'gold', 'pertama'],
            'first': ['1st', 'johan', 'juara', 'champion'],
            'johan': ['1st', 'first', 'juara', 'champion', 'winner'],
            '2nd': ['second', 'naib johan', 'runner up', 'silver', 'kedua'],
            'second': ['2nd', 'naib johan', 'runner up'],
            '3rd': ['third', 'bronze', 'ketiga'],
            'participation': ['penyertaan', 'peserta', 'participant'],
            'penyertaan': ['participation', 'peserta', 'participant']
        };
        
        // Check pattern matches
        Object.entries(patterns).forEach(([key, synonyms]) => {
            if (input.includes(key) || key.includes(input)) {
                synonyms.forEach(synonym => {
                    if (dbNameEN.includes(synonym) || dbNameBM.includes(synonym)) {
                        maxScore = Math.max(maxScore, 600);
                    }
                });
            }
        });
        
        // Handle AJK patterns specifically
        if (input.startsWith('ajk ')) {
            const ajkType = input.replace('ajk ', '').trim();
            if (dbNameEN.includes('committee') || dbNameBM.includes('jawatankuasa')) {
                if (dbNameEN.includes(ajkType) || dbNameBM.includes(ajkType)) {
                    maxScore = Math.max(maxScore, 700);
                } else if (dbNameEN.includes('general') || dbNameEN.includes('committee member') || 
                          dbNameBM.includes('ahli jawatankuasa')) {
                    maxScore = Math.max(maxScore, 500);
                }
            }
        }
        
        return maxScore;
    }
    
    // Get role data for fuzzy matching
    function getRoleDataForMatching() {
        const roleData = {};
        
        if (!meritValues || !meritValues.roles) {
            console.warn('No merit values or roles available for matching');
            return roleData;
        }
        
        // Collect role data from merit values (hierarchical structure)
        Object.entries(meritValues.roles).forEach(([category, roles]) => {
            Object.entries(roles).forEach(([roleKey, roleInfo]) => {
                // Handle both old format (direct merit values) and new format (with metadata)
                let nameEN, nameBM, keywords, alternateNames;
                
                if (typeof roleInfo === 'object' && (roleInfo.nameEN || roleInfo.nameBM || roleInfo.keywords)) {
                    // New format with metadata
                    nameEN = roleInfo.nameEN || roleKey;
                    nameBM = roleInfo.nameBM || '';
                    keywords = roleInfo.keywords || [];
                    alternateNames = roleInfo.alternateNames || [];
                } else {
                    // Old format (just merit points) - fall back to auto-generation
                    nameEN = roleKey;
                    nameBM = '';
                    keywords = [];
                    alternateNames = [];
                }
                
                // Auto-generate keywords if none exist in database
                if (keywords.length === 0) {
                    keywords = generateKeywordsForRole(nameEN, nameBM);
                    console.log(`🤖 Auto-generated keywords for ${roleKey}:`, keywords);
                } else {
                    console.log(`🗄️ Using database keywords for ${roleKey}:`, keywords);
                }
                
                roleData[roleKey] = {
                    nameEN: nameEN,
                    nameBM: nameBM,
                    category: category,
                    keywords: keywords,
                    alternateNames: alternateNames
                };
            });
        });
        
        // Also check if there are roles loaded from the current event's structure
        if (selectedEvent && selectedEvent.roles) {
            Object.entries(selectedEvent.roles).forEach(([roleKey, roleInfo]) => {
                if (!roleData[roleKey]) {
                    roleData[roleKey] = {
                        nameEN: roleInfo.nameEN || roleKey,
                        nameBM: roleInfo.nameBM || roleKey,
                        category: 'event',
                        keywords: roleInfo.keywords || [],
                        alternateNames: roleInfo.alternateNames || []
                    };
                }
            });
        }
        
        console.log('Enhanced role data loaded:', Object.keys(roleData).length, 'roles');
        return roleData;
    }
    
    const roleDataForMatching = getRoleDataForMatching();
    console.log('Role data for matching:', roleDataForMatching);
    
    // Minimum score threshold for considering a match
    const MINIMUM_MATCH_SCORE = 70;
    
    // Auto-generate keywords for role enhancement
    function generateKeywordsForRole(nameEN, nameBM) {
        const keywords = new Set();
        
        // Add the names themselves
        if (nameEN) keywords.add(nameEN.toLowerCase());
        if (nameBM) keywords.add(nameBM.toLowerCase());
        
        // Extract individual words
        const enWords = (nameEN || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const bmWords = (nameBM || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
        
        enWords.forEach(word => keywords.add(word));
        bmWords.forEach(word => keywords.add(word));
        
        // Add common abbreviations and variations
        const commonMappings = {
            'president': ['pres', 'ketua', 'chairman', 'chairperson'],
            'vice president': ['vp', 'naib ketua', 'timbalan ketua'],
            'secretary': ['sec', 'setiausaha'],
            'treasurer': ['tres', 'bendahari'],
            'director': ['dir', 'pengarah'],
            'committee member': ['ajk', 'ahli jawatankuasa', 'ahli', 'member'],
            'coordinator': ['coord', 'penyelaras'],
            'advisor': ['penasihat'],
            'ketua': ['president', 'chairman', 'chairperson'],
            'naib ketua': ['vice president', 'vp', 'timbalan ketua'],
            'setiausaha': ['secretary', 'sec'],
            'bendahari': ['treasurer', 'tres'],
            'pengarah': ['director', 'dir'],
            'ahli jawatankuasa': ['committee member', 'ajk', 'ahli'],
            'penyelaras': ['coordinator', 'coord'],
            'johan': ['first', '1st', 'champion', 'winner', 'juara'],
            'naib johan': ['second', '2nd', 'runner up'],
            'participation': ['penyertaan', 'peserta', 'participant']
        };
        
        // Check for mappings
        Object.entries(commonMappings).forEach(([key, variations]) => {
            if (nameEN?.toLowerCase().includes(key) || nameBM?.toLowerCase().includes(key)) {
                variations.forEach(variation => keywords.add(variation));
            }
        });
        
        // Handle AJK patterns
        if (nameEN?.toLowerCase().includes('committee') || nameBM?.toLowerCase().includes('jawatankuasa')) {
            keywords.add('ajk');
            keywords.add('committee');
            keywords.add('jawatankuasa');
        }
        
        // Handle competition results
        if (nameEN?.includes('1st') || nameEN?.includes('first') || nameBM?.includes('johan')) {
            keywords.add('johan');
            keywords.add('juara');
            keywords.add('first');
            keywords.add('1st');
            keywords.add('champion');
        }
        
        return Array.from(keywords);
    }
    
    // Function to save enhanced role data back to database (optional)
    async function enhanceRoleWithKeywords(roleKey, keywords, alternateNames = []) {
        if (!meritValues || !meritValues.roles) return;
        
        // This would update the database with keywords
        // Implementation depends on your database structure
        try {
            // Example: Update hierarchical structure
            const firestore = window.firestore;
            if (firestore && selectedEvent) {
                // Find which category this role belongs to
                for (const [category, roles] of Object.entries(meritValues.roles)) {
                    if (roles[roleKey]) {
                        const roleRef = firestore.collection('meritValues')
                            .doc('roleMetadata')
                            .collection(category)
                            .doc(roleKey);
                        
                        await roleRef.update({
                            keywords: keywords,
                            alternateNames: alternateNames,
                            lastEnhanced: new Date()
                        });
                        
                        console.log(`Enhanced role ${roleKey} with keywords:`, keywords);
                        break;
                    }
                }
            }
        } catch (error) {
            console.warn('Could not save role enhancements to database:', error);
        }
    }
    
    processedData.forEach((record, index) => {
        console.log(`\n--- Processing record ${index + 1} ---`);
        console.log('Original role:', record.originalRole);
        console.log('Already assigned:', record.assignedRole);
        
        if (!record.originalRole || record.assignedRole) {
            console.log('Skipping: No original role or already assigned');
            return; // Skip if no original role or already assigned
        }
        
        const originalRoleLower = record.originalRole.toLowerCase().trim();
        console.log('Original role (lowercase):', originalRoleLower);
        let bestMatch = null;
        let bestScore = 0;
        
        // Use dynamic fuzzy matching for all available roles
        console.log('Using dynamic fuzzy matching...');
        
        for (const availableRole of availableRoles) {
            // Get role data for this available role
            const roleData = roleDataForMatching[availableRole] || {
                nameEN: availableRole,
                nameBM: availableRole,
                category: 'unknown',
                keywords: generateKeywordsForRole(availableRole, availableRole),
                alternateNames: []
            };
            
            // Calculate fuzzy match score
            const score = calculateFuzzyScore(originalRoleLower, availableRole, roleData);
            
            console.log(`Checking "${availableRole}": score = ${score}`);
            console.log(`  - EN: "${roleData.nameEN}", BM: "${roleData.nameBM}"`);
            if (roleData.keywords.length > 0) {
                // Check if keywords are from database or auto-generated
                const keywordSource = (meritValues.roles[roleData.category] && 
                                    meritValues.roles[roleData.category][availableRole] && 
                                    meritValues.roles[roleData.category][availableRole].keywords) ? '🗄️ DB' : '🤖 Generated';
                console.log(`  - Keywords (${keywordSource}): [${roleData.keywords.join(', ')}]`);
            }
            if (roleData.alternateNames.length > 0) {
                console.log(`  - Alternates: [${roleData.alternateNames.join(', ')}]`);
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = availableRole;
                console.log(`  🏆 New best match: ${bestMatch} (score: ${bestScore})`);
            }
        }
        
        // Auto-assign if we found a good match above threshold
        if (bestMatch && bestScore >= MINIMUM_MATCH_SCORE) {
            console.log(`✅ Auto-assigning: ${bestMatch} (score: ${bestScore})`);
            record.assignedRole = bestMatch;
            record.autoMapped = true;
            record.matchScore = bestScore; // Store the match score for reference
            record.meritPoints = calculateMeritPointsForUpload(bestMatch, selectedEvent.level, record.additionalNotes, meritValues, selectedEvent);
            autoMappedCount++;
        } else {
            console.log(`❌ No match found (best score: ${bestScore})`);
        }
    });
    
    console.log(`\n=== AUTO-MAPPING COMPLETE ===`);
    console.log(`Total auto-mapped: ${autoMappedCount} out of ${processedData.length}`);
    
    return autoMappedCount;
}

// Removed checkAbbreviationMatch function - functionality now integrated into calculateFuzzyScore

function showAutoMappingSummary() {
    const autoMappedCount = processedData.filter(record => record.autoMapped).length;
    const totalRecords = processedData.length;
    
    if (autoMappedCount > 0) {
        // Find a good place to insert the summary
        const roleAssignmentSection = document.querySelector('#step6 .card-body');
        if (roleAssignmentSection) {
            // Remove existing summary
            const existingSummary = roleAssignmentSection.querySelector('.auto-mapping-summary');
            if (existingSummary) {
                existingSummary.remove();
            }
            
            const summary = document.createElement('div');
            summary.className = 'auto-mapping-summary mb-4';
            summary.innerHTML = `
                <div class="alert alert-success border-success">
                    <div class="flex items-start gap-3">
                        <svg class="w-5 h-5 text-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <div>
                            <h5 class="font-medium text-success mb-1">Auto-Mapping Results</h5>
                            <p class="text-sm mb-0">
                                Successfully auto-mapped <strong>${autoMappedCount}</strong> out of <strong>${totalRecords}</strong> roles using dynamic fuzzy matching.
                                ${autoMappedCount === totalRecords ? ' All roles mapped automatically!' : ` Please review and assign the remaining ${totalRecords - autoMappedCount} roles manually.`}
                            </p>
                            <p class="text-xs text-secondary mt-1 mb-0">
                                <em>Smart matching handles English/Malay names, abbreviations, spelling variations, and learns from your database roles.</em>
                            </p>
                        </div>
                    </div>
                </div>
            `;
            
            // Insert after the role assignment instructions
            const instructions = roleAssignmentSection.querySelector('.bg-warning-light');
            if (instructions) {
                instructions.parentNode.insertBefore(summary, instructions.nextSibling);
            } else {
                roleAssignmentSection.insertBefore(summary, roleAssignmentSection.firstChild);
            }
        }
    }
}

// Role assignment functionality moved to Step 6

async function proceedToRoleAssignment() {
    // Validate column mapping
    const nameColumn = document.getElementById('nameColumnSelect').value;
    const matricColumn = document.getElementById('matricColumnSelect').value;
    
    if (!nameColumn || !matricColumn) {
        showToast('Please select columns for student name and matric number', 'error');
        return;
    }
    
    // Store column mapping
    columnMapping = {
        name: parseInt(nameColumn),
        matricNumber: parseInt(matricColumn),
        role: document.getElementById('roleColumnSelect').value ? parseInt(document.getElementById('roleColumnSelect').value) : null,
        notes: document.getElementById('notesColumnSelect').value ? parseInt(document.getElementById('notesColumnSelect').value) : null,
        proofLink: document.getElementById('proofLinkColumnSelect').value ? parseInt(document.getElementById('proofLinkColumnSelect').value) : null
    };
    
    try {
        showLoading();
        
        // Process data with column mapping (without role assignment yet)
        processedData = await processExcelDataForRoleAssignment();
        
        // Display role assignment interface
        displayRoleAssignment();
        goToStep(6);
        
    } catch (error) {
        console.error('Error processing data:', error);
        showToast('Error processing data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function proceedToValidation() {
    try {
        showLoading();
        
        // Validate that all roles are assigned
        if (!validateRoleAssignments()) {
            return;
        }
        
        // Process final data with assigned roles
        await processFinalDataWithRoles();
        
        // Validate records
        validateRecords();
        
        // Display preview
        displayPreview();
        goToStep(7);
        
    } catch (error) {
        console.error('Error processing data:', error);
        showToast('Error processing data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function processExcelDataForRoleAssignment() {
    const processed = [];
    
    // Process data rows (skip header)
    for (let i = 1; i < excelData.length; i++) {
        const row = excelData[i];
        
        // Skip empty rows
        if (!row || row.every(cell => !cell)) continue;
        
        // Auto-format name and matric number
        const rawName = row[columnMapping.name] || '';
        const rawMatricNumber = row[columnMapping.matricNumber] || '';
        
        // Capitalize name properly (first letter of each word)
        const formattedName = rawName.trim()
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        // Format and validate matric number
        const formattedMatricNumber = formatMatricNumber(rawMatricNumber);
        
        // Get original role from Excel for reference
        const originalRole = columnMapping.role !== null ? (row[columnMapping.role] || '') : '';
        
        const record = {
            rowNumber: i + 1,
            name: formattedName,
            matricNumber: formattedMatricNumber,
            originalRole: originalRole,
            assignedRole: '', // Will be set in role assignment step
            notes: columnMapping.notes !== null ? (row[columnMapping.notes] || '') : '',
            additionalNotes: columnMapping.notes !== null ? (row[columnMapping.notes] || '') : '',
            linkProof: columnMapping.proofLink !== null ? (row[columnMapping.proofLink] || '') : '',
            meritPoints: 0,
            issues: []
        };
        
        processed.push(record);
    }
    
    return processed;
}

async function processFinalDataWithRoles() {
    // Update merit points for all records based on assigned roles
    processedData.forEach(record => {
        if (record.assignedRole) {
            record.role = record.assignedRole;
            calculateMeritPoints(record);
        }
    });
}

function validateRecords() {
    validRecords = [];
    invalidRecords = [];
    
    processedData.forEach(record => {
        const issues = [];
        
        // Validate required fields
        if (!record.name.trim()) {
            issues.push('Name is required');
        }
        
        if (!record.matricNumber.trim()) {
            issues.push('Matric number is required');
        } else if (!validateMatricNumber(record.matricNumber.trim())) {
            issues.push('Invalid matric number format (expected: S12345, DP121234, GS12345, or 12345)');
        }
        
        // For committee member type, role validation will be handled in preview
        const selectedMeritType = document.getElementById('meritType').value;
        if (selectedMeritType !== 'committee' && !record.role.trim()) {
            issues.push('Role is required');
        }
        
        // Calculate merit points
        const meritType = getMeritType();
        
        if (selectedMeritType === 'committee') {
            // For committee members, use their specific role if provided, otherwise default to 0
            const roleToUse = record.role || 'Committee Member';
            record.meritPoints = calculateMeritPointsForUpload(roleToUse, selectedEvent.level, record.additionalNotes, meritValues, selectedEvent);
        } else {
            const roleToUse = meritType || record.role;
            record.meritPoints = calculateMeritPointsForUpload(roleToUse, selectedEvent.level, record.additionalNotes, meritValues, selectedEvent);
        }
        
        // Apply override if set
        if (document.getElementById('overrideMeritValue').checked) {
            const customValue = parseInt(document.getElementById('customMeritValue').value);
            if (!isNaN(customValue)) {
                record.meritPoints = customValue;
            }
        }
        
        record.issues = issues;
        
        if (issues.length === 0) {
            validRecords.push(record);
        } else {
            invalidRecords.push(record);
        }
    });
}

function getMeritType() {
    const meritType = document.getElementById('meritType').value;
    if (meritType === 'custom') {
        return document.getElementById('customMeritType').value.trim();
    } else if (meritType === 'committee') {
        return 'Committee Member (Roles assigned individually)';
    } else if (meritType === 'competition') {
        return 'Competition (Results assigned individually)';
    }
    return meritType;
}

function displayPreview() {
    // Update record count
    document.getElementById('recordCount').textContent = 
        `${processedData.length} records (${validRecords.length} valid, ${invalidRecords.length} with issues)`;
    
    // Display validation summary
    displayValidationSummary();
    
    // Display preview table
    displayPreviewTable();
}

function displayValidationSummary() {
    const summaryContainer = document.getElementById('validationSummary');
    
    summaryContainer.innerHTML = `
        <div class="validation-summary">
            <div class="validation-card success">
                <div class="text-2xl font-bold text-success">${validRecords.length}</div>
                <div class="text-sm">Valid Records</div>
            </div>
            <div class="validation-card ${invalidRecords.length > 0 ? 'error' : 'success'}">
                <div class="text-2xl font-bold ${invalidRecords.length > 0 ? 'text-danger' : 'text-success'}">${invalidRecords.length}</div>
                <div class="text-sm">Records with Issues</div>
            </div>
            <div class="validation-card success">
                <div class="text-2xl font-bold text-primary">${validRecords.reduce((sum, record) => sum + record.meritPoints, 0)}</div>
                <div class="text-sm">Total Merit Points</div>
            </div>
        </div>
    `;
}

function displayPreviewTable() {
    const tableBody = document.getElementById('previewTableBody');
    
    // Combine valid and invalid records for display
    const allRecords = [...validRecords, ...invalidRecords];
    const selectedMeritType = document.getElementById('meritType').value;
    
    tableBody.innerHTML = allRecords.map((record, index) => {
        const statusClass = record.issues.length === 0 ? 'status-valid' : 'status-error';
        const statusIcon = record.issues.length === 0 ? '✓' : '✗';
        
        // Handle role display based on merit type and assignment method
        let roleCell = '';
        const roleAssignmentMethod = record.roleAssignmentMethod || 'single';
        const meritType = document.getElementById('meritType').value;
        
        if (meritType === 'committee' && roleAssignmentMethod === 'manual') {
            // Show dropdown for manual committee role assignment
            roleCell = `
                <select class="form-control form-select role-select" data-record-index="${index}" onchange="updateRecordRole(${index}, this.value)">
                    <option value="">Select Committee Role...</option>
                    ${getRoleOptions(record.role)}
                </select>
            `;
        } else {
            roleCell = sanitizeHTML(record.role);
        }
        
        return `
            <tr class="${record.issues.length > 0 ? 'bg-red-50' : ''}">
                <td>
                    <span class="status-icon ${statusClass}">${statusIcon}</span>
                </td>
                <td>${sanitizeHTML(record.name)}</td>
                <td>${sanitizeHTML(record.matricNumber)}</td>
                <td>${roleCell}</td>
                <td class="font-medium">${record.meritPoints}</td>
                <td>${sanitizeHTML(record.additionalNotes)}</td>
                <td>
                    ${record.issues.length > 0 ? 
                        `<ul class="text-sm text-danger">${record.issues.map(issue => `<li>• ${issue}</li>`).join('')}</ul>` : 
                        '<span class="text-success text-sm">No issues</span>'
                    }
                </td>
            </tr>
        `;
    }).join('');
}

// Helper function to get committee role options
function getCommitteeRoleOptions(selectedRole = '') {
    const committeeRoles = [];
    
    // Get committee roles from database
    if (meritValues && meritValues.roles) {
        const roles = ['Committee Member', 'Program Director', 'Deputy Program Director', 
                      'Secretary', 'Deputy Secretary', 'Treasurer', 'Deputy Treasurer'];
        
        roles.forEach(role => {
            if (meritValues.roles[role]) {
                const isSelected = role === selectedRole ? 'selected' : '';
                committeeRoles.push(`<option value="${role}" ${isSelected}>${role}</option>`);
            }
        });
    }
    
    return committeeRoles.join('');
}

// Function to update record role and recalculate merit points
function updateRecordRole(recordIndex, newRole) {
    try {
        // Validate input parameters
        if (typeof recordIndex !== 'number' || recordIndex < 0) {
            console.warn('Invalid recordIndex provided:', recordIndex);
            return;
        }
        
        if (typeof newRole !== 'string') {
            console.warn('Invalid role provided:', newRole);
            return;
        }
        
        const allRecords = [...validRecords, ...invalidRecords];
        if (recordIndex >= allRecords.length) {
            console.warn('Record index out of bounds:', recordIndex, 'Total records:', allRecords.length);
            return;
        }
        
        const record = allRecords[recordIndex];
        if (!record) {
            console.warn('Record not found at index:', recordIndex);
            return;
        }
        
        record.role = newRole;
        
        // Recalculate merit points
        try {
            if (newRole && newRole.trim()) {
                record.meritPoints = calculateMeritPointsForUpload(newRole, selectedEvent?.level, record.additionalNotes, meritValues, selectedEvent);
            } else {
                record.meritPoints = 0;
            }
        } catch (pointsError) {
            console.error('Error calculating merit points for role update:', pointsError);
            record.meritPoints = 0;
        }
        
        // Re-validate the record
        const issues = [];
        if (!record.name || !record.name.trim()) issues.push('Name is required');
        if (!record.matricNumber || !record.matricNumber.trim()) issues.push('Matric number is required');
        else if (!validateMatricNumber(record.matricNumber.trim().toUpperCase())) {
            issues.push('Invalid matric number format (expected: A12345678 or S12345)');
        }
        if (!record.role || !record.role.trim()) issues.push('Role is required');
        
        record.issues = issues;
        
        // Move between valid/invalid arrays
        const wasValid = validRecords.includes(record);
        const isValid = issues.length === 0;
        
        if (wasValid && !isValid) {
            // Move from valid to invalid
            const index = validRecords.indexOf(record);
            if (index > -1) {
                validRecords.splice(index, 1);
                invalidRecords.push(record);
            }
        } else if (!wasValid && isValid) {
            // Move from invalid to valid
            const index = invalidRecords.indexOf(record);
            if (index > -1) {
                invalidRecords.splice(index, 1);
                validRecords.push(record);
            }
        }
        
        // Update the display
        try {
            displayPreviewTable();
            updateUploadSummary();
        } catch (displayError) {
            console.error('Error updating display after role change:', displayError);
        }
        
    } catch (error) {
        console.error('Error in updateRecordRole:', error);
        showToast('Error updating record role. Please try again.', 'error');
    }
}

// Function to update upload summary
function updateUploadSummary() {
    const summaryElement = document.getElementById('uploadSummary');
    
    if (summaryElement && selectedEvent) {
        const meritType = getMeritType();
        const totalMeritPoints = validRecords.reduce((sum, record) => sum + record.meritPoints, 0);
        
        summaryElement.innerHTML = `
            <div class="bg-light p-4 rounded">
                <h4 class="font-semibold mb-2">Upload Summary</h4>
                <ul class="space-y-1">
                    <li><strong>Event:</strong> ${sanitizeHTML(selectedEvent.name)}</li>
                    <li><strong>Merit Type:</strong> ${sanitizeHTML(meritType)}</li>
                    <li><strong>Records to upload:</strong> ${validRecords.length}</li>
                    <li><strong>Total merit points:</strong> ${totalMeritPoints}</li>
                    ${invalidRecords.length > 0 ? `<li class="text-warning"><strong>Records with issues (will be skipped):</strong> ${invalidRecords.length}</li>` : ''}
                </ul>
            </div>
        `;
    }
}

function exportPreview() {
    const exportData = processedData.map(record => ({
        'Row': record.rowNumber,
        'Status': record.issues.length === 0 ? 'Valid' : 'Invalid',
        'Name': record.name,
        'Matric Number': record.matricNumber,
        'Role': record.role,
        'Merit Points': record.meritPoints,
        'Additional Notes': record.additionalNotes,
        'Link Proof': record.linkProof,
        'Issues': record.issues.join('; ')
    }));
    
    exportToCSV(exportData, `merit_preview_${selectedEvent.name}_${new Date().toISOString().split('T')[0]}.csv`);
    showToast('Preview exported successfully', 'success');
}

function backToPreview() {
    goToStep(6);
}

async function confirmUpload() {
    if (validRecords.length === 0) {
        showToast('No valid records to upload', 'error');
        return;
    }
    
    // Display upload summary first
    updateUploadSummary();
    goToStep(8);
}

async function finalizeUpload() {
    if (validRecords.length === 0) {
        showToast('No valid records to upload', 'error');
        return;
    }
    
    const confirmed = confirm(`Are you sure you want to upload ${validRecords.length} merit records?`);
    if (!confirmed) return;
    
    try {
        // Hide all steps and show Step 8
        hideSteps([1, 2, 3, 4, 5, 6, 7]);
        goToStep(8);
        
        // Update step indicator to show Step 8
        document.getElementById('currentStep').textContent = '8';
        document.getElementById('progressIndicator').style.width = '100%';
        
        console.log('Now showing Step 8 (Upload Progress)');
        
        await uploadMeritRecords();
        
        // Show completion message in Step 8
        const step8Element = document.getElementById('step8');
        step8Element.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Step 8: Upload Complete</h3>
                </div>
                <div class="card-body text-center">
                    <div class="text-success mb-4">
                        <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <h4 class="text-success mb-3">Upload Completed Successfully!</h4>
                    <p class="mb-4">${validRecords.length} merit records have been uploaded to the system.</p>
                </div>
                <div class="card-footer">
                    <div class="flex justify-center gap-3">
                        <button onclick="window.location.href='events.html'" class="btn btn-primary">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5v4m8-4v4"/>
                            </svg>
                            Return to Events
                        </button>
                        <button onclick="clearSavedProgress(); location.reload()" class="btn btn-outline">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            Upload More Records
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        showToast('Merit records uploaded successfully!', 'success');
        
        // Clear saved progress after successful upload
        clearSavedProgress();
        
    } catch (error) {
        console.error('Error uploading merit records:', error);
        showToast('Error uploading merit records: ' + error.message, 'error');
        goToStep(7);
    }
}

async function uploadMeritRecords() {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    let uploaded = 0;
    const total = validRecords.length;
    
    // Initialize progress display
    if (progressText) {
        progressText.textContent = `0 of ${total} records uploaded`;
    }
    
    for (const record of validRecords) {
        try {
            // Find or create student
            const studentId = await findOrCreateStudent(record);
            // Create merit record data (remove undefined values)
            // Get level info for storage
            const levelDisplayName = selectedEvent.levelId 
                ? getLevelName(selectedEvent.levelId)
                : (selectedEvent.level || 'Unknown');
                
            const meritData = {
                meritPoints: record.meritPoints,
                meritType: getMeritType(),
                eventLevel: levelDisplayName,                    // Store display name for compatibility
                eventLevelId: selectedEvent.levelId || null,     // Store level ID for new system
                eventName: selectedEvent.name,
                eventDate: selectedEvent.date,
                uploadDate: firebase.firestore.FieldValue.serverTimestamp(),
                uploadedBy: getCurrentUser().uid
            };
            
            // Add optional fields only if they have values
            if (record.additionalNotes && record.additionalNotes.trim()) {
                meritData.additionalNotes = record.additionalNotes.trim();
            }
            
            if (record.linkProof && record.linkProof.trim()) {
                meritData.linkProof = record.linkProof.trim();
            }
            
            // Save merit record in new structure: students/{matricNumber}/events/{eventId}
            const studentEventDoc = firestore
                .collection('students')
                .doc(record.matricNumber.toUpperCase())
                .collection('events')
                .doc(selectedEvent.id.toString());
            
            // Also add student info to merit data for efficient querying
            meritData.studentName = record.name;
            meritData.matricNumber = record.matricNumber.toUpperCase();
            
            await studentEventDoc.set(meritData);
            
            // OPTIONAL: Also maintain a participant list in the event document for fastest querying
            // This creates a small overhead during upload but makes event details loading super fast
            const eventParticipantRef = firestore
                .collection('events')
                .doc(selectedEvent.id.toString())
                .collection('participants')
                .doc(record.matricNumber.toUpperCase());
            
            await eventParticipantRef.set({
                studentName: record.name,
                matricNumber: record.matricNumber.toUpperCase(),
                meritType: getMeritType(),
                meritPoints: record.meritPoints,
                uploadDate: firebase.firestore.FieldValue.serverTimestamp(),
                additionalNotes: meritData.additionalNotes || null,
                linkProof: meritData.linkProof || null
            });
            uploaded++;
            // Update progress
            const percentage = (uploaded / total) * 100;
            
            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
                progressBar.setAttribute('aria-valuenow', percentage);
                progressBar.textContent = `${Math.round(percentage)}%`;
            }
            if (progressText) {
                progressText.textContent = `${uploaded} of ${total} records uploaded`;
            }
            
            // Small delay to make progress visible
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`Error uploading record for ${record.name}:`, error);
            // Continue with next record
        }
    }
}

async function findOrCreateStudent(record) {
    try {
        // Search for existing student by matric number (using matric as document ID)
        const matricNumber = record.matricNumber.toUpperCase();
        const studentDoc = await firestore.collection('students').doc(matricNumber).get();
        
        if (studentDoc.exists) {
            // Student exists, return the matric number (document ID)
            return matricNumber;
        } else {
            // Create new student record
            const studentData = {
                displayName: record.name,
                role: 'student',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: getCurrentUser().uid,
                isImported: true
            };
            await firestore.collection('students').doc(matricNumber).set(studentData);
            return matricNumber;
        }
    } catch (error) {
        console.error('Error finding/creating student:', error);
        throw error;
    }
}

function clearFile() {
    const fileInput = document.getElementById('excelFile');
    const processBtn = document.getElementById('processFileBtn');
    
    if (fileInput) {
        fileInput.value = '';
    }
    
    if (processBtn) {
        processBtn.disabled = true;
    }
    
    hideSteps([4, 5, 6, 7, 8]);
    processedData = [];
    validRecords = [];
    invalidRecords = [];
}

function downloadTemplate() {
    const templateData = [
        ['Matric Number', 'Name', 'Role (For Committee Member only)', 'Timestamp (If Available)', 'Proof (If Available)', 'Notes (Optional)'],
        ['A12345678', 'Ahmad Bin Ali', 'Program Director', '2024-01-15 14:00', 'https://example.com/proof', 'Champion'],
        ['A87654321', 'Siti Binti Hassan', 'Secretary', '', '', 'Committee Member'],
        ['A11223344', 'Chong Wei Ming', '', '', '', 'Participant']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Merit Records');
    
    XLSX.writeFile(wb, 'merit_upload_template.xlsx');
    showToast('Template downloaded successfully', 'success');
}

function showStep(stepNumber) {
    const stepElement = document.getElementById(`step${stepNumber}`);
    if (stepElement) {
        stepElement.classList.remove('d-none');
    } else {
        console.warn(`Step element 'step${stepNumber}' not found`);
    }
}

function hideSteps(stepNumbers) {
    stepNumbers.forEach(stepNumber => {
        const stepElement = document.getElementById(`step${stepNumber}`);
        if (stepElement) {
            stepElement.classList.add('d-none');
        } else {
            console.warn(`Step element 'step${stepNumber}' not found`);
        }
    });
}

// Page-based navigation functions
let currentStepNumber = 1;

function goToStep(stepNumber) {
    // Hide current step
    hideSteps([currentStepNumber]);
    
    // Show new step
    showStep(stepNumber);
    
    // Update current step
    currentStepNumber = stepNumber;
    
    // Update progress indicator
    updateProgressIndicator(stepNumber);
    
    // Update URL
    updateStepUrl(stepNumber);
    
    // Save progress to localStorage
    saveProgressToStorage();
    
    // Step-specific actions
    if (stepNumber === 7) {
        // Update upload summary when entering confirmation step
        updateUploadSummary();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgressIndicator(stepNumber) {
    const progressBar = document.getElementById('progressIndicator');
    const currentStepSpan = document.getElementById('currentStep');
    
    if (progressBar) {
        const percentage = (stepNumber / 8) * 100;
        progressBar.style.width = `${percentage}%`;
    }
    
    if (currentStepSpan) {
        currentStepSpan.textContent = stepNumber;
    }
}

function getRoleOptions(selectedRole = '') {
    if (!meritValues || !meritValues.roles || !selectedEvent) return '';
    
    // Handle both new levelId format and legacy level format
    let levelId = selectedEvent.levelId || selectedEvent.level;
    if (levelId && !levelId.startsWith('level_') && !levelId.startsWith('comp_')) {
        levelId = getLevelIdByName(levelId);
    }
    const dbLevel = levelId;
    let options = '';
    
    // Add base roles
    Object.keys(meritValues.roles).forEach(role => {
        const points = meritValues.roles[role][dbLevel] || 0;
        const isSelected = role === selectedRole ? 'selected' : '';
        options += `<option value="${role}" ${isSelected}>${role} (${points} points)</option>`;
    });
    
    // Add custom roles if available
    if (selectedEvent.customRoles && selectedEvent.customRoles.length > 0) {
        selectedEvent.customRoles.forEach(customRole => {
            const customValue = `custom:${customRole.name}`;
            const isSelected = customValue === selectedRole ? 'selected' : '';
            options += `<option value="${customValue}" ${isSelected}>${customRole.name} (${customRole.value} points)</option>`;
        });
    }
    
    return options;
}

function calculateMeritPoints(record) {
    try {
        if (!record || typeof record !== 'object') {
            console.warn('Invalid record provided to calculateMeritPoints');
            return;
        }
        
        if (!record.role || !selectedEvent || !meritValues) {
            record.meritPoints = 0;
            return;
        }
        
        // Handle both new levelId format and legacy level format  
        let levelId = selectedEvent.levelId || selectedEvent.level;
        if (levelId && !levelId.startsWith('level_') && !levelId.startsWith('comp_')) {
            levelId = getLevelIdByName(levelId);
        }
        const dbLevel = levelId;
        
        // Check if it's a custom role
        if (typeof record.role === 'string' && record.role.startsWith('custom:')) {
            const customRoleName = record.role.substring(7); // Remove 'custom:' prefix
            const customRole = selectedEvent.customRoles?.find(r => r.name === customRoleName);
            record.meritPoints = customRole ? customRole.value : 0;
        } else {
            // Base role
            record.meritPoints = meritValues.roles[record.role]?.[dbLevel] || 0;
        }
    } catch (error) {
        console.error('Error calculating merit points:', error);
        if (record) {
            record.meritPoints = 0;
        }
    }
}



function proceedToConfirm() {
    // Check if there are any valid records to upload
    if (validRecords.length === 0) {
        showToast('No valid records to upload. Please fix the issues and try again.', 'error');
        return;
    }
    
    // Display upload summary and proceed to confirmation
    updateUploadSummary();
    goToStep(8);
}

// Make functions globally available
window.deleteExcelRow = deleteExcelRow;
window.clearSavedProgress = clearSavedProgress;

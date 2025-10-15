// Upload Merits functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
    setupEventListeners();
});

let selectedEvent = null;
let meritValues = null;
let processedData = [];
let validRecords = [];
let invalidRecords = [];
let excelData = null;
let columnHeaders = [];
let columnMapping = {};
let currentWorkbook = null;

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
        
        // If event is pre-selected and merit values are loaded, populate merit types
        if (selectedEvent && meritValues) {
            await populateMeritTypes();
        }
    }, 100);
    
    // Check for eventId and childActivityId in URL params
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
    
    // Merit type selection
    addEventListenerSafely('meritType', 'change', handleMeritTypeChange);
    addEventListenerSafely('overrideMeritValue', 'change', handleOverrideToggle);
    
    // File upload
    addEventListenerSafely('excelFile', 'change', handleFileSelect);
    // Removed processFileBtn since Step 5 was eliminated
    
    // Template download
    addEventListenerSafely('downloadTemplateBtn', 'click', downloadTemplate);
    
    // Preview actions
    addEventListenerSafely('exportPreviewBtn', 'click', exportPreview);
    addEventListenerSafely('confirmUploadBtn', 'click', finalizeUpload);
    
    // Page navigation
    addEventListenerSafely('nextFromStep1', 'click', () => goToStep(2));
    addEventListenerSafely('backFromStep2', 'click', () => goToStep(1));
    addEventListenerSafely('nextFromStep2', 'click', () => goToStep(3));
    addEventListenerSafely('backFromStep3', 'click', () => goToStep(2));
    addEventListenerSafely('nextFromStep3', 'click', handleFileUploadNext);
    addEventListenerSafely('backFromStep4', 'click', () => goToStep(3));
    addEventListenerSafely('nextFromStep4', 'click', handleSheetSelectionNext);
    addEventListenerSafely('backFromStep5', 'click', () => goToStep(4));
    addEventListenerSafely('nextFromStep5', 'click', proceedToValidation);
    addEventListenerSafely('backFromStep6', 'click', () => goToStep(5));
    addEventListenerSafely('nextFromStep6', 'click', () => {
        updateUploadSummary();
        goToStep(7);
    });
    addEventListenerSafely('backFromStep7', 'click', () => goToStep(6));
    addEventListenerSafely('nextFromStep7', 'click', () => {
        goToStep(8);
    });
    addEventListenerSafely('backFromStep8', 'click', () => goToStep(7));
    
    // Role assignment radios (may not exist)
    const roleAssignmentRadios = document.querySelectorAll('input[name="roleAssignment"]');
    if (roleAssignmentRadios.length > 0) {
        roleAssignmentRadios.forEach(radio => {
            radio.addEventListener('change', handleRoleAssignmentChange);
        });
    }
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
        
        // Ensure level metadata is loaded first
        await window.levelManager.ensureLevelMetadata();
        
        // Get merit values from consolidated levels collection
        const roles = window.levelManager.getAllMeritValuesByRole();
        const levels = {};
        
        // Build levels object for backward compatibility
        window.levelManager.getActiveLevels().forEach(level => {
            levels[level.id] = level.meritValues || {};
        });
        
        meritValues = { roles: roles, levels: levels };
        console.log('Loaded merit values:', meritValues);
    } catch (error) {
        console.error('Error loading merit values:', error);
    }
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
        
        // Enable next button (parent event is sufficient to proceed)
        if (nextBtn) nextBtn.disabled = false;
        
    } catch (error) {
        console.error('Error loading event:', error);
        showToast('Error loading event details', 'error');
    }
}

async function loadChildActivities(parentEventId) {
    try {
        const childActivitySelect = document.getElementById('childActivitySelect');
        childActivitySelect.innerHTML = '<option value="">Upload to Main Event (No specific activity)</option>';
        
        // Load child activities for this parent event
        const childActivitiesSnapshot = await firestore.collection('events')
            .where('parentEventId', '==', parentEventId)
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
        // Selected a child activity - load its details
        try {
            const childActivityDoc = await firestore.collection('events').doc(childActivityId).get();
            if (childActivityDoc.exists) {
                const childActivityData = { id: childActivityId, ...childActivityDoc.data() };
                // Update selected event to be the child activity
                selectedEvent = childActivityData;
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
        // Committee Member option (groups all committee roles)
        const committeeOption = document.createElement('option');
        committeeOption.value = 'committee';
        committeeOption.textContent = 'Committee Member (Assign specific roles during upload)';
        committeeOption.setAttribute('data-type', 'committee');
        meritTypeSelect.appendChild(committeeOption);
        
        // Add non-committee base roles
        if (meritValues && meritValues.roles) {
            // Define committee member roles (roles that are typically committee positions)
            const committeeRoles = ['Committee Member', 'Program Director', 'Deputy Program Director', 
                                  'Secretary', 'Deputy Secretary', 'Treasurer', 'Deputy Treasurer'];
            
            const nonCommitteeRoles = Object.keys(meritValues.roles)
                .filter(role => !committeeRoles.includes(role))
                .sort();
            
            if (nonCommitteeRoles.length > 0) {
                // Add separator
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '--- Other Roles ---';
                meritTypeSelect.appendChild(separator);
                
                nonCommitteeRoles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role;
                    option.textContent = role;
                    option.setAttribute('data-type', 'base');
                    meritTypeSelect.appendChild(option);
                });
            }
        }
        
        // Add custom roles from selected event
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
        
        // Add "Other (Custom)" option at the end
        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Other (Custom)';
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
    if (eventLevel && !eventLevel.startsWith('level_')) {
        // Legacy format - try to find level ID by name
        levelId = window.levelManager.getLevelIdByName(eventLevel);
    }
    
    // Fall back to base role calculation using level ID
    if (meritValues.roles && meritValues.roles[role] && meritValues.roles[role][levelId]) {
        basePoints = meritValues.roles[role][levelId];
    }
    
    // Add bonus points for achievements (if implemented)
    let bonusPoints = 0;
    if (additionalNotes && meritValues.achievements) {
        const notes = additionalNotes.toLowerCase();
        for (const [achievement, values] of Object.entries(meritValues.achievements)) {
            if (notes.includes(achievement.toLowerCase()) && values[dbLevel]) {
                bonusPoints = Math.max(bonusPoints, values[dbLevel]);
            }
        }
    }
    
    return basePoints + bonusPoints;
}

function displayEventInfo() {
    const eventInfo = document.getElementById('eventInfo');
    const eventDetails = document.getElementById('eventDetails');
    
    // Build merit types preview
    let meritTypesHtml = '<div class="mt-4"><h5 class="font-semibold mb-2">Available Merit Types:</h5><div class="grid grid-cols-2 gap-2">';
    
    // Base roles
    if (meritValues && meritValues.roles) {
        // Handle both new levelId format and legacy level format
        let levelId = selectedEvent.levelId || selectedEvent.level;
        if (levelId && !levelId.startsWith('level_')) {
            levelId = window.levelManager.getLevelIdByName(levelId);
        }
        
        Object.entries(meritValues.roles).forEach(([role, levels]) => {
            const points = levels[levelId] || 0;
            meritTypesHtml += `
                <div class="bg-gray-100 p-2 rounded text-sm">
                    <strong>${sanitizeHTML(role)}:</strong> ${points} points
                </div>
            `;
        });
    }
    
    // Custom roles
    if (selectedEvent.customRoles && selectedEvent.customRoles.length > 0) {
        selectedEvent.customRoles.forEach(role => {
            meritTypesHtml += `
                <div class="bg-blue-100 p-2 rounded text-sm border border-blue-200">
                    <strong>${sanitizeHTML(role.name)}:</strong> ${role.value} points <span class="text-xs text-blue-600">(Custom)</span>
                </div>
            `;
        });
    }
    
    meritTypesHtml += '</div></div>';
    
    // Determine what type of selection we have
    const childActivitySelect = document.getElementById('childActivitySelect');
    const selectedChildActivityId = childActivitySelect ? childActivitySelect.value : '';
    
    // Build event info
    const levelDisplayName = selectedEvent.levelId 
        ? window.levelManager.getLevelName(selectedEvent.levelId)
        : (selectedEvent.level || 'Unknown');
    
    let eventInfoHtml = `
        <div class="grid grid-cols-2 gap-4">
            <div><strong>Event:</strong> ${sanitizeHTML(selectedEvent.name)}</div>
            <div><strong>Level:</strong> ${sanitizeHTML(levelDisplayName)}</div>
            <div><strong>Date:</strong> ${formatDate(selectedEvent.date)}</div>
            <div><strong>Location:</strong> ${sanitizeHTML(selectedEvent.location || 'Not specified')}</div>`;
    
    // Add type information based on selection
    if (selectedEvent.isSubActivity) {
        eventInfoHtml += `
            <div><strong>Type:</strong> Child Activity</div>
            <div><strong>Category:</strong> ${sanitizeHTML(selectedEvent.subActivityType || 'Not specified')}</div>`;
    } else if (selectedChildActivityId === '') {
        eventInfoHtml += `
            <div><strong>Upload Target:</strong> Main Event</div>
            <div><strong>Type:</strong> Parent Event</div>`;
    } else {
        eventInfoHtml += `
            <div><strong>Upload Target:</strong> Child Activity</div>
            <div><strong>Type:</strong> Parent Event</div>`;
    }
    
    eventInfoHtml += `</div>${meritTypesHtml}`;
    
    eventDetails.innerHTML = eventInfoHtml;
    
    eventInfo.classList.remove('d-none');
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
}

function updateRoleDefinitionVisibility() {
    const meritType = document.getElementById('meritType').value;
    const committeeRoleOptions = document.getElementById('committeeRoleOptions');
    const nonCommitteeRoleInfo = document.getElementById('nonCommitteeRoleInfo');
    const roleColumnGroup = document.getElementById('roleColumnGroup');
    
    if (meritType === 'committee') {
        // Show committee role definition options and role column selection
        committeeRoleOptions.classList.remove('d-none');
        nonCommitteeRoleInfo.classList.add('d-none');
        roleColumnGroup.classList.remove('d-none');
    } else if (meritType && meritType !== 'custom') {
        // Show non-committee info, hide committee options and role column
        committeeRoleOptions.classList.add('d-none');
        nonCommitteeRoleInfo.classList.remove('d-none');
        roleColumnGroup.classList.add('d-none');
    } else {
        // Hide all for no selection or custom
        committeeRoleOptions.classList.add('d-none');
        nonCommitteeRoleInfo.classList.add('d-none');
        roleColumnGroup.classList.add('d-none');
    }
}

function handleOverrideToggle() {
    const override = document.getElementById('overrideMeritValue').checked;
    const customValueGroup = document.getElementById('customMeritValueGroup');
    
    if (override) {
        customValueGroup.classList.remove('d-none');
    } else {
        customValueGroup.classList.add('d-none');
    }
}

function handleFileSelect() {
    const fileInput = document.getElementById('excelFile');
    const nextBtn = document.getElementById('nextFromStep3');
    
    if (nextBtn) {
        nextBtn.disabled = !fileInput.files[0];
    }
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
            // Single sheet - setup single sheet display
            const sheetName = result.sheetNames ? result.sheetNames[0] : 'Sheet1';
            setupSingleSheetSelection(sheetName, result.length || 0);
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
                        
                        // Get row count for selected sheet
                        try {
                            if (window.currentWorkbook && window.currentWorkbook.Sheets[selectedSheet]) {
                                const sheet = window.currentWorkbook.Sheets[selectedSheet];
                                const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                                const rowCount = sheetData.length;
                                
                                document.getElementById('selectedSheetName').textContent = selectedSheet;
                                document.getElementById('selectedSheetRows').textContent = rowCount;
                            }
                        } catch (e) {
                            console.warn('Error getting sheet preview:', e);
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
        
        // Get column headers
        columnHeaders = excelData[0].map((header, index) => ({
            index: index,
            name: header || `Column ${index + 1}`
        }));
        
        // Populate column mapping dropdowns
        populateColumnMappingDropdowns();
        
        // Populate role selection dropdown
        populateRoleSelectionDropdown();
        
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
        
        // Get column headers
        columnHeaders = excelData[0].map((header, index) => ({
            index: index,
            name: header || `Column ${index + 1}`
        }));
        
        // Populate column mapping dropdowns
        populateColumnMappingDropdowns();
        
        // Populate role selection dropdown
        populateRoleSelectionDropdown();
        
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
                const rowCount = sheetData.length;
                displayName = `${sheetName} (${rowCount} rows)`;
            }
        } catch (e) {
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
        
        // Auto-detect common columns
        autoDetectColumn(dropdown, dropdownId);
    });
}

function autoDetectColumn(dropdown, dropdownId) {
    const detectionRules = {
        'nameColumnSelect': ['name', 'student name', 'full name', 'nama'],
        'matricColumnSelect': ['matric', 'student id', 'id', 'matric number', 'no matric'],
        'roleColumnSelect': ['role', 'position', 'jawatan', 'committee'],
        'notesColumnSelect': ['notes', 'note', 'remarks', 'catatan', 'additional notes']
    };
    
    const rules = detectionRules[dropdownId];
    if (!rules) return;
    
    for (const header of columnHeaders) {
        const headerLower = header.name.toLowerCase();
        if (rules.some(rule => headerLower.includes(rule))) {
            dropdown.value = header.index;
            break;
        }
    }
}

function populateRoleSelectionDropdown() {
    const roleSelect = document.getElementById('singleRoleSelect');
    roleSelect.innerHTML = '<option value="">Select role...</option>';
    
    if (meritValues && meritValues.roles && selectedEvent) {
        // Handle both new levelId format and legacy level format
        let levelId = selectedEvent.levelId || selectedEvent.level;
        if (levelId && !levelId.startsWith('level_')) {
            levelId = window.levelManager.getLevelIdByName(levelId);
        }
        const dbLevel = levelId;
        
        // Add base roles
        Object.keys(meritValues.roles).forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = `${role} (${meritValues.roles[role][dbLevel] || 0} points)`;
            roleSelect.appendChild(option);
        });
        
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
}

function displayFilePreview() {
    const head = document.getElementById('mappingPreviewHead');
    const body = document.getElementById('mappingPreviewBody');
    
    // Clear existing content
    head.innerHTML = '';
    body.innerHTML = '';
    
    if (!excelData || excelData.length < 2) return;
    
    // Create header row
    const headerRow = document.createElement('tr');
    excelData[0].forEach((header, index) => {
        const th = document.createElement('th');
        th.textContent = header || `Column ${index + 1}`;
        headerRow.appendChild(th);
    });
    head.appendChild(headerRow);
    
    // Create data rows (show all rows, but limit for performance)
    const maxRowsToShow = Math.min(20, excelData.length - 1); // Show up to 20 rows
    for (let i = 1; i <= maxRowsToShow; i++) {
        const row = document.createElement('tr');
        excelData[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            td.style.maxWidth = '150px';
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            row.appendChild(td);
        });
        body.appendChild(row);
    }
    
    // Add row count info if there are more rows
    if (excelData.length - 1 > maxRowsToShow) {
        const infoRow = document.createElement('tr');
        const infoCell = document.createElement('td');
        infoCell.colSpan = excelData[0].length;
        infoCell.innerHTML = `<em class="text-secondary">... and ${excelData.length - 1 - maxRowsToShow} more rows</em>`;
        infoCell.style.textAlign = 'center';
        infoCell.style.padding = '10px';
        infoRow.appendChild(infoCell);
        body.appendChild(infoRow);
    }
}

function handleRoleAssignmentChange() {
    const selectedValue = document.querySelector('input[name="roleAssignment"]:checked').value;
    const singleRoleSection = document.getElementById('singleRoleSection');
    const manualRoleSection = document.getElementById('manualRoleSection');
    
    if (selectedValue === 'single') {
        singleRoleSection.classList.remove('d-none');
        manualRoleSection.classList.add('d-none');
    } else if (selectedValue === 'manual') {
        singleRoleSection.classList.add('d-none');
        manualRoleSection.classList.remove('d-none');
    } else {
        singleRoleSection.classList.add('d-none');
        manualRoleSection.classList.add('d-none');
    }
}

async function proceedToValidation() {
    // Validate column mapping
    const nameColumn = document.getElementById('nameColumnSelect').value;
    const matricColumn = document.getElementById('matricColumnSelect').value;
    const meritType = document.getElementById('meritType').value;
    
    if (!nameColumn || !matricColumn) {
        showToast('Please select columns for student name and matric number', 'error');
        return;
    }
    
    // For committee merit type, validate role assignment
    if (meritType === 'committee') {
        const roleAssignment = document.querySelector('input[name="roleAssignment"]:checked')?.value;
        const singleRole = document.getElementById('singleRoleSelect').value;
        
        if (roleAssignment === 'single' && !singleRole) {
            showToast('Please select a committee role for all students', 'error');
            return;
        }
        
        if (roleAssignment === 'column' && !document.getElementById('roleColumnSelect').value) {
            showToast('Please select a role column or choose a different role assignment method', 'error');
            return;
        }
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
        
        // Process data with column mapping
        processedData = await processExcelDataWithMapping();
        
        // Validate records
        validateRecords();
        
        // Display preview
        displayPreview();
        goToStep(6);
        
    } catch (error) {
        console.error('Error processing data:', error);
        showToast('Error processing data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function processExcelDataWithMapping() {
    const meritType = document.getElementById('meritType').value;
    let roleAssignment = 'single';  // Default for non-committee
    let singleRole = meritType;     // Use merit type as role for non-committee
    
    // For committee merit type, get the role assignment method
    if (meritType === 'committee') {
        roleAssignment = document.querySelector('input[name="roleAssignment"]:checked')?.value || 'single';
        singleRole = document.getElementById('singleRoleSelect').value;
    }
    
    const processed = [];
    
    // Process data rows (skip header)
    for (let i = 1; i < excelData.length; i++) {
        const row = excelData[i];
        
        // Skip empty rows
        if (!row || row.every(cell => !cell)) continue;
        
        let assignedRole = '';
        
        // Determine role based on merit type and assignment method
        if (meritType === 'committee') {
            // Committee merit type - use role assignment method
            if (roleAssignment === 'column' && columnMapping.role !== null) {
                assignedRole = row[columnMapping.role] || '';
            } else if (roleAssignment === 'single' && singleRole) {
                assignedRole = singleRole;
            }
            // For manual assignment, role will be empty and handled in preview
        } else {
            // Non-committee merit type - use merit type as role
            assignedRole = meritType;
            roleAssignment = 'single'; // Force single assignment for consistency
        }
        
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
        
        const record = {
            rowNumber: i + 1,
            name: formattedName,
            matricNumber: formattedMatricNumber,
            role: assignedRole,
            notes: columnMapping.notes !== null ? (row[columnMapping.notes] || '') : '',
            issues: [],
            roleAssignmentMethod: roleAssignment,
            meritPoints: 0,
            additionalNotes: columnMapping.notes !== null ? (row[columnMapping.notes] || '') : '',
            linkProof: columnMapping.proofLink !== null ? (row[columnMapping.proofLink] || '') : ''
        };
        
        // Calculate merit points if role is assigned
        if (assignedRole) {
            calculateMeritPoints(record);
        }
        
        processed.push(record);
    }
    
    return processed;
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
                        <button onclick="location.reload()" class="btn btn-outline">
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
                ? window.levelManager.getLevelName(selectedEvent.levelId)
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
            
            await studentEventDoc.set(meritData);
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
    if (levelId && !levelId.startsWith('level_')) {
        levelId = window.levelManager.getLevelIdByName(levelId);
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
        if (levelId && !levelId.startsWith('level_')) {
            levelId = window.levelManager.getLevelIdByName(levelId);
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

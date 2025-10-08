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
    
    // Check for eventId in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');
    if (eventId) {
        // Pre-select event if provided in URL
        setTimeout(() => {
            document.getElementById('eventSelect').value = eventId;
            handleEventSelect();
        }, 1000);
    }
}

function setupEventListeners() {
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Event selection
    document.getElementById('eventSelect').addEventListener('change', handleEventSelect);
    
    // Merit type selection
    document.getElementById('meritType').addEventListener('change', handleMeritTypeChange);
    document.getElementById('overrideMeritValue').addEventListener('change', handleOverrideToggle);
    
    // File upload
    document.getElementById('excelFile').addEventListener('change', handleFileSelect);
    document.getElementById('processFileBtn').addEventListener('click', processFile);
    document.getElementById('clearFileBtn').addEventListener('click', clearFile);
    
    // Template download
    document.getElementById('downloadTemplateBtn').addEventListener('click', downloadTemplate);
    
    // Preview actions
    document.getElementById('exportPreviewBtn').addEventListener('click', exportPreview);
    document.getElementById('confirmUploadBtn').addEventListener('click', finalizeUpload);
    document.getElementById('backToPreviewBtn').addEventListener('click', backToPreview);
}

async function loadEvents() {
    try {
        // Check if firestore is available
        if (!window.firebase || !window.firestore) {
            console.error('Firebase or Firestore not initialized');
            throw new Error('Firebase not properly initialized');
        }
        
        const eventsSnapshot = await firestore.collection('events').get();
        const events = {};
        eventsSnapshot.forEach(doc => {
            events[doc.id] = doc.data();
        });
        const eventSelect = document.getElementById('eventSelect');
        eventSelect.innerHTML = '<option value="">Select an event...</option>';
        Object.entries(events)
            .sort(([,a], [,b]) => new Date(b.date) - new Date(a.date))
            .forEach(([id, event]) => {
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
        
        const snapshot = await firestore.collection('meritvalue').get();
        const roles = {};
        const levels = {};
        
        // Process each level document
        snapshot.forEach(doc => {
            const levelName = doc.id; // e.g., "Block Level", "University Level"
            const levelData = doc.data();
            
            // Convert level name to match event levels (remove " Level" suffix)
            const eventLevelName = levelName.replace(' Level', '');
            levels[eventLevelName] = levelData;
            
            // For each role in this level, add to roles object
            Object.entries(levelData).forEach(([roleName, points]) => {
                if (!roles[roleName]) {
                    roles[roleName] = {};
                }
                roles[roleName][eventLevelName] = points;
            });
        });
        
        meritValues = { roles: roles, levels: levels };
        console.log('Loaded merit values:', meritValues);
    } catch (error) {
        console.error('Error loading merit values:', error);
    }
}

async function handleEventSelect() {
    const eventId = document.getElementById('eventSelect').value;
    
    if (!eventId) {
        hideSteps([2, 3, 4, 5]);
        // Reset merit type dropdown
        const meritTypeSelect = document.getElementById('meritType');
        meritTypeSelect.innerHTML = '<option value="">Select an event first...</option>';
        return;
    }
    
    try {
        // Load event details
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        selectedEvent = { id: eventId, ...eventDoc.data() };
        
        // Populate merit types dropdown
        await populateMeritTypes();
        
        // Display event info
        displayEventInfo();
        showStep(2);
    } catch (error) {
        console.error('Error loading event:', error);
        showToast('Error loading event details', 'error');
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
    
    // Map event level to database level
    const dbLevel = mapEventLevelToDbLevel(eventLevel);
    
    // Fall back to base role calculation
    if (meritValues.roles && meritValues.roles[role] && meritValues.roles[role][dbLevel]) {
        basePoints = meritValues.roles[role][dbLevel];
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
        const dbLevel = mapEventLevelToDbLevel(selectedEvent.level);
        Object.entries(meritValues.roles).forEach(([role, levels]) => {
            const points = levels[dbLevel] || 0;
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
    
    eventDetails.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div><strong>Event:</strong> ${sanitizeHTML(selectedEvent.name)}</div>
            <div><strong>Level:</strong> ${sanitizeHTML(selectedEvent.level)}</div>
            <div><strong>Date:</strong> ${formatDate(selectedEvent.date)}</div>
            <div><strong>Location:</strong> ${sanitizeHTML(selectedEvent.location || 'Not specified')}</div>
        </div>
        ${meritTypesHtml}
    `;
    
    eventInfo.classList.remove('d-none');
}

function handleMeritTypeChange() {
    const meritType = document.getElementById('meritType').value;
    const customGroup = document.getElementById('customMeritTypeGroup');
    
    if (meritType === 'custom') {
        customGroup.classList.remove('d-none');
        showStep(3);
    } else {
        customGroup.classList.add('d-none');
        if (meritType) {
            showStep(3);
        }
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
    const processBtn = document.getElementById('processFileBtn');
    
    processBtn.disabled = !fileInput.files[0];
}

async function processFile() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Parse Excel file
        const excelData = await parseExcelFile(file);
        
        // Process and validate data
        processedData = await processExcelData(excelData);
        
        // Validate records
        validateRecords();
        
        // Display preview
        displayPreview();
        showStep(4);
        
    } catch (error) {
        console.error('Error processing file:', error);
        showToast('Error processing file: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function processExcelData(excelData) {
    if (excelData.length < 2) {
        throw new Error('Excel file must have headers and at least one data row');
    }
    
    const headers = excelData[0];
    const requiredColumns = ['Name', 'Matric Number'];
    
    // Check for required columns
    const missingColumns = requiredColumns.filter(col => 
        !headers.some(header => header && header.toLowerCase().includes(col.toLowerCase()))
    );
    
    if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }
    
    // Find column indices
    const columnMap = {};
    headers.forEach((header, index) => {
        if (header) {
            const lowerHeader = header.toLowerCase();
            if (lowerHeader.includes('name') && !lowerHeader.includes('matric')) columnMap.name = index;
            if (lowerHeader.includes('matric')) columnMap.matricNumber = index;
            if (lowerHeader.includes('role')) columnMap.role = index;
            if (lowerHeader.includes('note')) columnMap.notes = index;
            if (lowerHeader.includes('proof')) columnMap.proof = index;
            if (lowerHeader.includes('timestamp') || lowerHeader.includes('time')) columnMap.timestamp = index;
        }
    });
    
    // Process data rows
    const processed = [];
    for (let i = 1; i < excelData.length; i++) {
        const row = excelData[i];
        
        // Skip empty rows
        if (!row || row.every(cell => !cell)) continue;
        
        const record = {
            rowNumber: i + 1,
            name: row[columnMap.name] || '',
            matricNumber: row[columnMap.matricNumber] || '',
            role: row[columnMap.role] || '', // Specific committee role if provided
            notes: row[columnMap.notes] || '',
            proof: row[columnMap.proof] || '',
            timestamp: row[columnMap.timestamp] || '',
            issues: []
        };
        
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
        } else if (!validateMatricNumber(record.matricNumber.trim().toUpperCase())) {
            issues.push('Invalid matric number format (expected: A12345678)');
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
        
        // For committee member selection, show role dropdown
        let roleCell = '';
        if (selectedMeritType === 'committee') {
            roleCell = `
                <select class="form-select form-select-sm role-select" data-record-index="${index}" onchange="updateRecordRole(${index}, this.value)">
                    <option value="">Select Role...</option>
                    ${getCommitteeRoleOptions(record.role)}
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
    const allRecords = [...validRecords, ...invalidRecords];
    if (recordIndex < 0 || recordIndex >= allRecords.length) return;
    
    const record = allRecords[recordIndex];
    record.role = newRole;
    
    // Recalculate merit points
    if (newRole) {
        record.meritPoints = calculateMeritPointsForUpload(newRole, selectedEvent.level, record.additionalNotes, meritValues, selectedEvent);
    } else {
        record.meritPoints = 0;
    }
    
    // Re-validate the record
    const issues = [];
    if (!record.name.trim()) issues.push('Name is required');
    if (!record.matricNumber.trim()) issues.push('Matric number is required');
    else if (!validateMatricNumber(record.matricNumber.trim().toUpperCase())) {
        issues.push('Invalid matric number format (expected: A12345678)');
    }
    if (!record.role.trim()) issues.push('Role is required');
    
    record.issues = issues;
    
    // Move between valid/invalid arrays
    const wasValid = validRecords.includes(record);
    const isValid = issues.length === 0;
    
    if (wasValid && !isValid) {
        // Move from valid to invalid
        validRecords.splice(validRecords.indexOf(record), 1);
        invalidRecords.push(record);
    } else if (!wasValid && isValid) {
        // Move from invalid to valid
        invalidRecords.splice(invalidRecords.indexOf(record), 1);
        validRecords.push(record);
    }
    
    // Update the display
    displayPreviewTable();
    updateUploadSummary();
}

// Function to update upload summary
function updateUploadSummary() {
    const summaryElement = document.getElementById('uploadSummary');
    if (summaryElement && selectedEvent) {
        summaryElement.innerHTML = `
            <div class="bg-light p-4 rounded">
                <h4 class="font-semibold mb-2">Upload Summary</h4>
                <ul class="space-y-1">
                    <li><strong>Event:</strong> ${sanitizeHTML(selectedEvent.name)}</li>
                    <li><strong>Merit Type:</strong> ${sanitizeHTML(getMeritType())}</li>
                    <li><strong>Records to upload:</strong> ${validRecords.length}</li>
                    <li><strong>Total merit points:</strong> ${validRecords.reduce((sum, record) => sum + record.meritPoints, 0)}</li>
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
    showStep(4);
}

async function confirmUpload() {
    if (validRecords.length === 0) {
        showToast('No valid records to upload', 'error');
        return;
    }
    
    // Display upload summary first
    updateUploadSummary();
    showStep(5);
}

async function finalizeUpload() {
    if (validRecords.length === 0) {
        showToast('No valid records to upload', 'error');
        return;
    }
    
    const confirmed = confirm(`Are you sure you want to upload ${validRecords.length} merit records?`);
    if (!confirmed) return;
    
    try {
        // Show progress
        hideSteps([1, 2, 3, 4, 5]);
        document.getElementById('uploadProgress').classList.remove('d-none');
        
        await uploadMeritRecords();
        
        showToast('Merit records uploaded successfully!', 'success');
        
        // Redirect after a delay
        setTimeout(() => {
            window.location.href = `events.html`;
        }, 2000);
        
    } catch (error) {
        console.error('Error uploading merit records:', error);
        showToast('Error uploading merit records: ' + error.message, 'error');
        showStep(5);
        document.getElementById('uploadProgress').classList.add('d-none');
    }
}

async function uploadMeritRecords() {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    let uploaded = 0;
    const total = validRecords.length;
    
    for (const record of validRecords) {
        try {
            // Find or create user
            const userId = await findOrCreateUser(record);
            // Create merit record
            const meritId = generateId();
            const meritData = {
                id: meritId,
                name: record.name,
                matricNumber: record.matricNumber.toUpperCase(),
                role: record.role,
                meritPoints: record.meritPoints,
                additionalNotes: record.additionalNotes,
                linkProof: record.linkProof,
                meritType: getMeritType(),
                eventLevel: selectedEvent.level,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: getCurrentUser().uid
            };
            // Save merit record in Firestore (nested structure)
            const userMeritsDoc = firestore.collection('userMerits').doc(userId);
            // Get current merits for this user
            const userMeritsSnap = await userMeritsDoc.get();
            let userMerits = userMeritsSnap.exists ? userMeritsSnap.data() : {};
            if (!userMerits[selectedEvent.id]) userMerits[selectedEvent.id] = {};
            userMerits[selectedEvent.id][meritId] = meritData;
            await userMeritsDoc.set(userMerits);
            uploaded++;
            // Update progress
            const percentage = (uploaded / total) * 100;
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${uploaded} of ${total} records uploaded`;
        } catch (error) {
            console.error(`Error uploading record for ${record.name}:`, error);
            // Continue with next record
        }
    }
}

async function findOrCreateUser(record) {
    try {
        // Search for existing user by matric number
        const usersSnapshot = await firestore.collection('users').where('matricNumber', '==', record.matricNumber.toUpperCase()).get();
        if (!usersSnapshot.empty) {
            // User exists, return the first match
            return usersSnapshot.docs[0].id;
        } else {
            // Create new user record
            const userId = generateId();
            const userData = {
                matricNumber: record.matricNumber.toUpperCase(),
                displayName: record.name,
                role: 'student',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: getCurrentUser().uid,
                isImported: true
            };
            await firestore.collection('users').doc(userId).set(userData);
            return userId;
        }
    } catch (error) {
        console.error('Error finding/creating user:', error);
        throw error;
    }
}

function clearFile() {
    document.getElementById('excelFile').value = '';
    document.getElementById('processFileBtn').disabled = true;
    hideSteps([4, 5]);
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
    document.getElementById(`step${stepNumber}`).classList.remove('d-none');
}

function hideSteps(stepNumbers) {
    stepNumbers.forEach(stepNumber => {
        document.getElementById(`step${stepNumber}`).classList.add('d-none');
    });
}

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

    // Load events and merit values
    loadEvents();
    loadMeritValues();
    
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
    document.getElementById('confirmUploadBtn').addEventListener('click', confirmUpload);
    document.getElementById('backToPreviewBtn').addEventListener('click', backToPreview);
}

async function loadEvents() {
    try {
        const eventsSnapshot = await db.collection('events').get();
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
        const meritValuesDoc = await db.collection('meritValues').doc('main').get();
        meritValues = meritValuesDoc.exists ? meritValuesDoc.data() : {};
    } catch (error) {
        console.error('Error loading merit values:', error);
    }
}

async function handleEventSelect() {
    const eventId = document.getElementById('eventSelect').value;
    
    if (!eventId) {
        hideSteps([2, 3, 4, 5]);
        return;
    }
    
    try {
        // Load event details
        const eventDoc = await db.collection('events').doc(eventId).get();
        selectedEvent = { id: eventId, ...eventDoc.data() };
        // Display event info
        displayEventInfo();
        showStep(2);
    } catch (error) {
        console.error('Error loading event:', error);
        showToast('Error loading event details', 'error');
    }
}

function displayEventInfo() {
    const eventInfo = document.getElementById('eventInfo');
    const eventDetails = document.getElementById('eventDetails');
    
    eventDetails.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div><strong>Event:</strong> ${sanitizeHTML(selectedEvent.name)}</div>
            <div><strong>Level:</strong> ${sanitizeHTML(selectedEvent.level)}</div>
            <div><strong>Date:</strong> ${formatDate(selectedEvent.date)}</div>
            <div><strong>Location:</strong> ${sanitizeHTML(selectedEvent.location || 'Not specified')}</div>
        </div>
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
    const requiredColumns = ['Name', 'Matric Number', 'Role'];
    
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
            if (lowerHeader.includes('name')) columnMap.name = index;
            if (lowerHeader.includes('matric')) columnMap.matricNumber = index;
            if (lowerHeader.includes('role')) columnMap.role = index;
            if (lowerHeader.includes('note') || lowerHeader.includes('additional')) columnMap.additionalNotes = index;
            if (lowerHeader.includes('link') || lowerHeader.includes('proof')) columnMap.linkProof = index;
            if (lowerHeader.includes('date') || lowerHeader.includes('time')) columnMap.dateTime = index;
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
            role: row[columnMap.role] || '',
            additionalNotes: row[columnMap.additionalNotes] || '',
            linkProof: row[columnMap.linkProof] || '',
            dateTime: row[columnMap.dateTime] || '',
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
        
        if (!record.role.trim()) {
            issues.push('Role is required');
        }
        
        // Calculate merit points
        const meritType = getMeritType();
        const roleToUse = meritType || record.role;
        record.meritPoints = calculateMeritPoints(roleToUse, selectedEvent.level, record.additionalNotes, meritValues);
        
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
    
    tableBody.innerHTML = allRecords.map(record => {
        const statusClass = record.issues.length === 0 ? 'status-valid' : 'status-error';
        const statusIcon = record.issues.length === 0 ? '✓' : '✗';
        
        return `
            <tr class="${record.issues.length > 0 ? 'bg-red-50' : ''}">
                <td>
                    <span class="status-icon ${statusClass}">${statusIcon}</span>
                </td>
                <td>${sanitizeHTML(record.name)}</td>
                <td>${sanitizeHTML(record.matricNumber)}</td>
                <td>${sanitizeHTML(record.role)}</td>
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

function confirmUpload() {
    if (validRecords.length === 0) {
        showToast('No valid records to upload', 'error');
        return;
    }
    
    // Display upload summary
    const summaryContainer = document.getElementById('uploadSummary');
    summaryContainer.innerHTML = `
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
    
    showStep(5);
}

function backToPreview() {
    showStep(4);
}

async function confirmUpload() {
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
            const userMeritsDoc = db.collection('userMerits').doc(userId);
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
        const usersSnapshot = await db.collection('users').where('matricNumber', '==', record.matricNumber.toUpperCase()).get();
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
            await db.collection('users').doc(userId).set(userData);
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
        ['Date/Time', 'Name', 'Matric Number', 'Role', 'Additional Notes', 'Link Proof'],
        ['2024-01-15 14:00', 'Ahmad Bin Ali', 'A12345678', 'Peserta', 'Champion', 'https://example.com/proof'],
        ['2024-01-15 14:00', 'Siti Binti Hassan', 'A87654321', 'AJK', 'Committee Member', ''],
        ['2024-01-15 14:00', 'Chong Wei Ming', 'A11223344', 'Penonton', '', '']
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

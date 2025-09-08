// Merit Values Configuration functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
    setupEventListeners();
});

let currentMeritValues = {
    roles: {},
    achievements: {}
};

let editingRole = null;
let editingAchievement = null;

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Load merit values
    loadMeritValues();
}

function setupEventListeners() {
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });
    
    // Role management
    document.getElementById('addRoleBtn').addEventListener('click', () => openRoleModal());
    document.getElementById('saveRoleBtn').addEventListener('click', saveRole);
    
    // Achievement management
    document.getElementById('addAchievementBtn').addEventListener('click', () => openAchievementModal());
    document.getElementById('saveAchievementBtn').addEventListener('click', saveAchievement);
    
    // Import/Export
    document.getElementById('exportJsonBtn').addEventListener('click', exportAsJson);
    document.getElementById('exportCsvBtn').addEventListener('click', exportAsCsv);
    document.getElementById('importBtn').addEventListener('click', importConfiguration);
    document.getElementById('loadDefaultBtn').addEventListener('click', loadDefaultValues);
    document.getElementById('resetAllBtn').addEventListener('click', resetAllValues);
    
    // Save changes
    document.getElementById('saveChangesBtn').addEventListener('click', saveAllChanges);
    document.getElementById('previewBtn').addEventListener('click', previewChanges);
}

function switchTab(e) {
    const tabName = e.target.dataset.tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('d-none'));
    document.getElementById(tabName + 'Tab').classList.remove('d-none');
}

async function loadMeritValues() {
    try {
        showLoading();
        
        const meritValuesRef = database.ref('meritValues');
        const snapshot = await meritValuesRef.once('value');
        const data = snapshot.val();
        
        if (data) {
            currentMeritValues = data;
        } else {
            // Initialize with default values if none exist
            currentMeritValues = getDefaultMeritValues();
        }
        
        displayRoles();
        displayAchievements();
        
    } catch (error) {
        console.error('Error loading merit values:', error);
        showToast('Error loading merit values', 'error');
    } finally {
        hideLoading();
    }
}

function displayRoles() {
    const tableBody = document.getElementById('rolesTableBody');
    const roles = currentMeritValues.roles || {};
    
    if (Object.keys(roles).length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-secondary">No roles configured. Click "Add Role" to start.</td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = Object.entries(roles).map(([roleName, levels]) => `
        <tr>
            <td class="font-medium">${sanitizeHTML(roleName)}</td>
            <td>${levels.University || 0}</td>
            <td>${levels.Faculty || 0}</td>
            <td>${levels.College || 0}</td>
            <td>${levels.Club || 0}</td>
            <td>${levels.External || 0}</td>
            <td>
                <div class="flex gap-1">
                    <button onclick="editRole('${roleName}')" class="btn btn-outline btn-sm">Edit</button>
                    <button onclick="deleteRole('${roleName}')" class="btn btn-danger btn-sm">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function displayAchievements() {
    const tableBody = document.getElementById('achievementsTableBody');
    const achievements = currentMeritValues.achievements || {};
    
    if (Object.keys(achievements).length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-secondary">No achievements configured. Click "Add Achievement" to start.</td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = Object.entries(achievements).map(([achievementName, levels]) => `
        <tr>
            <td class="font-medium">${sanitizeHTML(achievementName)}</td>
            <td>${levels.University || 0}</td>
            <td>${levels.Faculty || 0}</td>
            <td>${levels.College || 0}</td>
            <td>${levels.Club || 0}</td>
            <td>${levels.External || 0}</td>
            <td>
                <div class="flex gap-1">
                    <button onclick="editAchievement('${achievementName}')" class="btn btn-outline btn-sm">Edit</button>
                    <button onclick="deleteAchievement('${achievementName}')" class="btn btn-danger btn-sm">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openRoleModal(roleName = null) {
    editingRole = roleName;
    const modal = document.getElementById('roleModal');
    const title = document.getElementById('roleModalTitle');
    const form = document.getElementById('roleForm');
    
    if (roleName) {
        title.textContent = 'Edit Role';
        const roleData = currentMeritValues.roles[roleName];
        document.getElementById('roleName').value = roleName;
        document.getElementById('roleUniversity').value = roleData.University || 0;
        document.getElementById('roleFaculty').value = roleData.Faculty || 0;
        document.getElementById('roleCollege').value = roleData.College || 0;
        document.getElementById('roleClub').value = roleData.Club || 0;
        document.getElementById('roleExternal').value = roleData.External || 0;
        document.getElementById('roleName').disabled = true;
    } else {
        title.textContent = 'Add Role';
        form.reset();
        document.getElementById('roleName').disabled = false;
    }
    
    modal.classList.remove('d-none');
}

function closeRoleModal() {
    document.getElementById('roleModal').classList.add('d-none');
    editingRole = null;
}

function saveRole() {
    const roleName = document.getElementById('roleName').value.trim();
    const university = parseInt(document.getElementById('roleUniversity').value) || 0;
    const faculty = parseInt(document.getElementById('roleFaculty').value) || 0;
    const college = parseInt(document.getElementById('roleCollege').value) || 0;
    const club = parseInt(document.getElementById('roleClub').value) || 0;
    const external = parseInt(document.getElementById('roleExternal').value) || 0;
    
    if (!roleName) {
        showToast('Please enter a role name', 'error');
        return;
    }
    
    // Check for duplicate role names (only when adding new)
    if (!editingRole && currentMeritValues.roles[roleName]) {
        showToast('Role name already exists', 'error');
        return;
    }
    
    // Remove old role if editing
    if (editingRole && editingRole !== roleName) {
        delete currentMeritValues.roles[editingRole];
    }
    
    currentMeritValues.roles[roleName] = {
        University: university,
        Faculty: faculty,
        College: college,
        Club: club,
        External: external
    };
    
    displayRoles();
    closeRoleModal();
    showToast('Role saved successfully', 'success');
}

function editRole(roleName) {
    openRoleModal(roleName);
}

function deleteRole(roleName) {
    if (confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
        delete currentMeritValues.roles[roleName];
        displayRoles();
        showToast('Role deleted successfully', 'success');
    }
}

function openAchievementModal(achievementName = null) {
    editingAchievement = achievementName;
    const modal = document.getElementById('achievementModal');
    const title = document.getElementById('achievementModalTitle');
    const form = document.getElementById('achievementForm');
    
    if (achievementName) {
        title.textContent = 'Edit Achievement';
        const achievementData = currentMeritValues.achievements[achievementName];
        document.getElementById('achievementName').value = achievementName;
        document.getElementById('achievementUniversity').value = achievementData.University || 0;
        document.getElementById('achievementFaculty').value = achievementData.Faculty || 0;
        document.getElementById('achievementCollege').value = achievementData.College || 0;
        document.getElementById('achievementClub').value = achievementData.Club || 0;
        document.getElementById('achievementExternal').value = achievementData.External || 0;
        document.getElementById('achievementName').disabled = true;
    } else {
        title.textContent = 'Add Achievement';
        form.reset();
        document.getElementById('achievementName').disabled = false;
    }
    
    modal.classList.remove('d-none');
}

function closeAchievementModal() {
    document.getElementById('achievementModal').classList.add('d-none');
    editingAchievement = null;
}

function saveAchievement() {
    const achievementName = document.getElementById('achievementName').value.trim();
    const university = parseInt(document.getElementById('achievementUniversity').value) || 0;
    const faculty = parseInt(document.getElementById('achievementFaculty').value) || 0;
    const college = parseInt(document.getElementById('achievementCollege').value) || 0;
    const club = parseInt(document.getElementById('achievementClub').value) || 0;
    const external = parseInt(document.getElementById('achievementExternal').value) || 0;
    
    if (!achievementName) {
        showToast('Please enter an achievement name', 'error');
        return;
    }
    
    // Check for duplicate achievement names (only when adding new)
    if (!editingAchievement && currentMeritValues.achievements[achievementName]) {
        showToast('Achievement name already exists', 'error');
        return;
    }
    
    // Remove old achievement if editing
    if (editingAchievement && editingAchievement !== achievementName) {
        delete currentMeritValues.achievements[editingAchievement];
    }
    
    currentMeritValues.achievements[achievementName] = {
        University: university,
        Faculty: faculty,
        College: college,
        Club: club,
        External: external
    };
    
    displayAchievements();
    closeAchievementModal();
    showToast('Achievement saved successfully', 'success');
}

function editAchievement(achievementName) {
    openAchievementModal(achievementName);
}

function deleteAchievement(achievementName) {
    if (confirm(`Are you sure you want to delete the achievement "${achievementName}"?`)) {
        delete currentMeritValues.achievements[achievementName];
        displayAchievements();
        showToast('Achievement deleted successfully', 'success');
    }
}

async function saveAllChanges() {
    try {
        showLoading();
        
        await database.ref('meritValues').set(currentMeritValues);
        
        showToast('All changes saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving changes:', error);
        showToast('Error saving changes: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function previewChanges() {
    const preview = {
        roles: currentMeritValues.roles,
        achievements: currentMeritValues.achievements,
        totalRoles: Object.keys(currentMeritValues.roles).length,
        totalAchievements: Object.keys(currentMeritValues.achievements).length
    };
    
    console.log('Merit Values Preview:', preview);
    showToast('Preview logged to console', 'info');
}

function exportAsJson() {
    const dataStr = JSON.stringify(currentMeritValues, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `merit-values-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Configuration exported as JSON', 'success');
}

function exportAsCsv() {
    // Export roles as CSV
    const rolesData = Object.entries(currentMeritValues.roles).map(([name, levels]) => ({
        Type: 'Role',
        Name: name,
        University: levels.University || 0,
        Faculty: levels.Faculty || 0,
        College: levels.College || 0,
        Club: levels.Club || 0,
        External: levels.External || 0
    }));
    
    // Export achievements as CSV
    const achievementsData = Object.entries(currentMeritValues.achievements).map(([name, levels]) => ({
        Type: 'Achievement',
        Name: name,
        University: levels.University || 0,
        Faculty: levels.Faculty || 0,
        College: levels.College || 0,
        Club: levels.Club || 0,
        External: levels.External || 0
    }));
    
    const combinedData = [...rolesData, ...achievementsData];
    exportToCSV(combinedData, `merit-values-${new Date().toISOString().split('T')[0]}.csv`);
    showToast('Configuration exported as CSV', 'success');
}

function importConfiguration() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file to import', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Validate structure
            if (!importedData.roles && !importedData.achievements) {
                throw new Error('Invalid file format');
            }
            
            if (confirm('This will replace all current merit values. Are you sure?')) {
                currentMeritValues = importedData;
                displayRoles();
                displayAchievements();
                showToast('Configuration imported successfully', 'success');
            }
            
        } catch (error) {
            console.error('Error importing file:', error);
            showToast('Error importing file: ' + error.message, 'error');
        }
    };
    
    reader.readAsText(file);
}

function loadDefaultValues() {
    if (confirm('This will replace all current values with default values. Are you sure?')) {
        currentMeritValues = getDefaultMeritValues();
        displayRoles();
        displayAchievements();
        showToast('Default values loaded', 'success');
    }
}

function resetAllValues() {
    if (confirm('This will delete all merit values. Are you sure?')) {
        currentMeritValues = { roles: {}, achievements: {} };
        displayRoles();
        displayAchievements();
        showToast('All values reset', 'success');
    }
}

function getDefaultMeritValues() {
    return {
        roles: {
            'Peserta': {
                University: 15,
                Faculty: 12,
                College: 8,
                Club: 5,
                External: 20
            },
            'AJK': {
                University: 25,
                Faculty: 20,
                College: 15,
                Club: 10,
                External: 30
            },
            'Penonton': {
                University: 5,
                Faculty: 4,
                College: 3,
                Club: 2,
                External: 8
            },
            'Sukarelawanan': {
                University: 10,
                Faculty: 8,
                College: 6,
                Club: 4,
                External: 12
            }
        },
        achievements: {
            'Champion': {
                University: 50,
                Faculty: 40,
                College: 30,
                Club: 20,
                External: 60
            },
            'Second Place': {
                University: 35,
                Faculty: 28,
                College: 21,
                Club: 14,
                External: 42
            },
            'Third Place': {
                University: 25,
                Faculty: 20,
                College: 15,
                Club: 10,
                External: 30
            },
            'Participation': {
                University: 10,
                Faculty: 8,
                College: 6,
                Club: 4,
                External: 12
            }
        }
    };
}

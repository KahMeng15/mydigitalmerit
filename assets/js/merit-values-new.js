// New Merit Values Configuration functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
    setupEventListeners();
});

let currentEventMeritValues = {
    committee: {},
    nonCommittee: {}
};

let currentCompetitionMeritValues = {};
let editingEventRole = null;
let editingCompetitionRole = null;

// Event levels mapping
const eventLevels = ['college', 'block', 'university', 'national', 'international'];
const competitionLevels = ['college', 'block', 'faculty', 'university', 'interuniversity', 'state', 'national', 'international'];

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }

    // Load merit values
    loadEventMeritValues();
    loadCompetitionMeritValues();
}

function setupEventListeners() {
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });
    
    // Event Merit management
    document.getElementById('addCommitteeRoleBtn').addEventListener('click', () => openEventMeritModal('committee'));
    document.getElementById('addNonCommitteeRoleBtn').addEventListener('click', () => openEventMeritModal('non-committee'));
    document.getElementById('saveEventMeritBtn').addEventListener('click', saveEventMeritRole);
    
    // Competition Merit management
    document.getElementById('addCompetitionBtn').addEventListener('click', () => openCompetitionMeritModal());
    document.getElementById('saveCompetitionMeritBtn').addEventListener('click', saveCompetitionMeritRole);
    
    // Migration tools
    document.getElementById('createDefaultEventMeritsBtn').addEventListener('click', createDefaultEventMerits);
    document.getElementById('createDefaultCompetitionMeritsBtn').addEventListener('click', createDefaultCompetitionMerits);
    document.getElementById('checkMigrationStatusBtn').addEventListener('click', checkMigrationStatus);
    
    // Import/Export (existing functionality)
    document.getElementById('exportJsonBtn').addEventListener('click', exportAsJson);
    document.getElementById('exportCsvBtn').addEventListener('click', exportAsCsv);
    document.getElementById('importBtn').addEventListener('click', importConfiguration);
    
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

// Event Merit Values Functions
async function loadEventMeritValues() {
    try {
        showLoading();

        const snapshot = await firestore.collection('eventMeritValues').get();
        const committee = {};
        const nonCommittee = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            if (doc.id === 'committee') {
                Object.assign(committee, data);
            } else if (doc.id === 'nonCommittee') {
                Object.assign(nonCommittee, data);
            }
        });

        currentEventMeritValues = { committee, nonCommittee };
        displayEventMeritRoles();

    } catch (error) {
        console.error('Error loading event merit values:', error);
        showToast('Error loading event merit values', 'error');
    } finally {
        hideLoading();
    }
}

async function loadCompetitionMeritValues() {
    try {
        showLoading();

        const snapshot = await firestore.collection('competitionMeritValues').get();
        const competitions = {};

        snapshot.forEach(doc => {
            competitions[doc.id] = doc.data();
        });

        currentCompetitionMeritValues = competitions;
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error loading competition merit values:', error);
        showToast('Error loading competition merit values', 'error');
    } finally {
        hideLoading();
    }
}

function displayEventMeritRoles() {
    displayCommitteeRoles();
    displayNonCommitteeRoles();
}

function displayCommitteeRoles() {
    const tbody = document.getElementById('committeeTableBody');
    let html = '';

    const committeeRoles = currentEventMeritValues.committee;
    
    if (Object.keys(committeeRoles).length === 0) {
        html = '<tr><td colspan="11" class="text-center text-secondary">No committee roles defined</td></tr>';
    } else {
        Object.entries(committeeRoles).forEach(([roleKey, roleData]) => {
            html += `
                <tr data-role="${roleKey}" data-category="committee">
                    <td class="font-medium">${roleData.nameBM || roleKey}</td>
                    <td class="text-secondary">${roleData.nameEN || roleKey}</td>
                    <td class="text-center">${roleData.college || 0}</td>
                    <td class="text-center">${roleData.block || 0}</td>
                    <td class="text-center">${roleData.university || 0}</td>
                    <td class="text-center">${roleData.national || 0}</td>
                    <td class="text-center">${roleData.international || 0}</td>
                    <td>
                        <div class="flex gap-2">
                            <button onclick="editEventMeritRole('${roleKey}', 'committee')" 
                                    class="btn btn-outline btn-sm" style="cursor: pointer" title="Edit">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="deleteEventMeritRole('${roleKey}', 'committee')" 
                                    class="btn btn-danger btn-sm" style="cursor: pointer" title="Delete">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    tbody.innerHTML = html;
}

function displayNonCommitteeRoles() {
    const tbody = document.getElementById('nonCommitteeTableBody');
    let html = '';

    const nonCommitteeRoles = currentEventMeritValues.nonCommittee;
    
    if (Object.keys(nonCommitteeRoles).length === 0) {
        html = '<tr><td colspan="11" class="text-center text-secondary">No non-committee roles defined</td></tr>';
    } else {
        Object.entries(nonCommitteeRoles).forEach(([roleKey, roleData]) => {
            html += `
                <tr data-role="${roleKey}" data-category="non-committee">
                    <td class="font-medium">${roleData.nameBM || roleKey}</td>
                    <td class="text-secondary">${roleData.nameEN || roleKey}</td>
                    <td class="text-center">${roleData.college || 0}</td>
                    <td class="text-center">${roleData.block || 0}</td>
                    <td class="text-center">${roleData.university || 0}</td>
                    <td class="text-center">${roleData.national || 0}</td>
                    <td class="text-center">${roleData.international || 0}</td>
                    <td>
                        <div class="flex gap-2">
                            <button onclick="editEventMeritRole('${roleKey}', 'non-committee')" 
                                    class="btn btn-outline btn-sm" style="cursor: pointer" title="Edit">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="deleteEventMeritRole('${roleKey}', 'non-committee')" 
                                    class="btn btn-danger btn-sm" style="cursor: pointer" title="Delete">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    tbody.innerHTML = html;
}

function displayCompetitionMeritRoles() {
    const tbody = document.getElementById('competitionTableBody');
    let html = '';

    if (Object.keys(currentCompetitionMeritValues).length === 0) {
        html = '<tr><td colspan="11" class="text-center text-secondary">No competition achievements defined</td></tr>';
    } else {
        Object.entries(currentCompetitionMeritValues).forEach(([achievementKey, achievementData]) => {
            html += `
                <tr data-achievement="${achievementKey}">
                    <td class="font-medium">${achievementData.nameBM || achievementKey}</td>
                    <td class="text-secondary">${achievementData.nameEN || achievementKey}</td>
                    <td class="text-center">${achievementData.college || 0}</td>
                    <td class="text-center">${achievementData.block || 0}</td>
                    <td class="text-center">${achievementData.faculty || 0}</td>
                    <td class="text-center">${achievementData.university || 0}</td>
                    <td class="text-center">${achievementData.interuniversity || 0}</td>
                    <td class="text-center">${achievementData.state || 0}</td>
                    <td class="text-center">${achievementData.national || 0}</td>
                    <td class="text-center">${achievementData.international || 0}</td>
                    <td>
                        <div class="flex gap-2">
                            <button onclick="editCompetitionMeritRole('${achievementKey}')" 
                                    class="btn btn-outline btn-sm" style="cursor: pointer" title="Edit">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="deleteCompetitionMeritRole('${achievementKey}')" 
                                    class="btn btn-danger btn-sm" style="cursor: pointer" title="Delete">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    tbody.innerHTML = html;
}

// Modal Functions
function openEventMeritModal(category = null) {
    editingEventRole = null;
    document.getElementById('eventMeritModalTitle').textContent = 'Add Event Merit Role';
    
    // Reset form
    document.getElementById('eventMeritForm').reset();
    
    // Set category if provided
    if (category) {
        document.getElementById('eventRoleCategory').value = category;
    }
    
    document.getElementById('eventMeritModal').classList.remove('d-none');
}

function closeEventMeritModal() {
    document.getElementById('eventMeritModal').classList.add('d-none');
}

function openCompetitionMeritModal() {
    editingCompetitionRole = null;
    document.getElementById('competitionMeritModalTitle').textContent = 'Add Competition Achievement';
    
    // Reset form
    document.getElementById('competitionMeritForm').reset();
    
    document.getElementById('competitionMeritModal').classList.remove('d-none');
}

function closeCompetitionMeritModal() {
    document.getElementById('competitionMeritModal').classList.add('d-none');
}

function editEventMeritRole(roleKey, category) {
    const roleData = currentEventMeritValues[category === 'committee' ? 'committee' : 'nonCommittee'][roleKey];
    
    if (!roleData) return;
    
    editingEventRole = { key: roleKey, category };
    document.getElementById('eventMeritModalTitle').textContent = 'Edit Event Merit Role';
    
    // Populate form
    document.getElementById('eventRoleNameBM').value = roleData.nameBM || '';
    document.getElementById('eventRoleNameEN').value = roleData.nameEN || '';
    document.getElementById('eventRoleCategory').value = category;
    
    eventLevels.forEach(level => {
        const element = document.getElementById('eventRole' + level.charAt(0).toUpperCase() + level.slice(1));
        if (element) {
            element.value = roleData[level] || 0;
        }
    });
    
    document.getElementById('eventMeritModal').classList.remove('d-none');
}

function editCompetitionMeritRole(achievementKey) {
    const achievementData = currentCompetitionMeritValues[achievementKey];
    
    if (!achievementData) return;
    
    editingCompetitionRole = achievementKey;
    document.getElementById('competitionMeritModalTitle').textContent = 'Edit Competition Achievement';
    
    // Populate form
    document.getElementById('competitionNameBM').value = achievementData.nameBM || '';
    document.getElementById('competitionNameEN').value = achievementData.nameEN || '';
    
    competitionLevels.forEach(level => {
        const fieldName = level.charAt(0).toUpperCase() + level.slice(1);
        const element = document.getElementById('competition' + fieldName);
        if (element) {
            element.value = achievementData[level] || 0;
        }
    });
    
    document.getElementById('competitionMeritModal').classList.remove('d-none');
}

async function saveEventMeritRole() {
    try {
        const form = document.getElementById('eventMeritForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        showLoading();

        const nameBM = document.getElementById('eventRoleNameBM').value.trim();
        const nameEN = document.getElementById('eventRoleNameEN').value.trim();
        const category = document.getElementById('eventRoleCategory').value;

        if (!nameBM || !nameEN || !category) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        const roleData = {
            nameBM,
            nameEN
        };

        // Add level values
        eventLevels.forEach(level => {
            const element = document.getElementById('eventRole' + level.charAt(0).toUpperCase() + level.slice(1));
            if (element) {
                roleData[level] = parseInt(element.value) || 0;
            }
        });

        const roleKey = editingEventRole ? editingEventRole.key : generateRoleKey(nameBM);
        const collectionPath = category === 'committee' ? 'committee' : 'nonCommittee';

        // Update local data
        if (!currentEventMeritValues[collectionPath]) {
            currentEventMeritValues[collectionPath] = {};
        }
        currentEventMeritValues[collectionPath][roleKey] = roleData;

        // Save to Firestore
        await firestore.collection('eventMeritValues').doc(collectionPath).set({
            [roleKey]: roleData
        }, { merge: true });

        showToast('Event merit role saved successfully', 'success');
        closeEventMeritModal();
        displayEventMeritRoles();

    } catch (error) {
        console.error('Error saving event merit role:', error);
        showToast('Error saving role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function saveCompetitionMeritRole() {
    try {
        const form = document.getElementById('competitionMeritForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        showLoading();

        const nameBM = document.getElementById('competitionNameBM').value.trim();
        const nameEN = document.getElementById('competitionNameEN').value.trim();

        if (!nameBM || !nameEN) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        const achievementData = {
            nameBM,
            nameEN
        };

        // Add level values
        competitionLevels.forEach(level => {
            const fieldName = level.charAt(0).toUpperCase() + level.slice(1);
            const element = document.getElementById('competition' + fieldName);
            if (element) {
                achievementData[level] = parseInt(element.value) || 0;
            }
        });

        const achievementKey = editingCompetitionRole || generateRoleKey(nameBM);

        // Update local data
        currentCompetitionMeritValues[achievementKey] = achievementData;

        // Save to Firestore
        await firestore.collection('competitionMeritValues').doc(achievementKey).set(achievementData);

        showToast('Competition achievement saved successfully', 'success');
        closeCompetitionMeritModal();
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error saving competition achievement:', error);
        showToast('Error saving achievement: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteEventMeritRole(roleKey, category) {
    if (!confirm('Are you sure you want to delete this role?')) {
        return;
    }

    try {
        showLoading();

        const collectionPath = category === 'committee' ? 'committee' : 'nonCommittee';

        // Remove from local data
        delete currentEventMeritValues[collectionPath][roleKey];

        // Remove from Firestore
        await firestore.collection('eventMeritValues').doc(collectionPath).update({
            [roleKey]: firebase.firestore.FieldValue.delete()
        });

        showToast('Role deleted successfully', 'success');
        displayEventMeritRoles();

    } catch (error) {
        console.error('Error deleting role:', error);
        showToast('Error deleting role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteCompetitionMeritRole(achievementKey) {
    if (!confirm('Are you sure you want to delete this achievement?')) {
        return;
    }

    try {
        showLoading();

        // Remove from local data
        delete currentCompetitionMeritValues[achievementKey];

        // Remove from Firestore
        await firestore.collection('competitionMeritValues').doc(achievementKey).delete();

        showToast('Achievement deleted successfully', 'success');
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error deleting achievement:', error);
        showToast('Error deleting achievement: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Migration Functions
async function createDefaultEventMerits() {
    try {
        showLoading();

        const defaultCommitteeRoles = {
            pengarah: {
                nameBM: 'Pengarah',
                nameEN: 'Director',
                college: 5, block: 8, university: 12, national: 18, international: 20
            },
            timbPengarah: {
                nameBM: 'Timb. Pengarah',
                nameEN: 'Deputy Director',
                college: 4, block: 6, university: 10, national: 16, international: 19
            },
            setiausaha: {
                nameBM: 'Setiausaha',
                nameEN: 'Secretary',
                college: 4, block: 6, university: 8, national: 14, international: 18
            },
            timbSetiausaha: {
                nameBM: 'Timb. Setiausaha',
                nameEN: 'Deputy Secretary',
                college: 3, block: 5, university: 8, national: 14, international: 17
            },
            bendahari: {
                nameBM: 'Bendahari',
                nameEN: 'Treasurer',
                college: 4, block: 6, university: 8, national: 14, international: 17
            },
            timbBendahari: {
                nameBM: 'Timb. Bendahari',
                nameEN: 'Deputy Treasurer',
                college: 3, block: 5, university: 8, national: 14, international: 16
            },
            ajkMultimedia: {
                nameBM: 'AJK Multimedia',
                nameEN: 'Multimedia Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkPendaftaran: {
                nameBM: 'AJK Pendaftaran',
                nameEN: 'Registration Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkProgram: {
                nameBM: 'AJK Program',
                nameEN: 'Programme Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkProtokol: {
                nameBM: 'AJK Protokol',
                nameEN: 'Protocol Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkPeralatan: {
                nameBM: 'AJK Peralatan',
                nameEN: 'Equipment Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkMakanan: {
                nameBM: 'AJK Makanan',
                nameEN: 'Food Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkKebersihan: {
                nameBM: 'AJK Kebersihan',
                nameEN: 'Cleanliness Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkKeselamatan: {
                nameBM: 'AJK Keselamatan',
                nameEN: 'Security Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkDekorasi: {
                nameBM: 'AJK Dekorasi',
                nameEN: 'Decoration Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkTugasKhas: {
                nameBM: 'AJK Tugas Khas',
                nameEN: 'Special Task Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            },
            ajkPersembahan: {
                nameBM: 'AJK Persembahan',
                nameEN: 'Performance Committee',
                college: 2, block: 3, university: 4, national: 7, international: 8
            }
        };

        const defaultNonCommitteeRoles = {
            peserta: {
                nameBM: 'Peserta',
                nameEN: 'Participant',
                college: 1, block: 2, university: 2, national: 5, international: 6
            },
            penyokong: {
                nameBM: 'Penyokong',
                nameEN: 'Supporter',
                college: 1, block: 1, university: 1, national: 1, international: 1
            },
            sukarelawan: {
                nameBM: 'Sukarelawanan',
                nameEN: 'Volunteer',
                college: 1, block: 2, university: 2, national: 5, international: 6
            }
        };

        // Save to Firestore
        await firestore.collection('eventMeritValues').doc('committee').set(defaultCommitteeRoles);
        await firestore.collection('eventMeritValues').doc('nonCommittee').set(defaultNonCommitteeRoles);

        // Update local data
        currentEventMeritValues.committee = defaultCommitteeRoles;
        currentEventMeritValues.nonCommittee = defaultNonCommitteeRoles;

        showToast('Default event merit values created successfully', 'success');
        displayEventMeritRoles();

    } catch (error) {
        console.error('Error creating default event merits:', error);
        showToast('Error creating default event merits: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function createDefaultCompetitionMerits() {
    try {
        showLoading();

        const defaultCompetitionAchievements = {
            johan: {
                nameBM: 'Johan',
                nameEN: 'Champion',
                college: 5, block: 10, faculty: 10, university: 12, interuniversity: 14, state: 16, national: 18, international: 20
            },
            naibJohan: {
                nameBM: 'Naib Johan', 
                nameEN: 'Runner-up',
                college: 4, block: 8, faculty: 8, university: 10, interuniversity: 12, state: 14, national: 16, international: 19
            },
            ketiga: {
                nameBM: 'Ketiga',
                nameEN: 'Third Place',
                college: 4, block: 8, faculty: 6, university: 8, interuniversity: 10, state: 12, national: 14, international: 18
            },
            penyertaan: {
                nameBM: 'Penyertaan',
                nameEN: 'Participation',
                college: 1, block: 2, faculty: 1, university: 2, interuniversity: 3, state: 4, national: 5, international: 6
            }
        };

        // Save each achievement as separate document
        const batch = firestore.batch();
        Object.entries(defaultCompetitionAchievements).forEach(([key, data]) => {
            const docRef = firestore.collection('competitionMeritValues').doc(key);
            batch.set(docRef, data);
        });
        
        await batch.commit();

        // Update local data
        currentCompetitionMeritValues = defaultCompetitionAchievements;

        showToast('Default competition merit values created successfully', 'success');
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error creating default competition merits:', error);
        showToast('Error creating default competition merits: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function checkMigrationStatus() {
    try {
        showLoading();

        const statusDiv = document.getElementById('migrationStatus');
        let statusHtml = '<div class="space-y-2">';

        // Check eventMeritValues collection
        const eventSnapshot = await firestore.collection('eventMeritValues').get();
        const eventDocsCount = eventSnapshot.size;
        statusHtml += `<div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${eventDocsCount > 0 ? 'bg-green-500' : 'bg-red-500'}"></span>
            <span>Event Merit Values: ${eventDocsCount} documents</span>
        </div>`;

        // Check competitionMeritValues collection
        const compSnapshot = await firestore.collection('competitionMeritValues').get();
        const compDocsCount = compSnapshot.size;
        statusHtml += `<div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${compDocsCount > 0 ? 'bg-green-500' : 'bg-red-500'}"></span>
            <span>Competition Merit Values: ${compDocsCount} documents</span>
        </div>`;

        // Check old meritvalue collection
        const oldSnapshot = await firestore.collection('meritvalue').get();
        const oldDocsCount = oldSnapshot.size;
        statusHtml += `<div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${oldDocsCount > 0 ? 'bg-yellow-500' : 'bg-gray-400'}"></span>
            <span>Legacy Merit Values: ${oldDocsCount} documents</span>
        </div>`;

        statusHtml += '</div>';
        statusDiv.innerHTML = statusHtml;

    } catch (error) {
        console.error('Error checking migration status:', error);
        document.getElementById('migrationStatus').innerHTML = 
            '<div class="text-red-600">Error checking status</div>';
    } finally {
        hideLoading();
    }
}

// Utility Functions
function generateRoleKey(name) {
    return name.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);
}

// Placeholder functions for existing functionality
function exportAsJson() {
    const data = {
        eventMerits: currentEventMeritValues,
        competitionMerits: currentCompetitionMeritValues
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merit-values-export.json';
    a.click();
    URL.revokeObjectURL(url);
}

function exportAsCsv() {
    showToast('CSV export functionality coming soon', 'info');
}

function importConfiguration() {
    showToast('Import functionality coming soon', 'info');
}

function previewChanges() {
    showToast('Preview functionality coming soon', 'info');
}

async function saveAllChanges() {
    showToast('All changes are saved automatically', 'success');
}

// Make functions globally available
window.openEventMeritModal = openEventMeritModal;
window.closeEventMeritModal = closeEventMeritModal;
window.openCompetitionMeritModal = openCompetitionMeritModal;
window.closeCompetitionMeritModal = closeCompetitionMeritModal;
window.editEventMeritRole = editEventMeritRole;
window.editCompetitionMeritRole = editCompetitionMeritRole;
window.deleteEventMeritRole = deleteEventMeritRole;
window.deleteCompetitionMeritRole = deleteCompetitionMeritRole;
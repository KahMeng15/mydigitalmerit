// Manage Sub-Organizers Page functionality
console.log("manage-sub-organizers.js loaded");

let parentOrganizerId = null;
let parentOrganizerData = null;
let subOrganizers = [];
let currentEditingSubOrganizer = null;
let sortOrder = 'asc'; // 'asc' or 'desc'

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded fired");
    if (!requireAdmin()) return;
    initializePage();
    setupEventListeners();
});

function initializePage() {
    console.log("initializePage called");
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }
    
    // Get parent organizer ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    parentOrganizerId = urlParams.get('parentId');
    
    if (!parentOrganizerId) {
        showToast('No parent organizer specified', 'error');
        setTimeout(() => window.location.href = 'organizers.html', 2000);
        return;
    }
    
    document.getElementById('parentOrganizerId').value = parentOrganizerId;
    loadParentOrganizerData();
    loadSubOrganizers();
}

function setupEventListeners() {
    console.log("setupEventListeners called");
    
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    document.getElementById('subOrganizerForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('cancelSubOrganizerBtn').addEventListener('click', cancelEdit);
}

async function loadParentOrganizerData() {
    try {
        const doc = await firebase.firestore().collection('organizers').doc(parentOrganizerId).get();
        if (doc.exists) {
            parentOrganizerData = { id: doc.id, ...doc.data() };
            document.getElementById('mainOrganizerInfo').textContent = 
                `Managing sub-organizers for: ${parentOrganizerData.name_en} (${parentOrganizerData.name_bm})`;
        } else {
            showToast('Parent organizer not found', 'error');
            setTimeout(() => window.location.href = 'organizers.html', 2000);
        }
    } catch (error) {
        console.error('Error loading parent organizer:', error);
        showToast('Error loading parent organizer data', 'error');
    }
}

async function loadSubOrganizers() {
    try {
        showLoading();
        const querySnapshot = await firebase.firestore()
            .collection('organizers')
            .doc(parentOrganizerId)
            .collection('subOrganizers')
            .get();
        
        subOrganizers = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('Loaded sub-organizers:', subOrganizers);
        displaySubOrganizers();
        
    } catch (error) {
        console.error('Error loading sub-organizers:', error);
        showToast('Error loading sub-organizers', 'error');
    } finally {
        hideLoading();
    }
}

function displaySubOrganizers() {
    const container = document.getElementById('subOrganizersListContainer');
    
    if (subOrganizers.length === 0) {
        container.innerHTML = '<p class="text-secondary">No sub-organizers found. Add one using the form above.</p>';
        document.getElementById('subOrganizerCount').textContent = '0 sub-organizers';
        return;
    }
    
    // Sort alphabetically by English name
    const sortedSubOrganizers = [...subOrganizers].sort((a, b) => {
        const comparison = a.name_en.localeCompare(b.name_en);
        return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    document.getElementById('subOrganizerCount').textContent = `${subOrganizers.length} sub-organizer${subOrganizers.length === 1 ? '' : 's'}`;
    
    container.innerHTML = `
        <div class="space-y-4">
            ${sortedSubOrganizers.map(subOrg => `
                <div class="border border-gray-200 rounded-lg p-4">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <h4 class="font-semibold text-lg">${sanitizeHTML(subOrg.name_en)}</h4>
                            <p class="text-secondary mb-2">${sanitizeHTML(subOrg.name_bm)}</p>
                            <div class="text-sm text-gray-500">
                                ${subOrg.created_by ? `
                                    <p><strong>Added by:</strong> ${sanitizeHTML(subOrg.created_by)}</p>
                                ` : ''}
                                ${subOrg.created_at ? `
                                    <p><strong>Added on:</strong> ${formatDateTime(subOrg.created_at)}</p>
                                ` : ''}
                                ${subOrg.updated_by && subOrg.updated_by !== subOrg.created_by ? `
                                    <p><strong>Last updated by:</strong> ${sanitizeHTML(subOrg.updated_by)}</p>
                                ` : ''}
                                ${subOrg.updated_at && subOrg.updated_at !== subOrg.created_at ? `
                                    <p><strong>Last updated:</strong> ${formatDateTime(subOrg.updated_at)}</p>
                                ` : ''}
                            </div>
                        </div>
                        <div class="flex gap-2 ml-4">
                            <button class="btn btn-outline btn-sm" onclick="editSubOrganizer('${subOrg.id}')">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                                Edit
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteSubOrganizer('${subOrg.id}')">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function handleFormSubmit(e) {
    console.log("Form submit triggered");
    e.preventDefault();
    
    const subId = document.getElementById('subOrganizerId').value;
    const name_en = document.getElementById('subOrganizerNameEn').value.trim();
    const name_bm = document.getElementById('subOrganizerNameBm').value.trim();

    console.log("Form data:", { subId, name_en, name_bm });

    if (!name_en || !name_bm) {
        showToast('Both English and BM names are required.', 'error');
        return;
    }

    try {
        showLoading();
        const currentUser = getCurrentUser();
        
        const subOrganizerData = {
            name_en: name_en,
            name_bm: name_bm,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            updated_by: currentUser.email
        };

        if (subId) {
            // Update existing sub-organizer
            await firebase.firestore()
                .collection('organizers')
                .doc(parentOrganizerId)
                .collection('subOrganizers')
                .doc(subId)
                .update(subOrganizerData);
            showToast('Sub-organizer updated successfully!', 'success');
        } else {
            // Create new sub-organizer
            subOrganizerData.created_at = firebase.firestore.FieldValue.serverTimestamp();
            subOrganizerData.created_by = currentUser.email;
            await firebase.firestore()
                .collection('organizers')
                .doc(parentOrganizerId)
                .collection('subOrganizers')
                .add(subOrganizerData);
            showToast('Sub-organizer added successfully!', 'success');
        }

        // Reset form and reload data
        resetForm();
        await loadSubOrganizers();

    } catch (error) {
        console.error('Error saving sub-organizer:', error);
        showToast('Error saving sub-organizer: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function editSubOrganizer(subId) {
    const subOrganizer = subOrganizers.find(s => s.id === subId);
    if (!subOrganizer) return;
    
    currentEditingSubOrganizer = subOrganizer;
    document.getElementById('subOrganizerId').value = subId;
    document.getElementById('subOrganizerNameEn').value = subOrganizer.name_en;
    document.getElementById('subOrganizerNameBm').value = subOrganizer.name_bm;
    document.getElementById('submitButtonText').textContent = 'Update Sub-Organizer';
    
    // Scroll to form
    document.getElementById('subOrganizerForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteSubOrganizer(subId) {
    const subOrganizer = subOrganizers.find(s => s.id === subId);
    if (!subOrganizer) return;
    
    if (confirm(`Are you sure you want to delete "${subOrganizer.name_en}"? This action cannot be undone.`)) {
        try {
            showLoading();
            await firebase.firestore()
                .collection('organizers')
                .doc(parentOrganizerId)
                .collection('subOrganizers')
                .doc(subId)
                .delete();
            
            showToast('Sub-organizer deleted successfully!', 'success');
            await loadSubOrganizers();
            
        } catch (error) {
            console.error('Error deleting sub-organizer:', error);
            showToast('Error deleting sub-organizer: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }
}

function cancelEdit() {
    resetForm();
}

function resetForm() {
    document.getElementById('subOrganizerForm').reset();
    document.getElementById('subOrganizerId').value = '';
    document.getElementById('submitButtonText').textContent = 'Add Sub-Organizer';
    currentEditingSubOrganizer = null;
}

function toggleSort() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    const btn = document.getElementById('sortToggleBtn');
    btn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"/>
        </svg>
        Sort ${sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
    `;
    displaySubOrganizers();
}

// Helper function to format datetime (add to utils.js if not exists)
function formatDateTime(timestamp) {
    if (!timestamp) return 'Unknown';
    
    let date;
    if (timestamp.toDate) {
        // Firestore timestamp
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        // String or number timestamp
        date = new Date(timestamp);
    }
    
    return date.toLocaleString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
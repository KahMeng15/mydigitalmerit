// Organizers Management functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();

    // Event listeners
    document.getElementById('organizerForm').addEventListener('submit', handleAddOrganizer);
    document.getElementById('clearFormBtn').addEventListener('click', clearForm);
    document.getElementById('searchOrganizers').addEventListener('input', filterOrganizers);
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    
    // Modal event listeners
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
    document.getElementById('saveEditBtn').addEventListener('click', handleSaveEdit);
    
    // Close modal when clicking outside
    document.getElementById('editModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
});

let allOrganizers = [];
let editingOrganizerId = null;

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }
    
    // Load organizers
    loadOrganizers();
}

async function loadOrganizers() {
    try {
        showLoading();
        
        const snapshot = await firestore.collection('organizers').get();
        allOrganizers = [];
        snapshot.forEach(doc => {
            allOrganizers.push({ id: doc.id, ...doc.data() });
        });
        allOrganizers.sort((a, b) => a.name.localeCompare(b.name));
        displayOrganizers(allOrganizers);
    } catch (error) {
        console.error('Error loading organizers:', error);
        showToast('Error loading organizers: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayOrganizers(organizers) {
    const tableContainer = document.getElementById('organizersTable');
    
    if (organizers.length === 0) {
        tableContainer.innerHTML = `
            <div class="empty-state">
                <p>No organizers found.</p>
                <p class="text-muted">Add your first organizer using the form above.</p>
            </div>
        `;
        return;
    }
    
    const tableHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${organizers.map(organizer => `
                    <tr data-organizer-id="${organizer.id}">
                        <td>
                            <strong>${escapeHtml(organizer.name)}</strong>
                        </td>
                        <td>
                            <span class="badge badge-${getBadgeColor(organizer.type)}">${organizer.type}</span>
                        </td>
                        <td>${escapeHtml(organizer.description || '')}</td>
                        <td>
                            <span class="badge badge-${organizer.status === 'active' ? 'success' : 'warning'}">
                                ${organizer.status}
                            </span>
                        </td>
                        <td>${formatDate(organizer.createdAt)}</td>
                        <td>
                            <div class="action-buttons">
                                <button onclick="editOrganizer('${organizer.id}')" class="btn btn-sm btn-outline">
                                    Edit
                                </button>
                                <button onclick="toggleOrganizerStatus('${organizer.id}')" class="btn btn-sm ${organizer.status === 'active' ? 'btn-warning' : 'btn-success'}">
                                    ${organizer.status === 'active' ? 'Deactivate' : 'Activate'}
                                </button>
                                <button onclick="deleteOrganizer('${organizer.id}')" class="btn btn-sm btn-danger">
                                    Delete
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    tableContainer.innerHTML = tableHTML;
}

function getBadgeColor(type) {
    const colors = {
        'College': 'primary',
        'Faculty': 'info',
        'University': 'success',
        'Club': 'warning',
        'External': 'secondary',
        'Other': 'light'
    };
    return colors[type] || 'light';
}

function filterOrganizers() {
    const searchTerm = document.getElementById('searchOrganizers').value.toLowerCase();
    
    if (!searchTerm) {
        displayOrganizers(allOrganizers);
        return;
    }
    
    const filteredOrganizers = allOrganizers.filter(organizer => 
        organizer.name.toLowerCase().includes(searchTerm) ||
        organizer.type.toLowerCase().includes(searchTerm) ||
        (organizer.description && organizer.description.toLowerCase().includes(searchTerm))
    );
    
    displayOrganizers(filteredOrganizers);
}

async function handleAddOrganizer(e) {
    e.preventDefault();
    
    try {
        showLoading();
        
        const formData = {
            name: document.getElementById('organizerName').value.trim(),
            type: document.getElementById('organizerType').value,
            description: document.getElementById('organizerDescription').value.trim(),
            status: document.getElementById('organizerStatus').value
        };
        
        // Validate required fields
        if (!formData.name) {
            showToast('Please enter organizer name', 'error');
            return;
        }
        
        // Check for duplicate names
        const nameExists = allOrganizers.some(org => 
            org.name.toLowerCase() === formData.name.toLowerCase()
        );
        
        if (nameExists) {
            showToast('An organizer with this name already exists', 'error');
            return;
        }
        
        // Generate ID and add timestamps
        const organizerId = await generateNumericOrganizerId();
        const organizerData = {
            ...formData,
            id: organizerId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Save to Firestore
        await firestore.collection('organizers').doc(String(organizerId)).set(organizerData);
        
        showToast('Organizer added successfully!', 'success');
        clearForm();
        loadOrganizers(); // Refresh the list
        
    } catch (error) {
        console.error('Error adding organizer:', error);
        showToast('Error adding organizer: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function clearForm() {
    document.getElementById('organizerForm').reset();
    document.getElementById('organizerType').value = 'College';
    document.getElementById('organizerStatus').value = 'active';
}

function editOrganizer(organizerId) {
    const organizer = allOrganizers.find(org => org.id === organizerId);
    if (!organizer) return;
    
    editingOrganizerId = organizerId;
    
    // Populate edit form
    document.getElementById('editOrganizerName').value = organizer.name;
    document.getElementById('editOrganizerType').value = organizer.type;
    document.getElementById('editOrganizerDescription').value = organizer.description || '';
    document.getElementById('editOrganizerStatus').value = organizer.status;
    
    // Show modal
    document.getElementById('editModal').classList.remove('d-none');
}

async function handleSaveEdit() {
    if (!editingOrganizerId) return;
    
    try {
        showLoading();
        
        const formData = {
            name: document.getElementById('editOrganizerName').value.trim(),
            type: document.getElementById('editOrganizerType').value,
            description: document.getElementById('editOrganizerDescription').value.trim(),
            status: document.getElementById('editOrganizerStatus').value
        };
        
        // Validate required fields
        if (!formData.name) {
            showToast('Please enter organizer name', 'error');
            return;
        }
        
        // Check for duplicate names (excluding current organizer)
        const nameExists = allOrganizers.some(org => 
            org.name.toLowerCase() === formData.name.toLowerCase() && 
            org.id !== editingOrganizerId
        );
        
        if (nameExists) {
            showToast('An organizer with this name already exists', 'error');
            return;
        }
        
        // Update in database
        const updates = {
            ...formData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await firestore.collection('organizers').doc(String(editingOrganizerId)).update(updates);
        
        showToast('Organizer updated successfully!', 'success');
        closeModal();
        loadOrganizers(); // Refresh the list
        
    } catch (error) {
        console.error('Error updating organizer:', error);
        showToast('Error updating organizer: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function closeModal() {
    document.getElementById('editModal').classList.add('d-none');
    editingOrganizerId = null;
}

async function toggleOrganizerStatus(organizerId) {
    const organizer = allOrganizers.find(org => org.id === organizerId);
    if (!organizer) return;
    
    const newStatus = organizer.status === 'active' ? 'inactive' : 'active';
    
    try {
        showLoading();
        
        await firestore.collection('organizers').doc(String(organizerId)).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast(`Organizer ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`, 'success');
        loadOrganizers(); // Refresh the list
        
    } catch (error) {
        console.error('Error updating organizer status:', error);
        showToast('Error updating status: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteOrganizer(organizerId) {
    const organizer = allOrganizers.find(org => org.id === organizerId);
    if (!organizer) return;
    
    if (!confirm(`Are you sure you want to delete "${organizer.name}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading();
        
    await firestore.collection('organizers').doc(String(organizerId)).delete();
        
        showToast('Organizer deleted successfully!', 'success');
        loadOrganizers(); // Refresh the list
        
    } catch (error) {
        console.error('Error deleting organizer:', error);
        showToast('Error deleting organizer: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Generate numeric organizer ID using counter
async function generateNumericOrganizerId() {
    const counterDocRef = firestore.collection('counters').doc('organizerId');
    let newId = null;
    await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(counterDocRef);
        const current = doc.exists ? doc.data().value : 0;
        newId = current + 1;
        transaction.set(counterDocRef, { value: newId });
    });
    return newId;
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

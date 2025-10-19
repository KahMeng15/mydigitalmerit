// Organizers Management functionality
console.log("organizers.js loaded");

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded fired");
    if (!requireAdmin()) return;
    initializePage();
    setupEventListeners();
});

let organizersCache = [];
let currentEditingOrganizer = null;
let currentEditingSubOrganizer = null;

function initializePage() {
    console.log("initializePage called");
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
    }
    loadOrganizers();
}

function setupEventListeners() {
    console.log("setupEventListeners called");
    
    document.getElementById('signOutBtn').addEventListener('click', signOut);
}

async function loadOrganizers() {
    try {
        showLoading();
        const snapshot = await firestore.collection('organizers').orderBy('name_en').get();
        organizersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayOrganizers();
    } catch (error) {
        console.error("Error loading organizers: ", error);
        showToast("Error loading organizers.", 'error');
    } finally {
        hideLoading();
    }
}

function displayOrganizers() {
    const container = document.getElementById('organizersListContainer');
    if (organizersCache.length === 0) {
        container.innerHTML = '<p class="text-secondary">No organizers defined yet. Click "Add Main Organizer" to start.</p>';
        return;
    }

    container.innerHTML = `
        <div class="space-y-4">
            ${organizersCache.map(org => `
                <div class="card p-4 flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-lg">${sanitizeHTML(org.name_en)}</h4>
                        <p class="text-secondary">${sanitizeHTML(org.name_bm)}</p>
                        <span class="badge ${org.status === 'active' ? 'badge-success' : 'badge-danger'}">${org.status}</span>
                    </div>
                    <div class="flex gap-2">
                        <a href="manage-sub-organizers.html?parentId=${org.id}" class="btn btn-outline btn-sm">Manage Sub-Organizers</a>
                        <button class="btn btn-secondary btn-sm" onclick="editOrganizer('${org.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteOrganizer('${org.id}')">Delete</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Main Organizer Functions
function editOrganizer(id) {
    window.location.href = `add-organizer.html?id=${id}`;
}

async function deleteOrganizer(id) {
    if (confirm('Are you sure you want to delete this organizer and all its sub-organizers? This action cannot be undone.')) {
        try {
            showLoading();
            // Note: Deleting sub-collections is complex on the client-side.
            // A better approach is a Firebase Function. For now, we delete the main doc.
            await firestore.collection('organizers').doc(id).delete();
            showToast('Organizer deleted. Note: Sub-organizers may not be deleted without a Firebase Function.', 'warning');
            loadOrganizers();
        } catch (error) {
            console.error("Error deleting organizer: ", error);
            showToast('Error deleting organizer.', 'error');
        } finally {
            hideLoading();
        }
    }
}


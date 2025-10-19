// Add/Edit Organizer Page functionality
console.log("add-organizer.js loaded");

let currentOrganizerId = null;

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
    
    // Check if we're editing an existing organizer
    const urlParams = new URLSearchParams(window.location.search);
    const organizerId = urlParams.get('id');
    
    if (organizerId) {
        currentOrganizerId = organizerId;
        loadOrganizerData(organizerId);
        document.getElementById('pageTitle').textContent = 'Edit Main Organizer';
    }
}

function setupEventListeners() {
    console.log("setupEventListeners called");
    
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    document.getElementById('organizerForm').addEventListener('submit', handleFormSubmit);
}

async function loadOrganizerData(organizerId) {
    console.log("Loading organizer data for ID:", organizerId);
    
    try {
        showLoading();
        const doc = await firebase.firestore().collection('organizers').doc(organizerId).get();
        
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('organizerId').value = organizerId;
            document.getElementById('organizerNameEn').value = data.name_en || '';
            document.getElementById('organizerNameBm').value = data.name_bm || '';
            document.getElementById('organizerStatus').value = data.status || 'active';
        } else {
            showToast('Organizer not found', 'error');
            setTimeout(() => window.location.href = 'organizers.html', 2000);
        }
    } catch (error) {
        console.error('Error loading organizer:', error);
        showToast('Error loading organizer data', 'error');
    } finally {
        hideLoading();
    }
}

async function handleFormSubmit(e) {
    console.log("Form submit triggered");
    e.preventDefault();
    
    const id = document.getElementById('organizerId').value;
    const name_en = document.getElementById('organizerNameEn').value.trim();
    const name_bm = document.getElementById('organizerNameBm').value.trim();
    const status = document.getElementById('organizerStatus').value;

    console.log("Form data:", { id, name_en, name_bm, status });

    if (!name_en || !name_bm) {
        showToast('Both English and BM names are required.', 'error');
        return;
    }

    try {
        showLoading();
        
        const organizerData = {
            name_en: name_en,
            name_bm: name_bm,
            status: status,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            updated_by: getCurrentUser().email
        };

        if (currentOrganizerId) {
            // Update existing organizer
            await firebase.firestore().collection('organizers').doc(currentOrganizerId).update(organizerData);
            showToast('Organizer updated successfully!', 'success');
        } else {
            // Create new organizer
            organizerData.created_at = firebase.firestore.FieldValue.serverTimestamp();
            organizerData.created_by = getCurrentUser().email;
            await firebase.firestore().collection('organizers').add(organizerData);
            showToast('Organizer created successfully!', 'success');
        }

        // Redirect back to organizers list after a short delay
        setTimeout(() => {
            window.location.href = 'organizers.html';
        }, 1500);

    } catch (error) {
        console.error('Error saving organizer:', error);
        showToast('Error saving organizer: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}
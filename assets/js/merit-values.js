/**
 * Hierarchical Merit Values Management System
 * 
 * This system manages merit values with a hierarchical database structure:
 * - meritValues > roleMetadata > category collections
 * - meritValues > levelMetadata for level definitions
 * - ID-based linking between levels and merit values
 * 
 * Benefits:
 * - Level names can be changed without affecting merit data
 * - Better data organization and relationships
 * - Easier maintenance and scaling
 * - ID-based linking prevents data corruption
 */

// ============================================================================
// INITIALIZATION AND GLOBAL VARIABLES
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize page
    initializePage();
    setupEventListeners();
});

// Global state variables
let currentEventMeritValues = {
    committee: {},
    nonCommittee: {}
};

let currentCompetitionMeritValues = {};
let currentLevelConfigs = {
    eventLevels: [],
    competitionLevels: []
};
let editingEventRole = null;
let editingCompetitionRole = null;
let currentEditingRoleId = null;
let currentEditingRoleCategory = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Generate unique ID function
function generateUniqueId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Scroll modal to top when opened
function scrollModalToTop(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.scrollTop = 0;
        }
        // Make modal focusable and focus it
        modal.setAttribute('tabindex', '-1');
        setTimeout(() => modal.focus(), 10);
    }
}

// Add keyboard event listeners for modals
function addModalKeyboardListeners(modalId, confirmCallback = null, cancelCallback = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (cancelCallback) {
                cancelCallback();
            }
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (confirmCallback) {
                confirmCallback();
            }
        }
    };
    
    // Add event listener when modal is shown
    modal.addEventListener('keydown', handleKeyPress);
    
    // Store the handler for cleanup
    modal._keyboardHandler = handleKeyPress;
}

// Remove keyboard event listeners from modal
function removeModalKeyboardListeners(modalId) {
    const modal = document.getElementById(modalId);
    if (modal && modal._keyboardHandler) {
        modal.removeEventListener('keydown', modal._keyboardHandler);
        delete modal._keyboardHandler;
    }
}

// Helper functions that may be missing
function showLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.remove('d-none');
    }
}

function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.add('d-none');
    }
}

function showToast(message, type = 'info') {
    // Simple toast implementation
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Try to show in a toast container if it exists
    const container = document.getElementById('toastContainer');
    if (container) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            margin-bottom: 10px;
            opacity: 0.9;
        `;
        container.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    } else {
        // Fallback to alert for critical messages
        if (type === 'error') {
            alert(`Error: ${message}`);
        }
    }
}

// Check if required utilities are available
function requireAdmin() {
    // This should be implemented based on your auth system
    // For now, just return true to avoid blocking
    return true;
}

function getCurrentUser() {
    // This should return the current user from your auth system
    // For now, return a mock user to avoid errors
    return {
        displayName: 'Admin User',
        email: 'admin@example.com'
    };
}

function signOut() {
    // Implement sign out functionality
    console.log('Sign out clicked');
    if (confirm('Are you sure you want to sign out?')) {
        window.location.href = '/';
    }
}

// Get the next available sort order for a given category
async function getNextSortOrder(category, subcategory = null) {
    try {
        let maxSortOrder = 0;
        
        if (category === 'event') {
            // For event merits, check the specific subcategory (committee/nonCommittee)
            const roles = subcategory === 'committee' 
                ? currentEventMeritValues.committee 
                : currentEventMeritValues.nonCommittee;
            
            Object.values(roles).forEach(role => {
                if (role.sortOrder !== undefined && role.sortOrder > maxSortOrder) {
                    maxSortOrder = role.sortOrder;
                }
            });
        } else if (category === 'competition') {
            // For competition achievements
            Object.values(currentCompetitionMeritValues).forEach(achievement => {
                if (achievement.sortOrder !== undefined && achievement.sortOrder > maxSortOrder) {
                    maxSortOrder = achievement.sortOrder;
                }
            });
        }
        
        // Start from 1 instead of 0
        return Math.max(maxSortOrder + 1, 1);
    } catch (error) {
        console.error('Error getting next sort order:', error);
        return 999; // Fallback value
    }
}

// Get the next available sort order for levels
async function getNextLevelSortOrder(levelType) {
    try {
        let maxSortOrder = 0;
        
        const levels = levelType === 'event' ? 
            currentLevelConfigs.eventLevels : 
            currentLevelConfigs.competitionLevels;
        
        levels.forEach(level => {
            if (level.sortOrder !== undefined && level.sortOrder > maxSortOrder) {
                maxSortOrder = level.sortOrder;
            }
        });
        
        // Start from 1 instead of 0
        return Math.max(maxSortOrder + 1, 1);
    } catch (error) {
        console.error('Error getting next level sort order:', error);
        return 999; // Fallback value
    }
}

// Event levels mapping
const eventLevels = ['college', 'block', 'university', 'national', 'international'];
const competitionLevels = ['college', 'block', 'faculty', 'university', 'interuniversity', 'state', 'national', 'international'];

function initializePage() {
    // Display user info
    const user = getCurrentUser();
    const userDisplayElement = document.getElementById('userDisplayName');
    if (user && userDisplayElement) {
        userDisplayElement.textContent = user.displayName || user.email;
    }

    // Check if Firebase is available
    if (typeof window.firestore === 'undefined') {
        console.error('Firestore not available. Make sure firebase-config.js is loaded.');
        showToast('Database connection not available. Please check your configuration.', 'error');
        return;
    }

    // Load level configurations first, then merit values
    loadLevelConfigurations();
}

// ============================================================================
// LEVEL CONFIGURATION MANAGEMENT
// ============================================================================
async function loadLevelConfigurations() {
    try {
        showLoading();

        const firestore = window.firestore;
        if (!firestore) {
            throw new Error('Firestore not available');
        }

        // Try to load from hierarchical structure first
        const levelMetadataDoc = await firestore.collection('meritValues').doc('levelMetadata').get();
        
        if (levelMetadataDoc.exists) {
            // Load from hierarchical structure
            await loadLevelConfigurationsHierarchical();
        } else {
            console.warn('No level metadata found - please create levels first');
        }

        console.log('Loaded level configurations:', {
            eventLevels: currentLevelConfigs.eventLevels.map(l => l.nameEN || l.key || l.id),
            competitionLevels: currentLevelConfigs.competitionLevels.map(l => l.nameEN || l.key || l.id)
        });

        // Load merit values after levels are configured
        loadEventMeritValues();
        loadCompetitionMeritValues();

    } catch (error) {
        console.error('Error loading level configurations:', error);
        showToast('Error loading level configurations', 'error');
        
        // Fallback to creating default configurations
        await createDefaultLevelConfigurations();
    } finally {
        hideLoading();
    }
}

async function loadLevelConfigurationsHierarchical() {
    try {
        const firestore = window.firestore;
        
        // Initialize arrays if they don't exist
        if (!currentLevelConfigs) {
            currentLevelConfigs = { eventLevels: [], competitionLevels: [] };
        }
        
        // Load event levels from hierarchical structure
        const eventLevelsSnapshot = await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection('event')
            .get();
        
        currentLevelConfigs.eventLevels = [];
        eventLevelsSnapshot.forEach(doc => {
            const data = doc.data();
            // Default sortOrder to 999 if not set
            if (data.sortOrder === undefined) {
                data.sortOrder = 999;
            }
            currentLevelConfigs.eventLevels.push(data);
        });
        
        // Sort by sortOrder after loading
        currentLevelConfigs.eventLevels.sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
        
        // Load competition levels from hierarchical structure
        const competitionLevelsSnapshot = await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection('competition')
            .get();
        
        currentLevelConfigs.competitionLevels = [];
        competitionLevelsSnapshot.forEach(doc => {
            const data = doc.data();
            // Default sortOrder to 999 if not set
            if (data.sortOrder === undefined) {
                data.sortOrder = 999;
            }
            currentLevelConfigs.competitionLevels.push(data);
        });
        
        // Sort by sortOrder after loading
        currentLevelConfigs.competitionLevels.sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
        
        console.log('Loaded hierarchical level configurations');
        
    } catch (error) {
        console.error('Error loading hierarchical level configurations:', error);
        throw error;
    }
}



async function createDefaultLevelConfigurations() {
    try {
        // Initialize if not exists
        if (!currentLevelConfigs) {
            currentLevelConfigs = { eventLevels: [], competitionLevels: [] };
        }
        
        const defaultEventLevels = [
            { id: generateUniqueId(), key: 'college', nameBM: 'Kolej', nameEN: 'College', sortOrder: 0 },
            { id: generateUniqueId(), key: 'block', nameBM: 'Blok', nameEN: 'Block', sortOrder: 1 },
            { id: generateUniqueId(), key: 'university', nameBM: 'Universiti', nameEN: 'University', sortOrder: 2 },
            { id: generateUniqueId(), key: 'national', nameBM: 'Kebangsaan', nameEN: 'National', sortOrder: 3 },
            { id: generateUniqueId(), key: 'international', nameBM: 'Antarabangsa', nameEN: 'International', sortOrder: 4 }
        ];

        const defaultCompetitionLevels = [
            { id: generateUniqueId(), key: 'college', nameBM: 'Kolej', nameEN: 'College', sortOrder: 0 },
            { id: generateUniqueId(), key: 'block', nameBM: 'Blok', nameEN: 'Block', sortOrder: 1 },
            { id: generateUniqueId(), key: 'faculty', nameBM: 'Fakulti', nameEN: 'Faculty', sortOrder: 2 },
            { id: generateUniqueId(), key: 'university', nameBM: 'Universiti', nameEN: 'University', sortOrder: 3 },
            { id: generateUniqueId(), key: 'interuniversity', nameBM: 'Antara Universiti', nameEN: 'Inter-University', sortOrder: 4 },
            { id: generateUniqueId(), key: 'state', nameBM: 'Negeri', nameEN: 'State', sortOrder: 5 },
            { id: generateUniqueId(), key: 'national', nameBM: 'Kebangsaan', nameEN: 'National', sortOrder: 6 },
            { id: generateUniqueId(), key: 'international', nameBM: 'Antarabangsa', nameEN: 'International', sortOrder: 7 }
        ];

        const firestore = window.firestore;
        const batch = firestore.batch();
        
        const eventLevelsRef = firestore.collection('levelConfigurations').doc('eventLevels');
        batch.set(eventLevelsRef, { levels: defaultEventLevels });
        
        const competitionLevelsRef = firestore.collection('levelConfigurations').doc('competitionLevels');
        batch.set(competitionLevelsRef, { levels: defaultCompetitionLevels });
        
        await batch.commit();

        // Update local data
        currentLevelConfigs.eventLevels = defaultEventLevels;
        currentLevelConfigs.competitionLevels = defaultCompetitionLevels;

        console.log('Created default level configurations');
        
    } catch (error) {
        console.error('Error creating default level configurations:', error);
        showToast('Error creating level configurations', 'error');
    }
}

function setupEventListeners() {
    // Helper function to safely add event listener
    function safeAddEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        }
        // Removed console warning to avoid clutter
    }
    
    // Sign out
    safeAddEventListener('signOutBtn', 'click', signOut);
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });
    
    // Event Merit management
    safeAddEventListener('addCommitteeRoleBtn', 'click', () => openEventMeritModal('committee'));
    safeAddEventListener('addNonCommitteeRoleBtn', 'click', () => openEventMeritModal('non-committee'));
    safeAddEventListener('saveEventMeritBtn', 'click', saveEventMeritRole);
    
    // Competition Merit management
    safeAddEventListener('saveCompetitionMeritBtn', 'click', saveCompetitionMeritRole);
    
    // New modal save buttons
    safeAddEventListener('saveLevelBtn', 'click', saveLevelData);
    safeAddEventListener('saveRoleBtn', 'click', saveRoleData);
    safeAddEventListener('updateLevelBtn', 'click', updateLevel);
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

// ============================================================================
// MERIT VALUES DATA MANAGEMENT (HIERARCHICAL STRUCTURE)
// ============================================================================
async function loadEventMeritValues() {
    try {
        showLoading();

        const firestore = window.firestore;
        if (!firestore) {
            throw new Error('Firestore not available');
        }

        // Use hierarchical loading
        const meritData = await loadMeritValuesHierarchical();
        
        currentEventMeritValues = { 
            committee: meritData.committee, 
            nonCommittee: meritData.nonCommittee 
        };
        
        displayEventMeritRoles();

    } catch (error) {
        console.error('Error loading event merit values:', error);
        showToast('Error loading event merit values', 'error');
        
        // Fallback: try to create initial structure
        await initializeHierarchicalStructure();
        // Retry loading after initialization
        try {
            const meritData = await loadMeritValuesHierarchical();
            currentEventMeritValues = { 
                committee: meritData.committee, 
                nonCommittee: meritData.nonCommittee 
            };
            displayEventMeritRoles();
        } catch (retryError) {
            console.error('Retry failed:', retryError);
        }
    } finally {
        hideLoading();
    }
}

// Hierarchical Data Loading Functions
async function loadMeritValuesHierarchical() {
    try {
        const firestore = window.firestore;
        const result = {
            committee: {},
            nonCommittee: {},
            competitions: {}
        };

        // Load committee roles from hierarchical structure
        const committeeSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata').collection('committee').get();
        
        committeeSnapshot.forEach(doc => {
            result.committee[doc.id] = doc.data();
        });

        // Load non-committee roles
        const nonCommitteeSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata').collection('nonCommittee').get();
        
        nonCommitteeSnapshot.forEach(doc => {
            result.nonCommittee[doc.id] = doc.data();
        });

        // Load competition achievements
        const competitionSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata').collection('competition').get();
        
        competitionSnapshot.forEach(doc => {
            result.competitions[doc.id] = doc.data();
        });

        console.log('Loaded hierarchical merit data:', result);
        return result;

    } catch (error) {
        console.error('Error loading hierarchical merit values:', error);
        // Return empty structure if hierarchical data fails to load
        return {
            committee: {},
            nonCommittee: {},
            competitions: {}
        };
    }
}



async function initializeHierarchicalStructure() {
    try {
        console.log('Initializing hierarchical structure...');
        const firestore = window.firestore;
        
        // Create the main structure documents
        await firestore.collection('meritValues').doc('roleMetadata').set({
            created: new Date(),
            description: 'Contains role merit data organized by category'
        });

        await firestore.collection('meritValues').doc('levelMetadata').set({
            created: new Date(),
            description: 'Contains level definitions with IDs for referencing'
        });

        // Initialize level metadata from current level configurations
        await initializeLevelMetadata();

        console.log('Hierarchical structure initialized');
        
    } catch (error) {
        console.error('Error initializing hierarchical structure:', error);
        throw error;
    }
}

async function initializeLevelMetadata() {
    try {
        const firestore = window.firestore;
        
        // Ensure level configurations are loaded
        if (!currentLevelConfigs || !currentLevelConfigs.eventLevels || !currentLevelConfigs.competitionLevels) {
            console.warn('Level configurations not loaded - hierarchical system is required');
            return;
        }
        
        const batch = firestore.batch();

        // Save event levels to hierarchical structure
        if (currentLevelConfigs.eventLevels && currentLevelConfigs.eventLevels.length > 0) {
            currentLevelConfigs.eventLevels.forEach(level => {
                const docRef = firestore.collection('meritValues')
                    .doc('levelMetadata')
                    .collection('event')
                    .doc(level.id);
                
                batch.set(docRef, {
                    id: level.id,
                    key: level.key,
                    nameBM: level.nameBM,
                    nameEN: level.nameEN,
                    sortOrder: level.sortOrder || 0
                });
            });
        }

        // Save competition levels to hierarchical structure
        if (currentLevelConfigs.competitionLevels && currentLevelConfigs.competitionLevels.length > 0) {
            currentLevelConfigs.competitionLevels.forEach(level => {
                const docRef = firestore.collection('meritValues')
                    .doc('levelMetadata')
                    .collection('competition')
                    .doc(level.id);
                
                batch.set(docRef, {
                    id: level.id,
                    key: level.key,
                    nameBM: level.nameBM,
                    nameEN: level.nameEN,
                    sortOrder: level.sortOrder || 0
                });
            });
        }

        await batch.commit();
        console.log('Level metadata initialized in hierarchical structure');
        
    } catch (error) {
        console.error('Error initializing level metadata:', error);
        throw error;
    }
}

async function loadCompetitionMeritValues() {
    try {
        showLoading();

        const firestore = window.firestore;
        if (!firestore) {
            throw new Error('Firestore not available');
        }

        // Use hierarchical loading
        const meritData = await loadMeritValuesHierarchical();
        
        currentCompetitionMeritValues = meritData.competitions;
        console.log('Loaded competition merit values:', currentCompetitionMeritValues);
        
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error loading competition merit values:', error);
        showToast('Error loading competition merit values', 'error');
    } finally {
        hideLoading();
    }
}

function displayEventMeritRoles() {
    updateEventTableHeaders();
    displayCommitteeRoles();
    displayNonCommitteeRoles();
}

// ============================================================================
// UI DISPLAY FUNCTIONS
// ============================================================================

// Helper function to get merit value for a level (hierarchical format only)
function getMeritValueForLevel(roleData, level) {
    // Hierarchical format: levelValues[levelId]
    if (roleData.levelValues && roleData.levelValues[level.id] !== undefined) {
        return roleData.levelValues[level.id];
    }
    
    return 0;
}

// Helper function to update table headers dynamically
function updateEventTableHeaders() {
    // Update committee table header
    const committeeHeader = document.getElementById('committeeTableHeader');
    if (committeeHeader) {
        let headerHtml = `
            <th>Role (BM)</th>
            <th>Role (EN)</th>
        `;
        
        // Add level headers dynamically with drag and drop
        if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
            currentLevelConfigs.eventLevels.forEach(level => {
                headerHtml += `
                    <th data-level-id="${level.id}" draggable="true" class="draggable-level-header">
                        <div class="level-header-content">
                            <span class="drag-indicator">⋮⋮</span>
                            <a href="#" onclick="editLevel('${level.id}', 'event'); return false;" 
                               class="level-header-link" 
                               title="Click to edit ${level.nameEN} level">
                                ${level.nameEN}
                            </a>
                        </div>
                    </th>`;
            });
        }
        
        // Add Actions column with level edit button
        headerHtml += `<th>
            <button onclick="showLevelSelectionModal('event')" 
                    class="btn btn-outline btn-xs" 
                    title="Edit Event Level">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
            </button>
        </th>`;
        
        committeeHeader.innerHTML = headerHtml;
    }
    
    // Update non-committee table header
    const nonCommitteeHeader = document.getElementById('nonCommitteeTableHeader');
    if (nonCommitteeHeader) {
        let headerHtml = `
            <th>Role (BM)</th>
            <th>Role (EN)</th>
        `;
        
        // Add level headers dynamically with drag and drop
        if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
            currentLevelConfigs.eventLevels.forEach(level => {
                headerHtml += `
                    <th data-level-id="${level.id}" draggable="true" class="draggable-level-header">
                        <div class="level-header-content">
                            <span class="drag-indicator">⋮⋮</span>
                            <a href="#" onclick="editLevel('${level.id}', 'event'); return false;" 
                               class="level-header-link" 
                               title="Click to edit ${level.nameEN} level">
                                ${level.nameEN}
                            </a>
                        </div>
                    </th>`;
            });
        }
        
        // Add Actions column with level edit button
        headerHtml += `<th>
            <button onclick="showLevelSelectionModal('event')" 
                    class="btn btn-outline btn-xs" 
                    title="Edit Event Level">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
            </button>
        </th>`;
        
        nonCommitteeHeader.innerHTML = headerHtml;
    }
    
    // Add drag and drop listeners to level headers
    addLevelHeaderDragListeners(null, 'event');
}

// Helper function to save merit data to hierarchical structure
async function saveMeritData(data, type, category = null) {
    try {
        // Always use hierarchical structure - legacy support removed
        await saveToHierarchicalStructure(data, type, category);
        
    } catch (error) {
        console.error('Error saving merit data:', error);
        throw error;
    }
}

async function saveToHierarchicalStructure(data, type, category) {
    const firestore = window.firestore;
    
    if (type === 'event') {
        const docRef = firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(category)
            .doc(data.id);
        await docRef.set(data);
    } else if (type === 'competition') {
        const docRef = firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection('competition')
            .doc(data.id);
        await docRef.set(data);
    }
}



// Helper function to create merit data in the appropriate format
function createMeritDataObject(formData, type) {
    const data = {
        id: formData.id || generateUniqueId(),
        nameBM: formData.nameBM || '',
        nameEN: formData.nameEN || '',
        sortOrder: formData.sortOrder !== undefined ? formData.sortOrder : 999,
        category: formData.category || type
    };
    
    // Always use hierarchical format: levelValues object with levelId keys
    data.levelValues = {};
    const levelConfigs = type === 'competition' ? currentLevelConfigs.competitionLevels : currentLevelConfigs.eventLevels;
    
    levelConfigs.forEach(level => {
        const value = formData.levelValues && formData.levelValues[level.id] !== undefined 
            ? formData.levelValues[level.id] 
            : 0;
        data.levelValues[level.id] = parseInt(value) || 0;
    });
    
    return data;
}

function updateCompetitionTableHeaders() {
    const competitionTable = document.querySelector('#competition-meritsTab .table thead tr');
    if (competitionTable) {
        let headerHtml = `
            <th>Achievement (BM)</th>
            <th>Achievement (EN)</th>
        `;
        
        // Add level headers dynamically with drag and drop
        if (currentLevelConfigs && currentLevelConfigs.competitionLevels) {
            currentLevelConfigs.competitionLevels.forEach(level => {
                headerHtml += `
                    <th data-level-id="${level.id}" draggable="true" class="draggable-level-header">
                        <div class="level-header-content">
                            <span class="drag-indicator">⋮⋮</span>
                            <a href="#" onclick="editLevel('${level.id}', 'competition'); return false;" 
                               class="level-header-link" 
                               title="Click to edit ${level.nameEN} level">
                                ${level.nameEN}
                            </a>
                        </div>
                    </th>`;
            });
        }
        
        // Add Actions column with level edit button
        headerHtml += `<th>
            <button onclick="showLevelSelectionModal('competition')" 
                    class="btn btn-outline btn-xs" 
                    title="Edit Competition Level">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
            </button>
        </th>`;
        
        competitionTable.innerHTML = headerHtml;
        
        // Add drag and drop event listeners for level headers
        addLevelHeaderDragListeners(competitionTable, 'competition');
    }
}

function displayCommitteeRoles() {
    const tbody = document.getElementById('committeeTableBody');
    let html = '';

    const committeeRoles = currentEventMeritValues.committee;
    
    if (Object.keys(committeeRoles).length === 0) {
        html = '<tr><td colspan="11" class="text-center text-secondary">No committee roles defined</td></tr>';
    } else {
        // Sort roles by sortOrder field
        const sortedRoles = Object.entries(committeeRoles).sort(([, a], [, b]) => {
            const aOrder = a.sortOrder !== undefined && a.sortOrder !== null ? Number(a.sortOrder) : 999;
            const bOrder = b.sortOrder !== undefined && b.sortOrder !== null ? Number(b.sortOrder) : 999;
            return aOrder - bOrder;
        });

        sortedRoles.forEach(([roleId, roleData]) => {
            html += `
                <tr data-role="${roleId}" data-category="committee" draggable="true" class="draggable-row">
                    <td class="font-medium drag-handle">
                        <a href="#" onclick="editRole('${roleId}', 'committee'); return false;" 
                           class="role-name-link" 
                           title="Click to edit ${roleData.nameBM || 'Unknown'} role">
                            ${roleData.nameBM || 'Unknown'}
                        </a>
                    </td>
                    <td class="text-secondary">
                        <a href="#" onclick="editRole('${roleId}', 'committee'); return false;" 
                           class="role-name-link" 
                           title="Click to edit ${roleData.nameEN || 'Unknown'} role">
                            ${roleData.nameEN || 'Unknown'}
                        </a>
                    </td>
            `;
            
            // Add dynamic level columns
            if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
                currentLevelConfigs.eventLevels.forEach(level => {
                    const value = getMeritValueForLevel(roleData, level);
                    html += `<td class="text-center">${value}</td>`;
                });
            }
            
            // Add actions column for committee roles
            html += `
                <td class="text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="editRole('${roleId}', 'committee')" 
                                class="btn btn-outline btn-xs" 
                                title="Edit role">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            
            html += `</tr>`;
        });
    }

    tbody.innerHTML = html;
    
    // Add drag and drop event listeners
    addDragAndDropListeners(tbody, 'event');
}

function displayNonCommitteeRoles() {
    const tbody = document.getElementById('nonCommitteeTableBody');
    let html = '';

    const nonCommitteeRoles = currentEventMeritValues.nonCommittee;
    
    if (Object.keys(nonCommitteeRoles).length === 0) {
        html = '<tr><td colspan="11" class="text-center text-secondary">No non-committee roles defined</td></tr>';
    } else {
        // Sort roles by sortOrder field
        const sortedRoles = Object.entries(nonCommitteeRoles).sort(([, a], [, b]) => {
            const aOrder = a.sortOrder !== undefined && a.sortOrder !== null ? Number(a.sortOrder) : 999;
            const bOrder = b.sortOrder !== undefined && b.sortOrder !== null ? Number(b.sortOrder) : 999;
            return aOrder - bOrder;
        });

        sortedRoles.forEach(([roleId, roleData]) => {
            html += `
                <tr data-role="${roleId}" data-category="non-committee" draggable="true" class="draggable-row">
                    <td class="font-medium drag-handle">
                        <a href="#" onclick="editRole('${roleId}', 'nonCommittee'); return false;" 
                           class="role-name-link" 
                           title="Click to edit ${roleData.nameBM || 'Unknown'} role">
                            ${roleData.nameBM || 'Unknown'}
                        </a>
                    </td>
                    <td class="text-secondary">
                        <a href="#" onclick="editRole('${roleId}', 'nonCommittee'); return false;" 
                           class="role-name-link" 
                           title="Click to edit ${roleData.nameEN || 'Unknown'} role">
                            ${roleData.nameEN || 'Unknown'}
                        </a>
                    </td>
            `;
            
            // Add dynamic level columns
            if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
                currentLevelConfigs.eventLevels.forEach(level => {
                    const value = getMeritValueForLevel(roleData, level);
                    html += `<td class="text-center">${value}</td>`;
                });
            }
            
            // Add actions column for non-committee roles
            html += `
                <td class="text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="editRole('${roleId}', 'nonCommittee')" 
                                class="btn btn-outline btn-xs" 
                                title="Edit role">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            
            html += `</tr>`;
        });
    }

    tbody.innerHTML = html;
    
    // Add drag and drop event listeners
    addDragAndDropListeners(tbody, 'event');
}

function displayCompetitionMeritRoles() {
    updateCompetitionTableHeaders();
    const tbody = document.getElementById('competitionTableBody');
    let html = '';

    const totalColumns = 2 + currentLevelConfigs.competitionLevels.length + 1; // Name columns + level columns + actions column
    if (Object.keys(currentCompetitionMeritValues).length === 0) {
        html = `<tr><td colspan="${totalColumns}" class="text-center text-secondary">No competition achievements defined</td></tr>`;
    } else {
        // Sort achievements by sortOrder field
        const sortedAchievements = Object.entries(currentCompetitionMeritValues).sort(([, a], [, b]) => {
            const aOrder = a.sortOrder !== undefined && a.sortOrder !== null ? Number(a.sortOrder) : 999;
            const bOrder = b.sortOrder !== undefined && b.sortOrder !== null ? Number(b.sortOrder) : 999;
            return aOrder - bOrder;
        });

        sortedAchievements.forEach(([achievementId, achievementData]) => {
            html += `
                <tr data-achievement="${achievementId}" draggable="true" class="draggable-row">
                    <td class="font-medium drag-handle">
                        <a href="#" onclick="editRole('${achievementId}', 'competition'); return false;" 
                           class="role-name-link" 
                           title="Click to edit ${achievementData.nameBM || 'Unknown'} achievement">
                            ${achievementData.nameBM || 'Unknown'}
                        </a>
                    </td>
                    <td class="text-secondary">
                        <a href="#" onclick="editRole('${achievementId}', 'competition'); return false;" 
                           class="role-name-link" 
                           title="Click to edit ${achievementData.nameEN || 'Unknown'} achievement">
                            ${achievementData.nameEN || 'Unknown'}
                        </a>
                    </td>
            `;
            
            // Add dynamic level columns for competition levels
            if (currentLevelConfigs && currentLevelConfigs.competitionLevels) {
                currentLevelConfigs.competitionLevels.forEach(level => {
                    const value = getMeritValueForLevel(achievementData, level);
                    html += `<td class="text-center">${value}</td>`;
                });
            }
            
            // Add actions column for competition achievements
            html += `
                <td class="text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="editRole('${achievementId}', 'competition')" 
                                class="btn btn-outline btn-xs" 
                                title="Edit achievement">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            
            html += `</tr>
            `;
        });
    }

    tbody.innerHTML = html;
    
    // Add drag and drop event listeners
    addDragAndDropListeners(tbody, 'competition');
}

// ============================================================================
// DRAG AND DROP FUNCTIONALITY
// ============================================================================
function addDragAndDropListeners(tbody, type) {
    const rows = tbody.querySelectorAll('.draggable-row');
    
    rows.forEach(row => {
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragover', handleDragOver);
        row.addEventListener('drop', handleDrop);
        row.addEventListener('dragend', handleDragEnd);
    });
}

let draggedElement = null;
let draggedType = null;
let draggedCategory = null;

function handleDragStart(e) {
    draggedElement = e.target;
    draggedType = draggedElement.dataset.achievement ? 'competition' : 'event';
    draggedCategory = draggedElement.dataset.category || null;
    
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    const targetRow = e.target.closest('tr');
    if (targetRow && targetRow !== draggedElement) {
        // Only allow dropping on same type/category
        const targetType = targetRow.dataset.achievement ? 'competition' : 'event';
        const targetCategory = targetRow.dataset.category || null;
        
        if (targetType === draggedType && targetCategory === draggedCategory) {
            e.dataTransfer.dropEffect = 'move';
            targetRow.style.borderTop = '2px solid var(--primary-color)';
        }
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const targetRow = e.target.closest('tr');
    if (targetRow && targetRow !== draggedElement) {
        const targetType = targetRow.dataset.achievement ? 'competition' : 'event';
        const targetCategory = targetRow.dataset.category || null;
        
        // Only allow dropping on same type/category
        if (targetType === draggedType && targetCategory === draggedCategory) {
            reorderItems(draggedElement, targetRow, draggedType, draggedCategory);
        }
    }
    
    // Clear all visual indicators
    document.querySelectorAll('tr').forEach(row => {
        row.style.borderTop = '';
    });
    
    return false;
}

function handleDragEnd(e) {
    e.target.style.opacity = '';
    
    // Clear all visual indicators
    document.querySelectorAll('tr').forEach(row => {
        row.style.borderTop = '';
    });
    
    draggedElement = null;
    draggedType = null;
    draggedCategory = null;
}

async function reorderItems(draggedRow, targetRow, type, category) {
    try {
        showLoading();
        
        if (type === 'competition') {
            await reorderCompetitionAchievements(draggedRow, targetRow);
        } else if (type === 'event') {
            await reorderEventRoles(draggedRow, targetRow, category);
        }
        
        showToast('Order updated successfully', 'success');
        
    } catch (error) {
        console.error('Error reordering items:', error);
        showToast('Error updating order: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function reorderEventRoles(draggedRow, targetRow, category) {
    const draggedId = draggedRow.dataset.role;
    const targetId = targetRow.dataset.role;
    
    const collection = category === 'committee' ? 'committee' : 'nonCommittee';
    const roles = currentEventMeritValues[collection];
    
    // Get all roles sorted by current order
    const sortedRoles = Object.entries(roles).sort(([, a], [, b]) => {
        const aOrder = a.sortOrder !== undefined && a.sortOrder !== null ? Number(a.sortOrder) : 999;
        const bOrder = b.sortOrder !== undefined && b.sortOrder !== null ? Number(b.sortOrder) : 999;
        return aOrder - bOrder;
    });
    
    // Find positions
    const draggedIndex = sortedRoles.findIndex(([id]) => id === draggedId);
    const targetIndex = sortedRoles.findIndex(([id]) => id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder array
    const [draggedItem] = sortedRoles.splice(draggedIndex, 1);
    sortedRoles.splice(targetIndex, 0, draggedItem);
    
    // Update sort orders (start from 1)
    const batch = [];
    sortedRoles.forEach(([roleId, roleData], index) => {
        roles[roleId].sortOrder = index + 1;
        batch.push({
            path: `eventMeritValues/${collection}`,
            data: { [roleId]: { ...roleData, sortOrder: index + 1 } }
        });
    });
    
    // Save to Firestore
    await firestore.collection('eventMeritValues').doc(collection).set(
        Object.fromEntries(sortedRoles.map(([roleId, roleData], index) => [
            roleId, { ...roleData, sortOrder: index + 1 }
        ]))
    );
    
    // Refresh display
    displayEventMeritRoles();
}

async function reorderCompetitionAchievements(draggedRow, targetRow) {
    const draggedId = draggedRow.dataset.achievement;
    const targetId = targetRow.dataset.achievement;
    
    // Get all achievements sorted by current order
    const sortedAchievements = Object.entries(currentCompetitionMeritValues).sort(([, a], [, b]) => {
        const aOrder = a.sortOrder !== undefined && a.sortOrder !== null ? Number(a.sortOrder) : 999;
        const bOrder = b.sortOrder !== undefined && b.sortOrder !== null ? Number(b.sortOrder) : 999;
        return aOrder - bOrder;
    });
    
    // Find positions
    const draggedIndex = sortedAchievements.findIndex(([id]) => id === draggedId);
    const targetIndex = sortedAchievements.findIndex(([id]) => id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder array
    const [draggedItem] = sortedAchievements.splice(draggedIndex, 1);
    sortedAchievements.splice(targetIndex, 0, draggedItem);
    
    // Update sort orders and save to Firestore (start from 1)
    const batch = firestore.batch();
    sortedAchievements.forEach(([achievementId, achievementData], index) => {
        currentCompetitionMeritValues[achievementId].sortOrder = index + 1;
        const docRef = firestore.collection('competitionMeritValues').doc(achievementId);
        batch.set(docRef, { ...achievementData, sortOrder: index + 1 });
    });
    
    await batch.commit();
    
    // Refresh display
    displayCompetitionMeritRoles();
}

// ============================================================================
// LEVEL HEADER DRAG AND DROP
// ============================================================================
let draggedLevelElement = null;

function addLevelHeaderDragListeners(container = null, levelType = 'event') {
    const selector = container ? 
        container.querySelectorAll('.draggable-level-header') : 
        document.querySelectorAll('.draggable-level-header');
    
    selector.forEach(header => {
        // Store level type for use in drop handler
        header.dataset.levelType = levelType;
        header.addEventListener('dragstart', handleLevelDragStart);
        header.addEventListener('dragover', handleLevelDragOver);
        header.addEventListener('drop', handleLevelDrop);
        header.addEventListener('dragend', handleLevelDragEnd);
    });
}

function handleLevelDragStart(e) {
    draggedLevelElement = e.target.closest('th');
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', draggedLevelElement.outerHTML);
}

function handleLevelDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    const targetHeader = e.target.closest('th.draggable-level-header');
    if (targetHeader && targetHeader !== draggedLevelElement) {
        e.dataTransfer.dropEffect = 'move';
        targetHeader.style.borderLeft = '3px solid var(--primary-color)';
    }
    
    return false;
}

function handleLevelDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const targetHeader = e.target.closest('th.draggable-level-header');
    if (targetHeader && targetHeader !== draggedLevelElement) {
        const levelType = targetHeader.dataset.levelType;
        if (levelType === 'competition') {
            reorderCompetitionLevels(draggedLevelElement, targetHeader);
        } else {
            reorderLevels(draggedLevelElement, targetHeader);
        }
    }
    
    // Clear all visual indicators
    document.querySelectorAll('th.draggable-level-header').forEach(header => {
        header.style.borderLeft = '';
    });
    
    return false;
}

function handleLevelDragEnd(e) {
    e.target.style.opacity = '';
    
    // Clear all visual indicators
    document.querySelectorAll('th.draggable-level-header').forEach(header => {
        header.style.borderLeft = '';
    });
    
    draggedLevelElement = null;
}

async function reorderLevels(draggedHeader, targetHeader) {
    try {
        showLoading();
        
        const draggedLevelId = draggedHeader.dataset.levelId;
        const targetLevelId = targetHeader.dataset.levelId;
        
        // Find positions in current level array
        const draggedIndex = currentLevelConfigs.eventLevels.findIndex(level => level.id === draggedLevelId);
        const targetIndex = currentLevelConfigs.eventLevels.findIndex(level => level.id === targetLevelId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        // Reorder array
        const [draggedItem] = currentLevelConfigs.eventLevels.splice(draggedIndex, 1);
        currentLevelConfigs.eventLevels.splice(targetIndex, 0, draggedItem);
        
        // Update sort orders and save to Firestore
        const firestore = window.firestore;
        const batch = firestore.batch();
        
        currentLevelConfigs.eventLevels.forEach((level, index) => {
            level.sortOrder = index + 1; // Start from 1 instead of 0
            const levelRef = firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('event')
                .doc(level.id);
            batch.update(levelRef, { sortOrder: index + 1 });
        });
        
        await batch.commit();
        
        showToast('Level order updated successfully', 'success');
        
        // Refresh display
        displayEventMeritRoles();
        
    } catch (error) {
        console.error('Error reordering levels:', error);
        showToast('Error updating level order: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function reorderCompetitionLevels(draggedHeader, targetHeader) {
    try {
        showLoading();
        
        const draggedLevelId = draggedHeader.dataset.levelId;
        const targetLevelId = targetHeader.dataset.levelId;
        
        // Find positions in current level array
        const draggedIndex = currentLevelConfigs.competitionLevels.findIndex(level => level.id === draggedLevelId);
        const targetIndex = currentLevelConfigs.competitionLevels.findIndex(level => level.id === targetLevelId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        // Reorder array
        const [draggedItem] = currentLevelConfigs.competitionLevels.splice(draggedIndex, 1);
        currentLevelConfigs.competitionLevels.splice(targetIndex, 0, draggedItem);
        
        // Update sort orders and save to Firestore
        const firestore = window.firestore;
        const batch = firestore.batch();
        
        currentLevelConfigs.competitionLevels.forEach((level, index) => {
            level.sortOrder = index + 1; // Start from 1 instead of 0
            const levelRef = firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('competition')
                .doc(level.id);
            batch.update(levelRef, { sortOrder: index + 1 });
        });
        
        await batch.commit();
        
        showToast('Competition level order updated successfully', 'success');
        
        // Refresh display
        displayCompetitionMeritRoles();
        
    } catch (error) {
        console.error('Error reordering competition levels:', error);
        showToast('Error updating competition level order: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================
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
    
    // Scroll to top and add keyboard listeners
    scrollModalToTop('eventMeritModal');
    addModalKeyboardListeners('eventMeritModal', 
        () => document.getElementById('saveEventMeritBtn').click(),
        closeEventMeritModal
    );
}

function closeEventMeritModal() {
    removeModalKeyboardListeners('eventMeritModal');
    document.getElementById('eventMeritModal').classList.add('d-none');
}

function closeCompetitionMeritModal() {
    removeModalKeyboardListeners('competitionMeritModal');
    document.getElementById('competitionMeritModal').classList.add('d-none');
}

function openLevelModal(type) {
    // Show information about the hierarchical level system
    const levelInfo = type === 'event' 
        ? 'Event levels are managed through the hierarchical database structure.\nLevels: College → Block → University → National → International'
        : 'Competition levels are managed through the hierarchical database structure.\nLevels: Block → Faculty → University → Interuniversity → State → National → International → International';
    
    showToast(`Level Management: ${levelInfo}`, 'info');
    console.log(`📊 Level Management (${type}):`, levelInfo);
}

// New modal functions for Add Level and Add Role
let currentLevelType = null;
let currentRoleCategory = null;

function openAddLevelModal(type) {
    currentLevelType = type;
    document.getElementById('levelModalTitle').textContent = `Add ${type === 'event' ? 'Event' : 'Competition'} Level`;
    
    // Reset form
    document.getElementById('levelForm').reset();
    
    // Populate merit values sections based on level type
    populateAddLevelMeritValues(type);
    
    document.getElementById('addLevelModal').classList.remove('d-none');
    
    // Scroll to top and add keyboard listeners
    scrollModalToTop('addLevelModal');
    addModalKeyboardListeners('addLevelModal',
        () => document.getElementById('saveLevelBtn').click(),
        closeLevelModal
    );
}

function closeLevelModal() {
    removeModalKeyboardListeners('addLevelModal');
    document.getElementById('addLevelModal').classList.add('d-none');
    currentLevelType = null;
}

function populateAddLevelMeritValues(type) {
    if (type === 'event') {
        // Show event sections, hide competition section
        document.getElementById('addLevelCommitteeSection').style.display = 'block';
        document.getElementById('addLevelNonCommitteeSection').style.display = 'block';
        document.getElementById('addLevelCompetitionSection').style.display = 'none';
        
        // Populate committee roles
        populateAddLevelRoleSection('addLevelCommitteeRoles', currentEventMeritValues.committee);
        
        // Populate non-committee roles  
        populateAddLevelRoleSection('addLevelNonCommitteeRoles', currentEventMeritValues.nonCommittee);
    } else if (type === 'competition') {
        // Show competition section, hide event sections
        document.getElementById('addLevelCommitteeSection').style.display = 'none';
        document.getElementById('addLevelNonCommitteeSection').style.display = 'none';
        document.getElementById('addLevelCompetitionSection').style.display = 'block';
        
        // Populate competition roles
        populateAddLevelRoleSection('addLevelCompetitionRoles', currentCompetitionMeritValues);
    }
}

function populateAddLevelRoleSection(containerId, roles) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (!roles || Object.keys(roles).length === 0) {
        container.innerHTML = '<p class="text-sm text-secondary">No roles defined yet</p>';
        return;
    }
    
    Object.entries(roles).forEach(([roleId, roleData]) => {
        const roleInput = document.createElement('div');
        roleInput.className = 'role-merit-container';
        roleInput.innerHTML = `
            <div class="flex flex-col">
                <span class="font-medium text-sm">${roleData.nameBM || 'Unknown'}</span>
                <span class="text-xs text-secondary">${roleData.nameEN || 'Unknown'}</span>
            </div>
            <input type="number" 
                   class="form-control w-20 role-level-merit-input" 
                   data-role-id="${roleId}"
                   min="0" 
                   value="0" 
                   placeholder="0">
        `;
        container.appendChild(roleInput);
    });
}

// Variables for editing levels
let currentEditingLevelId = null;
let currentEditingLevelType = null;

// Show level selection modal for editing levels
function showLevelSelectionModal(type) {
    const levels = type === 'event' ? currentLevelConfigs.eventLevels : currentLevelConfigs.competitionLevels;
    
    if (!levels || levels.length === 0) {
        showToast(`No ${type} levels found to edit`, 'error');
        return;
    }
    
    // Create list items for the levels
    const levelItems = levels.map(level => `
        <div class="level-item" data-level-id="${level.id}" style="
            padding: 12px 16px; 
            border: 1px solid #e5e7eb; 
            border-radius: 6px; 
            margin-bottom: 8px; 
            cursor: pointer; 
            transition: all 0.2s ease;
            background: white;
        " onmouseover="this.style.background='#f3f4f6'; this.style.borderColor='#6366f1';" 
           onmouseout="this.style.background='white'; this.style.borderColor='#e5e7eb';"
           onclick="selectAndEditLevel('${level.id}', '${type}')">
            <div style="font-weight: 500; color: #374151;">${level.nameEN}</div>
            ${level.nameBM ? `<div style="font-size: 14px; color: #6b7280; margin-top: 2px;">${level.nameBM}</div>` : ''}
        </div>
    `).join('');
    
    // Show list with level selection
    const levelListHtml = `
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 10px; font-weight: 500; color: #374151;">
                Select ${type === 'event' ? 'Event' : 'Competition'} Level to Edit:
            </label>
            <div id="levelList" style="
                border: 1px solid #e5e7eb; 
                border-radius: 8px; 
                padding: 8px;
                background: #f9fafb;
            ">
                ${levelItems}
            </div>
        </div>
    `;
    
    // Create modal using standard modal structure to match edit modal size
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'levelSelectionOverlay';
    modalOverlay.className = 'modal';
    modalOverlay.style.display = 'flex';
    
    // Create the background overlay
    const backgroundOverlay = document.createElement('div');
    backgroundOverlay.className = 'modal-overlay';
    backgroundOverlay.onclick = () => closeLevelSelectionModal();
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h3 class="modal-title">Select Level to Edit</h3>
            <button onclick="closeLevelSelectionModal()" class="modal-close-btn">×</button>
        </div>
        <div class="modal-body">
            ${levelListHtml}
            <p style="font-size: 14px; color: #6b7280; margin-top: 16px; text-align: center;">
                Click on any level to edit it
            </p>
        </div>
    `;
    
    modalOverlay.appendChild(backgroundOverlay);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    
    // Scroll to top and add keyboard listeners
    setTimeout(() => {
        modalContent.scrollTop = 0;
        modalOverlay.setAttribute('tabindex', '-1');
        modalOverlay.focus();
    }, 10);
    
    // Add keyboard event listener for the level selection modal
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeLevelSelectionModal();
        }
    };
    
    modalOverlay.addEventListener('keydown', handleKeyPress);
    modalOverlay._keyboardHandler = handleKeyPress;
    
    // Global function to close level selection modal
    window.closeLevelSelectionModal = function() {
        const overlay = document.getElementById('levelSelectionOverlay');
        if (overlay) {
            // Clean up keyboard listener
            if (overlay._keyboardHandler) {
                overlay.removeEventListener('keydown', overlay._keyboardHandler);
                delete overlay._keyboardHandler;
            }
            document.body.removeChild(overlay);
        }
    };
    
    // Global function to handle level selection and immediately edit
    window.selectAndEditLevel = function(levelId, levelType) {
        // Close the selection modal
        closeLevelSelectionModal();
        
        // Immediately open the edit modal for the selected level
        editLevel(levelId, levelType);
    };
}

function editLevel(levelId, type) {
    currentEditingLevelId = levelId;
    currentEditingLevelType = type;
    
    // Find the level data
    const levels = type === 'event' ? currentLevelConfigs.eventLevels : currentLevelConfigs.competitionLevels;
    const levelData = levels.find(level => level.id === levelId);
    
    if (!levelData) {
        showToast('Level not found', 'error');
        return;
    }
    
    // Update modal title
    document.getElementById('editLevelModalTitle').textContent = `Edit ${type === 'event' ? 'Event' : 'Competition'} Level`;
    
    // Populate form
    document.getElementById('editLevelNameEN').value = levelData.nameEN || '';
    document.getElementById('editLevelNameBM').value = levelData.nameBM || '';
    document.getElementById('editLevelSortOrder').value = levelData.sortOrder !== undefined ? levelData.sortOrder : '';
    
    // Populate merit values for all roles at this level
    populateRoleMeritValuesForLevel(levelId);
    
    // Show modal
    document.getElementById('editLevelModal').classList.remove('d-none');
    
    // Scroll to top and add keyboard listeners
    scrollModalToTop('editLevelModal');
    addModalKeyboardListeners('editLevelModal',
        () => document.getElementById('updateLevelBtn').click(),
        closeEditLevelModal
    );
}

function populateRoleMeritValuesForLevel(levelId) {
    const committeeContainer = document.getElementById('editLevelCommitteeRoles');
    const nonCommitteeContainer = document.getElementById('editLevelNonCommitteeRoles');
    const competitionContainer = document.getElementById('editLevelCompetitionRoles');
    const committeeSection = document.getElementById('editLevelCommitteeSection');
    const nonCommitteeSection = document.getElementById('editLevelNonCommitteeSection');
    const competitionSection = document.getElementById('editLevelCompetitionSection');
    
    // Clear containers
    if (committeeContainer) committeeContainer.innerHTML = '';
    if (nonCommitteeContainer) nonCommitteeContainer.innerHTML = '';
    if (competitionContainer) competitionContainer.innerHTML = '';
    
    // Check if we're editing an event level or competition level
    if (currentEditingLevelType === 'competition') {
        // Hide event sections, show competition section
        if (committeeSection) committeeSection.style.display = 'none';
        if (nonCommitteeSection) nonCommitteeSection.style.display = 'none';
        if (competitionSection) competitionSection.style.display = 'block';
        
        // Debug: Check what data we have
        console.log('Editing competition level:', levelId);
        console.log('Current competition merit values:', currentCompetitionMeritValues);
        console.log('Competition container found:', !!competitionContainer);
        
        // Generate competition role inputs
        if (currentCompetitionMeritValues && Object.keys(currentCompetitionMeritValues).length > 0 && competitionContainer) {
            const entries = Object.entries(currentCompetitionMeritValues);
            console.log('Competition role entries:', entries);
            
            entries.forEach(([roleId, roleData]) => {
                const currentValue = (roleData.levelValues && roleData.levelValues[levelId]) || 0;
                console.log(`Processing role ${roleId}:`, roleData, 'current value:', currentValue);
                const roleInput = createRoleMeritInput(roleId, roleData, levelId, currentValue, 'competition');
                competitionContainer.appendChild(roleInput);
            });
        } else {
            console.log('No competition merit values or container not found');
            if (competitionContainer) {
                competitionContainer.innerHTML = '<p class="text-sm text-secondary">No competition achievements defined yet. Go to the Competition Merits tab to create some achievements first.</p>';
            }
        }
    } else {
        // Show event sections, hide competition section
        if (committeeSection) committeeSection.style.display = 'block';
        if (nonCommitteeSection) nonCommitteeSection.style.display = 'block';
        if (competitionSection) competitionSection.style.display = 'none';
        
        // Generate committee role inputs
        if (currentEventMeritValues.committee && committeeContainer) {
            Object.entries(currentEventMeritValues.committee).forEach(([roleId, roleData]) => {
                const currentValue = (roleData.levelValues && roleData.levelValues[levelId]) || 0;
                const roleInput = createRoleMeritInput(roleId, roleData, levelId, currentValue, 'committee');
                committeeContainer.appendChild(roleInput);
            });
        }
        
        // Generate non-committee role inputs
        if (currentEventMeritValues.nonCommittee && nonCommitteeContainer) {
            Object.entries(currentEventMeritValues.nonCommittee).forEach(([roleId, roleData]) => {
                const currentValue = (roleData.levelValues && roleData.levelValues[levelId]) || 0;
                const roleInput = createRoleMeritInput(roleId, roleData, levelId, currentValue, 'nonCommittee');
                nonCommitteeContainer.appendChild(roleInput);
            });
        }
    }
}

function createRoleMeritInput(roleId, roleData, levelId, currentValue, category) {
    const div = document.createElement('div');
    div.className = 'role-merit-container';
    
    div.innerHTML = `
        <div class="role-info">
            <div class="role-name-bm">${roleData.nameBM || 'Unknown Role'}</div>
            <div class="role-name-en">${roleData.nameEN || 'Unknown'}</div>
        </div>
        <div class="merit-input-container">
            <input 
                type="number" 
                min="0" 
                step="1"
                class="role-merit-input" 
                value="${currentValue}"
                data-role-id="${roleId}"
                data-level-id="${levelId}"
                data-category="${category}"
                placeholder="0"
            >
        </div>
    `;
    
    return div;
}

function closeEditLevelModal() {
    removeModalKeyboardListeners('editLevelModal');
    document.getElementById('editLevelModal').classList.add('d-none');
    currentEditingLevelId = null;
    currentEditingLevelType = null;
}

async function updateLevel() {
    try {
        const nameEN = document.getElementById('editLevelNameEN').value.trim();
        const nameBM = document.getElementById('editLevelNameBM').value.trim();
        const sortOrderInput = document.getElementById('editLevelSortOrder').value;
        const sortOrder = sortOrderInput ? Math.max(parseInt(sortOrderInput), 1) : 999;
        
        if (!nameEN || !nameBM) {
            showToast('Please fill in both English and Malay names', 'error');
            return;
        }
        
        if (!currentEditingLevelId || !currentEditingLevelType) {
            showToast('Invalid level data', 'error');
            return;
        }
        
        showLoading();
        
        // Update level data
        const levelData = {
            id: currentEditingLevelId,
            nameEN: nameEN,
            nameBM: nameBM,
            type: currentEditingLevelType,
            sortOrder: sortOrder,
            updated: new Date()
        };
        
        // Save level data to hierarchical structure
        const firestore = window.firestore;
        await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection(currentEditingLevelType)
            .doc(currentEditingLevelId)
            .update(levelData);
        
        // Update merit values for all roles at this level
        await updateRoleMeritValuesForLevel();
        
        console.log('Level updated successfully:', levelData);
        showToast(`${levelData.nameEN} level updated successfully!`, 'success');
        
        // Close modal
        closeEditLevelModal();
        hideLoading();
        
        // Reload level configurations and appropriate merit values
        await loadLevelConfigurations();
        if (currentEditingLevelType === 'competition') {
            await loadCompetitionMeritValues();
        } else {
            await loadEventMeritValues();
        }
        
    } catch (error) {
        console.error('Error updating level:', error);
        showToast('Error updating level: ' + error.message, 'error');
        hideLoading();
    }
}

async function updateRoleMeritValuesForLevel() {
    const firestore = window.firestore;
    const batch = firestore.batch();
    
    // Get all role merit inputs
    const meritInputs = document.querySelectorAll('.role-merit-input');
    
    meritInputs.forEach(input => {
        const roleId = input.dataset.roleId;
        const levelId = input.dataset.levelId;
        const category = input.dataset.category;
        const newValue = parseInt(input.value) || 0;
        
        // Update the local data structure based on level type
        if (currentEditingLevelType === 'competition') {
            if (currentCompetitionMeritValues && currentCompetitionMeritValues[roleId]) {
                if (!currentCompetitionMeritValues[roleId].levelValues) {
                    currentCompetitionMeritValues[roleId].levelValues = {};
                }
                currentCompetitionMeritValues[roleId].levelValues[levelId] = newValue;
                
                // Add to batch update for competition roles
                const roleRef = firestore.collection('meritValues')
                    .doc('roleMetadata')
                    .collection('competition')
                    .doc(roleId);
                
                batch.update(roleRef, {
                    [`levelValues.${levelId}`]: newValue,
                    updated: new Date()
                });
            }
        } else {
            // Handle event roles (committee/nonCommittee)
            if (currentEventMeritValues[category] && currentEventMeritValues[category][roleId]) {
                if (!currentEventMeritValues[category][roleId].levelValues) {
                    currentEventMeritValues[category][roleId].levelValues = {};
                }
                currentEventMeritValues[category][roleId].levelValues[levelId] = newValue;
                
                // Add to batch update for event roles
                const roleRef = firestore.collection('meritValues')
                    .doc('roleMetadata')
                    .collection(category)
                    .doc(roleId);
                
                batch.update(roleRef, {
                    [`levelValues.${levelId}`]: newValue,
                    updated: new Date()
                });
            }
        }
    });
    
    // Execute batch update
    if (meritInputs.length > 0) {
        await batch.commit();
        console.log('Role merit values updated successfully');
    }
}

async function deleteLevel() {
    if (!currentEditingLevelId || !currentEditingLevelType) {
        showToast('Invalid level data', 'error');
        return;
    }
    
    // Find the level data for confirmation
    const levels = currentEditingLevelType === 'event' ? currentLevelConfigs.eventLevels : currentLevelConfigs.competitionLevels;
    const levelData = levels.find(level => level.id === currentEditingLevelId);
    
    if (!levelData) {
        showToast('Level not found', 'error');
        return;
    }
    
    // Confirm deletion
    const confirmDelete = confirm(
        `Are you sure you want to delete the "${levelData.nameEN}" level?\n\n` +
        'This will:\n' +
        '• Remove this level from all existing roles\n' +
        '• Delete all merit values associated with this level\n' +
        '• Cannot be undone\n\n' +
        'Type "DELETE" to confirm:'
    );
    
    if (!confirmDelete) {
        return;
    }
    
    const confirmText = prompt('Type "DELETE" to confirm deletion:');
    if (confirmText !== 'DELETE') {
        showToast('Deletion cancelled', 'info');
        return;
    }
    
    try {
        showLoading();
        
        const firestore = window.firestore;
        
        // Delete the level document
        await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection(currentEditingLevelType)
            .doc(currentEditingLevelId)
            .delete();
        
        console.log('Level deleted successfully:', levelData.nameEN);
        showToast(`${levelData.nameEN} level deleted successfully!`, 'success');
        
        // Close modal
        closeEditLevelModal();
        hideLoading();
        
        // Reload everything to reflect the changes
        await loadLevelConfigurations();
        
    } catch (error) {
        console.error('Error deleting level:', error);
        showToast('Error deleting level: ' + error.message, 'error');
        hideLoading();
    }
}

// Duplicate current level from edit modal
async function duplicateCurrentLevel() {
    if (!currentEditingLevelId || !currentEditingLevelType) {
        showToast('Invalid level data', 'error');
        return;
    }
    
    try {
        showLoading();
        
        // Get the original level data
        let originalLevelData;
        if (currentEditingLevelType === 'event') {
            originalLevelData = currentLevelConfigs.eventLevels.find(level => level.id === currentEditingLevelId);
        } else {
            originalLevelData = currentLevelConfigs.competitionLevels.find(level => level.id === currentEditingLevelId);
        }
        
        if (!originalLevelData) {
            showToast('Original level not found', 'error');
            return;
        }
        
        // Create a copy of the level data
        const duplicatedLevelData = {
            ...originalLevelData,
            nameEN: `${originalLevelData.nameEN} (Copy)`,
            nameBM: `${originalLevelData.nameBM} (Copy)`,
            sortOrder: (originalLevelData.sortOrder || 0) + 1
        };
        
        // Remove the ID so it gets a new one
        delete duplicatedLevelData.id;
        
        // Generate new ID
        const newLevelId = firebase.firestore().collection('temp').doc().id;
        
        // Save to Firestore
        const firestore = window.firestore;
        const collectionPath = currentEditingLevelType === 'event' ? 'eventLevels' : 'competitionLevels';
        
        await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection(collectionPath)
            .doc(newLevelId)
            .set(duplicatedLevelData);
        
        console.log('Level duplicated successfully:', duplicatedLevelData);
        showToast(`${duplicatedLevelData.nameEN} level duplicated successfully!`, 'success');
        
        // Close modal and reload data
        closeEditLevelModal();
        await loadLevelConfigurations();
        
    } catch (error) {
        console.error('Error duplicating level:', error);
        showToast('Error duplicating level: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function openAddRoleModal(category) {
    currentRoleCategory = category;
    editingRole = null; // Reset editing state
    
    const titles = {
        committee: 'Add Committee Role',
        nonCommittee: 'Add Non-Committee Role',
        competition: 'Add Competition Achievement'
    };
    
    document.getElementById('roleModalTitle').textContent = titles[category] || 'Add Role';
    
    // Reset form
    document.getElementById('roleForm').reset();
    
    // Reset save button text
    document.getElementById('saveRoleBtn').textContent = 'Save Role';
    
    // Generate level inputs dynamically based on category
    generateRoleLevelInputs(category);
    
    document.getElementById('addRoleModal').classList.remove('d-none');
    
    // Scroll to top and add keyboard listeners
    scrollModalToTop('addRoleModal');
    addModalKeyboardListeners('addRoleModal',
        () => document.getElementById('saveRoleBtn').click(),
        closeRoleModal
    );
}

function closeRoleModal() {
    removeModalKeyboardListeners('addRoleModal');
    document.getElementById('addRoleModal').classList.add('d-none');
    currentRoleCategory = null;
    editingRole = null;
}

// Variable to track role being edited
let editingRole = null;

function editRoleInNewModal(roleId, category) {
    // Get role data
    const roleData = currentEventMeritValues[category === 'committee' ? 'committee' : 'nonCommittee'][roleId];
    
    if (!roleData) return;
    
    // Set editing mode
    editingRole = { id: roleId, category };
    currentRoleCategory = category;
    
    // Update modal title
    const titles = {
        committee: 'Edit Committee Role',
        nonCommittee: 'Edit Non-Committee Role', 
        competition: 'Edit Competition Achievement'
    };
    document.getElementById('roleModalTitle').textContent = titles[category] || 'Edit Role';
    
    // Populate basic fields
    document.getElementById('roleNameEN').value = roleData.nameEN || roleData.nameBM || '';
    document.getElementById('roleNameBM').value = roleData.nameBM || roleData.nameEN || '';
    
    // Generate level inputs
    generateRoleLevelInputs(category);
    
    // Populate level values after inputs are generated
    setTimeout(() => {
        const levelInputs = document.querySelectorAll('#roleLevelInputs .level-input');
        levelInputs.forEach(input => {
            const levelId = input.dataset.levelId;
            let value = 0;
            
            // Get value from hierarchical format only
            if (roleData.levelValues && roleData.levelValues[levelId] !== undefined) {
                value = roleData.levelValues[levelId];
            }
            
            input.value = value || 0;
        });
    }, 50);
    
    // Update save button text
    document.getElementById('saveRoleBtn').textContent = 'Update Role';
    
    // Open modal
    document.getElementById('addRoleModal').classList.remove('d-none');
}

// New editRole function similar to editLevel
function editRole(roleId, category) {
    currentEditingRoleId = roleId;
    currentEditingRoleCategory = category;
    
    // Get role data based on category
    let roleData;
    if (category === 'competition') {
        roleData = currentCompetitionMeritValues[roleId];
    } else {
        roleData = currentEventMeritValues[category === 'committee' ? 'committee' : 'nonCommittee'][roleId];
    }
    
    if (!roleData) {
        showToast('Role not found', 'error');
        return;
    }
    
    // Update modal title
    const titles = {
        committee: 'Committee Member Role',
        nonCommittee: 'Non Committee Role',
        competition: 'Competition Achievement'
    };
    document.getElementById('editRoleModalTitle').textContent = `Edit ${titles[category] || 'Role'}`;
    
    // Populate basic fields
    document.getElementById('editRoleNameEN').value = roleData.nameEN || '';
    document.getElementById('editRoleNameBM').value = roleData.nameBM || '';
    document.getElementById('editRoleSortOrder').value = roleData.sortOrder !== undefined ? roleData.sortOrder : '';
    
    // Populate merit values for all levels for this role
    populateRoleMeritValuesForRole(roleId, roleData, category);
    
    // Show modal
    document.getElementById('editRoleModal').classList.remove('d-none');
    
    // Scroll to top and add keyboard listeners
    scrollModalToTop('editRoleModal');
    addModalKeyboardListeners('editRoleModal',
        () => document.getElementById('updateRoleBtn')?.click() || updateRole(),
        closeEditRoleModal
    );
}

function populateRoleMeritValuesForRole(roleId, roleData, category) {
    const levelsContainer = document.getElementById('editRoleLevels');
    
    // Clear container
    levelsContainer.innerHTML = '';
    
    // Determine which levels to use based on category
    const levels = category === 'competition' ? 
        currentLevelConfigs.competitionLevels : 
        currentLevelConfigs.eventLevels;
    
    // Generate level inputs
    if (currentLevelConfigs && levels) {
        levels.forEach(level => {
            const currentValue = (roleData.levelValues && roleData.levelValues[level.id]) || 0;
            const levelInput = createLevelMeritInput(level, currentValue);
            levelsContainer.appendChild(levelInput);
        });
    }
}

function createLevelMeritInput(level, currentValue) {
    const div = document.createElement('div');
    div.className = 'role-merit-container';
    
    div.innerHTML = `
        <div class="role-info">
            <div class="role-name-bm">${level.nameBM || 'Unknown Level'}</div>
            <div class="role-name-en">${level.nameEN || 'Unknown'}</div>
        </div>
        <div class="merit-input-container">
            <input 
                type="number" 
                min="0" 
                step="1"
                class="role-level-merit-input" 
                value="${currentValue}"
                data-level-id="${level.id}"
                placeholder="0"
            >
        </div>
    `;
    
    return div;
}

function closeEditRoleModal() {
    removeModalKeyboardListeners('editRoleModal');
    document.getElementById('editRoleModal').classList.add('d-none');
    currentEditingRoleId = null;
    currentEditingRoleCategory = null;
}

async function updateRole() {
    try {
        const nameEN = document.getElementById('editRoleNameEN').value.trim();
        const nameBM = document.getElementById('editRoleNameBM').value.trim();
        const sortOrderInput = document.getElementById('editRoleSortOrder').value;
        const sortOrder = sortOrderInput ? Math.max(parseInt(sortOrderInput), 1) : 999;
        
        if (!nameEN || !nameBM) {
            showToast('Please fill in both English and Malay names', 'error');
            return;
        }
        
        if (!currentEditingRoleId || !currentEditingRoleCategory) {
            showToast('Invalid role data', 'error');
            return;
        }
        
        showLoading();
        
        // Collect merit values from inputs
        const levelValues = {};
        const levelInputs = document.querySelectorAll('.role-level-merit-input');
        levelInputs.forEach(input => {
            const levelId = input.dataset.levelId;
            const value = parseInt(input.value) || 0;
            levelValues[levelId] = value;
        });
        
        // Update role data
        const roleData = {
            id: currentEditingRoleId,
            nameEN: nameEN,
            nameBM: nameBM,
            sortOrder: sortOrder,
            levelValues: levelValues,
            category: currentEditingRoleCategory,
            updated: new Date()
        };
        
        // Save to hierarchical structure
        const firestore = window.firestore;
        let collectionPath;
        if (currentEditingRoleCategory === 'competition') {
            collectionPath = 'competition';
        } else {
            collectionPath = currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee';
        }
        
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(collectionPath)
            .doc(currentEditingRoleId)
            .update(roleData);
        
        // Update local data
        if (currentEditingRoleCategory === 'competition') {
            currentCompetitionMeritValues[currentEditingRoleId] = roleData;
        } else {
            const localCollection = currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee';
            currentEventMeritValues[localCollection][currentEditingRoleId] = roleData;
        }
        
        console.log('Role updated successfully:', roleData);
        showToast(`${roleData.nameBM} role updated successfully!`, 'success');
        
        // Close modal
        closeEditRoleModal();
        
        // Refresh display
        if (currentEditingRoleCategory === 'competition') {
            displayCompetitionMeritRoles();
        } else {
            displayEventMeritRoles();
        }
        
    } catch (error) {
        console.error('Error updating role:', error);
        showToast('Error updating role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteRole() {
    if (!currentEditingRoleId || !currentEditingRoleCategory) {
        showToast('Invalid role data', 'error');
        return;
    }
    
    // Get role data for confirmation
    let roleData;
    if (currentEditingRoleCategory === 'competition') {
        roleData = currentCompetitionMeritValues[currentEditingRoleId];
    } else {
        roleData = currentEventMeritValues[currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee'][currentEditingRoleId];
    }
    
    if (!roleData) {
        showToast('Role not found', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete the role "${roleData.nameBM}" (${roleData.nameEN})? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading();
        
        const firestore = window.firestore;
        let collectionPath;
        if (currentEditingRoleCategory === 'competition') {
            collectionPath = 'competition';
        } else {
            collectionPath = currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee';
        }
        
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(collectionPath)
            .doc(currentEditingRoleId)
            .delete();
        
        // Update local data
        if (currentEditingRoleCategory === 'competition') {
            delete currentCompetitionMeritValues[currentEditingRoleId];
        } else {
            const localCollection = currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee';
            delete currentEventMeritValues[localCollection][currentEditingRoleId];
        }
        
        console.log('Role deleted successfully:', roleData);
        showToast(`${roleData.nameBM} role deleted successfully!`, 'success');
        
        // Store category before closing modal (as it gets cleared)
        const categoryToRefresh = currentEditingRoleCategory;
        
        // Close modal
        closeEditRoleModal();
        
        // Refresh display
        if (categoryToRefresh === 'competition') {
            displayCompetitionMeritRoles();
        } else {
            displayEventMeritRoles();
        }
        
    } catch (error) {
        console.error('Error deleting role:', error);
        showToast('Error deleting role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Confirm and delete role with proper setup
function confirmDeleteRole(roleId, category) {
    currentEditingRoleId = roleId;
    currentEditingRoleCategory = category;
    deleteRole();
}

// Duplicate role function
async function duplicateRole(roleId, category) {
    try {
        showLoading();
        
        // Get the original role data
        let originalRoleData;
        if (category === 'competition') {
            originalRoleData = currentCompetitionMeritValues[roleId];
        } else {
            const collection = category === 'committee' ? 'committee' : 'nonCommittee';
            originalRoleData = currentEventMeritValues[collection][roleId];
        }
        
        if (!originalRoleData) {
            showToast('Original role not found', 'error');
            return;
        }
        
        // Create a copy of the role data
        const duplicatedRoleData = {
            ...originalRoleData,
            nameBM: `${originalRoleData.nameBM} (Copy)`,
            nameEN: `${originalRoleData.nameEN} (Copy)`,
            sortOrder: (originalRoleData.sortOrder || 0) + 1
        };
        
        // Generate new ID
        const newRoleId = firebase.firestore().collection('temp').doc().id;
        
        // Save to Firestore
        const firestore = window.firestore;
        let collectionPath;
        if (category === 'competition') {
            collectionPath = 'competition';
        } else {
            collectionPath = category === 'committee' ? 'committee' : 'nonCommittee';
        }
        
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(collectionPath)
            .doc(newRoleId)
            .set(duplicatedRoleData);
        
        // Update local data
        if (category === 'competition') {
            currentCompetitionMeritValues[newRoleId] = duplicatedRoleData;
        } else {
            const localCollection = category === 'committee' ? 'committee' : 'nonCommittee';
            currentEventMeritValues[localCollection][newRoleId] = duplicatedRoleData;
        }
        
        console.log('Role duplicated successfully:', duplicatedRoleData);
        showToast(`${duplicatedRoleData.nameBM} duplicated successfully!`, 'success');
        
        // Refresh display
        if (category === 'competition') {
            displayCompetitionMeritRoles();
        } else {
            displayEventMeritRoles();
        }
        
    } catch (error) {
        console.error('Error duplicating role:', error);
        showToast('Error duplicating role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Duplicate current role from edit modal
async function duplicateCurrentRole() {
    if (!currentEditingRoleId || !currentEditingRoleCategory) {
        showToast('Invalid role data', 'error');
        return;
    }
    
    await duplicateRole(currentEditingRoleId, currentEditingRoleCategory);
    closeEditRoleModal();
}

function generateRoleLevelInputs(category) {
    const levelInputsContainer = document.getElementById('roleLevelInputs');
    let levels = [];
    
    // Load levels dynamically from database
    if (category === 'committee' || category === 'nonCommittee') {
        // Event levels from hierarchical database
        if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
            levels = currentLevelConfigs.eventLevels;
        }
    } else if (category === 'competition') {
        // Competition levels from hierarchical database
        if (currentLevelConfigs && currentLevelConfigs.competitionLevels) {
            levels = currentLevelConfigs.competitionLevels;
        }
    }
    
    // Generate HTML for level inputs
    let html = '';
    if (levels.length === 0) {
        html = `
            <div class="text-center text-secondary py-4">
                <p class="text-sm text-secondary">No levels configured yet.</p>
                <p class="text-sm text-secondary">Use "Add Level" to create level configurations first.</p>
            </div>
        `;
    } else {
        levels.forEach(level => {
            const levelNameBM = level.nameBM || level.name || level.key || 'Unknown';
            const levelNameEN = level.nameEN || level.name || level.key || 'Unknown';
            const levelId = level.id || level.key || levelNameBM.toLowerCase();
            const fieldId = `roleLevel_${levelId}`;
            
            html += `
                <div class="role-merit-container">
                    <div class="role-info">
                        <div class="role-name-bm">${levelNameBM}</div>
                        <div class="role-name-en">${levelNameEN}</div>
                    </div>
                    <div class="merit-input-container">
                        <input type="number" 
                               id="${fieldId}" 
                               class="role-merit-input" 
                               min="0" 
                               step="1"
                               placeholder="0" 
                               value="0"
                               data-level-id="${levelId}"
                               data-level-name="${levelNameBM}">
                    </div>
                </div>
            `;
        });
    }
    
    levelInputsContainer.innerHTML = html;
}

function editEventMeritRole(roleId, category) {
    const roleData = currentEventMeritValues[category === 'committee' ? 'committee' : 'nonCommittee'][roleId];
    
    if (!roleData) return;
    
    editingEventRole = { id: roleId, category };
    document.getElementById('eventMeritModalTitle').textContent = 'Edit Event Merit Role';
    
    // Populate form
    document.getElementById('eventRoleNameBM').value = roleData.nameBM || '';
    document.getElementById('eventRoleNameEN').value = roleData.nameEN || '';
    document.getElementById('eventRoleCategory').value = category;
    document.getElementById('eventRoleSortOrder').value = roleData.sortOrder !== undefined ? roleData.sortOrder : '';
    
    eventLevels.forEach(level => {
        const element = document.getElementById('eventRole' + level.charAt(0).toUpperCase() + level.slice(1));
        if (element) {
            element.value = roleData[level] || 0;
        }
    });
    
    document.getElementById('eventMeritModal').classList.remove('d-none');
}

function editCompetitionMeritRole(achievementId) {
    const achievementData = currentCompetitionMeritValues[achievementId];
    
    if (!achievementData) return;
    
    editingCompetitionRole = achievementId;
    document.getElementById('competitionMeritModalTitle').textContent = 'Edit Competition Achievement';
    
    // Populate form
    document.getElementById('competitionNameBM').value = achievementData.nameBM || '';
    document.getElementById('competitionNameEN').value = achievementData.nameEN || '';
    document.getElementById('competitionSortOrder').value = achievementData.sortOrder !== undefined ? achievementData.sortOrder : '';
    
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

        const roleId = editingEventRole ? editingEventRole.id : generateUniqueId();
        const roleData = {
            id: roleId,
            nameBM,
            nameEN
        };

        // Handle sort order - use user input or auto-assign
        const sortOrderInput = document.getElementById('eventRoleSortOrder').value;
        if (sortOrderInput && !isNaN(sortOrderInput)) {
            // Use user-provided sort order (minimum value of 1)
            roleData.sortOrder = Math.max(parseInt(sortOrderInput), 1);
        } else if (editingEventRole) {
            // Keep existing sort order when editing without input
            const existingRole = currentEventMeritValues[category === 'committee' ? 'committee' : 'nonCommittee'][roleId];
            roleData.sortOrder = existingRole?.sortOrder !== undefined ? existingRole.sortOrder : await getNextSortOrder('event', category);
        } else {
            // Assign new sort order at the end for new roles
            roleData.sortOrder = await getNextSortOrder('event', category);
        }

        // Add level values
        eventLevels.forEach(level => {
            const element = document.getElementById('eventRole' + level.charAt(0).toUpperCase() + level.slice(1));
            if (element) {
                roleData[level] = parseInt(element.value) || 0;
            }
        });

        const collectionPath = category === 'committee' ? 'committee' : 'nonCommittee';

        // Update local data
        if (!currentEventMeritValues[collectionPath]) {
            currentEventMeritValues[collectionPath] = {};
        }
        currentEventMeritValues[collectionPath][roleId] = roleData;

        // Save to Firestore
        await firestore.collection('eventMeritValues').doc(collectionPath).set({
            [roleId]: roleData
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

        const achievementId = editingCompetitionRole || generateUniqueId();
        const achievementData = {
            id: achievementId,
            nameBM,
            nameEN
        };

        // Handle sort order - use user input or auto-assign
        const sortOrderInput = document.getElementById('competitionSortOrder').value;
        if (sortOrderInput && !isNaN(sortOrderInput)) {
            // Use user-provided sort order (minimum value of 1)
            achievementData.sortOrder = Math.max(parseInt(sortOrderInput), 1);
        } else if (editingCompetitionRole) {
            // Keep existing sort order when editing without input
            const existingAchievement = currentCompetitionMeritValues[achievementId];
            achievementData.sortOrder = existingAchievement?.sortOrder !== undefined ? existingAchievement.sortOrder : await getNextSortOrder('competition');
        } else {
            // Assign new sort order at the end for new achievements
            achievementData.sortOrder = await getNextSortOrder('competition');
        }

        // Add level values
        competitionLevels.forEach(level => {
            const fieldName = level.charAt(0).toUpperCase() + level.slice(1);
            const element = document.getElementById('competition' + fieldName);
            if (element) {
                achievementData[level] = parseInt(element.value) || 0;
            }
        });

        // Update local data
        currentCompetitionMeritValues[achievementId] = achievementData;

        // Save to Firestore
        await firestore.collection('competitionMeritValues').doc(achievementId).set(achievementData);

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

async function deleteEventMeritRole(roleId, category) {
    if (!confirm('Are you sure you want to delete this role?')) {
        return;
    }

    try {
        showLoading();

        const collectionPath = category === 'committee' ? 'committee' : 'nonCommittee';

        // Remove from local data
        delete currentEventMeritValues[collectionPath][roleId];

        // Remove from Firestore hierarchical structure
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(collectionPath)
            .doc(roleId)
            .delete();

        showToast('Role deleted successfully', 'success');
        displayEventMeritRoles();

    } catch (error) {
        console.error('Error deleting role:', error);
        showToast('Error deleting role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteCompetitionMeritRole(achievementId) {
    if (!confirm('Are you sure you want to delete this achievement?')) {
        return;
    }

    try {
        showLoading();

        // Remove from local data
        delete currentCompetitionMeritValues[achievementId];

        // Remove from Firestore hierarchical structure
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection('competition')
            .doc(achievementId)
            .delete();

        showToast('Achievement deleted successfully', 'success');
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error deleting achievement:', error);
        showToast('Error deleting achievement: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
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

async function saveAllChanges() {
    showToast('All changes are saved automatically', 'success');
}

// Save functions for new modals
async function saveLevelData() {
    try {
        const nameEN = document.getElementById('levelNameEN').value.trim();
        const nameBM = document.getElementById('levelNameBM').value.trim();
        
        if (!nameEN || !nameBM) {
            showToast('Please fill in both English and Malay names', 'error');
            return;
        }
        
        showLoading();
        
        // Get sort order from form or use next available (minimum value of 1)
        const formSortOrder = document.getElementById('levelSortOrder').value;
        const sortOrder = formSortOrder ? Math.max(parseInt(formSortOrder), 1) : await getNextLevelSortOrder(currentLevelType);
        
        // Create level data
        const levelData = {
            id: generateUniqueId(),
            nameEN: nameEN,
            nameBM: nameBM,
            type: currentLevelType,
            sortOrder: sortOrder,
            created: new Date()
        };
        
        // Save to hierarchical structure
        const firestore = window.firestore;
        await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection(currentLevelType)
            .doc(levelData.id)
            .set(levelData);
        
        // Update existing roles with merit values for this level
        await updateRolesWithNewLevel(levelData);
        
        console.log('Level saved successfully:', levelData);
        showToast(`${levelData.nameEN} level added successfully!`, 'success');
        
        // Close modal
        closeLevelModal();
        hideLoading();
        
        // Reload level configurations first, then merit values
        await loadLevelConfigurations();
        
    } catch (error) {
        console.error('Error saving level:', error);
        showToast('Error saving level: ' + error.message, 'error');
        hideLoading();
    }
}

async function updateRolesWithNewLevel(levelData) {
    try {
        const firestore = window.firestore;
        const batch = firestore.batch();
        
        // Get merit values from the form
        const meritValueInputs = document.querySelectorAll('.role-level-merit-input');
        const meritValues = {};
        
        meritValueInputs.forEach(input => {
            const roleId = input.dataset.roleId;
            const value = parseInt(input.value) || 0;
            meritValues[roleId] = value;
        });
        
        // Update roles based on level type
        if (levelData.type === 'event') {
            // Update committee roles
            if (currentEventMeritValues.committee) {
                for (const [roleId, roleData] of Object.entries(currentEventMeritValues.committee)) {
                    if (meritValues[roleId] !== undefined) {
                        if (!roleData.levelValues) roleData.levelValues = {};
                        roleData.levelValues[levelData.id] = meritValues[roleId];
                        
                        const docRef = firestore.collection('meritValues')
                            .doc('roleMetadata')
                            .collection('committee')
                            .doc(roleId);
                        batch.update(docRef, { levelValues: roleData.levelValues });
                    }
                }
            }
            
            // Update non-committee roles
            if (currentEventMeritValues.nonCommittee) {
                for (const [roleId, roleData] of Object.entries(currentEventMeritValues.nonCommittee)) {
                    if (meritValues[roleId] !== undefined) {
                        if (!roleData.levelValues) roleData.levelValues = {};
                        roleData.levelValues[levelData.id] = meritValues[roleId];
                        
                        const docRef = firestore.collection('meritValues')
                            .doc('roleMetadata')
                            .collection('nonCommittee')
                            .doc(roleId);
                        batch.update(docRef, { levelValues: roleData.levelValues });
                    }
                }
            }
        } else if (levelData.type === 'competition') {
            // Update competition roles
            if (currentCompetitionMeritValues) {
                for (const [roleId, roleData] of Object.entries(currentCompetitionMeritValues)) {
                    if (meritValues[roleId] !== undefined) {
                        if (!roleData.levelValues) roleData.levelValues = {};
                        roleData.levelValues[levelData.id] = meritValues[roleId];
                        
                        const docRef = firestore.collection('meritValues')
                            .doc('roleMetadata')
                            .collection('competition')
                            .doc(roleId);
                        batch.update(docRef, { levelValues: roleData.levelValues });
                    }
                }
            }
        }
        
        await batch.commit();
        console.log('Updated roles with new level merit values');
        
    } catch (error) {
        console.error('Error updating roles with new level:', error);
    }
}

async function saveRoleData() {
    try {
        const nameEN = document.getElementById('roleNameEN').value.trim();
        const nameBM = document.getElementById('roleNameBM').value.trim();
        
        if (!nameEN || !nameBM) {
            showToast('Please fill in both English and Malay names', 'error');
            return;
        }
        
        showLoading();
        
        // Collect level values using the level IDs from data attributes
        const levelValues = {};
        const levelInputs = document.querySelectorAll('#roleLevelInputs .level-input');
        levelInputs.forEach(input => {
            const levelId = input.dataset.levelId;
            const value = parseInt(input.value) || 0;
            if (levelId) {
                levelValues[levelId] = value;
            }
        });
        
        // Create or update role data
        let roleData;
        let isEditing = !!editingRole;
        
        if (isEditing) {
            // Update existing role
            roleData = {
                ...editingRole,
                nameEN: nameEN,
                nameBM: nameBM,
                levelValues: levelValues,
                updated: new Date()
            };
        } else {
            // Create new role
            const formSortOrder = document.getElementById('roleSortOrder').value;
            const sortOrder = formSortOrder ? Math.max(parseInt(formSortOrder), 1) : await getNextSortOrder(currentRoleCategory === 'competition' ? 'competition' : 'event', currentRoleCategory);
            
            roleData = {
                id: generateUniqueId(),
                nameEN: nameEN,
                nameBM: nameBM,
                category: currentRoleCategory,
                levelValues: levelValues,
                sortOrder: sortOrder,
                created: new Date()
            };
        }
        
        // Save to hierarchical structure
        const firestore = window.firestore;
        const docId = isEditing ? editingRole.id : roleData.id;
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(currentRoleCategory)
            .doc(docId)
            .set(roleData);
        
        console.log('Role saved successfully:', roleData);
        showToast(`${roleData.nameEN} role ${isEditing ? 'updated' : 'added'} successfully!`, 'success');
        
        // Close modal
        closeRoleModal();
        hideLoading();
        
        // Reload everything to show the new role
        await loadLevelConfigurations();
        
    } catch (error) {
        console.error('Error saving role:', error);
        showToast('Error saving role: ' + error.message, 'error');
        hideLoading();
    }
}
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

// Make functions globally available
window.openEventMeritModal = openEventMeritModal;
window.closeEventMeritModal = closeEventMeritModal;
window.closeCompetitionMeritModal = closeCompetitionMeritModal;
window.openLevelModal = openLevelModal;
window.openAddLevelModal = openAddLevelModal;
window.closeLevelModal = closeLevelModal;
window.openAddRoleModal = openAddRoleModal;
window.closeRoleModal = closeRoleModal;
window.editRoleInNewModal = editRoleInNewModal;
window.editLevel = editLevel;
window.showLevelSelectionModal = showLevelSelectionModal;
window.closeEditLevelModal = closeEditLevelModal;
window.updateLevel = updateLevel;
window.deleteLevel = deleteLevel;
window.duplicateCurrentLevel = duplicateCurrentLevel;
window.editRole = editRole;
window.closeEditRoleModal = closeEditRoleModal;
window.updateRole = updateRole;
window.deleteRole = deleteRole;
window.confirmDeleteRole = confirmDeleteRole;
window.duplicateRole = duplicateRole;
window.duplicateCurrentRole = duplicateCurrentRole;
window.editEventMeritRole = editEventMeritRole;
window.editCompetitionMeritRole = editCompetitionMeritRole;
window.deleteEventMeritRole = deleteEventMeritRole;
window.deleteCompetitionMeritRole = deleteCompetitionMeritRole;
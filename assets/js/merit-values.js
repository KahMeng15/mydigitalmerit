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
        
        return maxSortOrder + 1;
    } catch (error) {
        console.error('Error getting next sort order:', error);
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
            // Load from legacy levelConfigurations collection
            await loadLevelConfigurationsLegacy();
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
        currentLevelConfigs.eventLevels.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
        
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
        currentLevelConfigs.competitionLevels.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
        
        console.log('Loaded hierarchical level configurations');
        
    } catch (error) {
        console.error('Error loading hierarchical level configurations:', error);
        throw error;
    }
}

async function loadLevelConfigurationsLegacy() {
    try {
        const firestore = window.firestore;
        
        // Initialize if not exists
        if (!currentLevelConfigs) {
            currentLevelConfigs = { eventLevels: [], competitionLevels: [] };
        }
        
        const snapshot = await firestore.collection('levelConfigurations').get();
        
        if (snapshot.empty) {
            // Create default configurations if none exist
            await createDefaultLevelConfigurations();
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            if (doc.id === 'eventLevels') {
                currentLevelConfigs.eventLevels = data.levels || [];
                // Sort by sortOrder to maintain proper display order
                currentLevelConfigs.eventLevels.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            } else if (doc.id === 'competitionLevels') {
                currentLevelConfigs.competitionLevels = data.levels || [];
                // Sort by sortOrder to maintain proper display order
                currentLevelConfigs.competitionLevels.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            }
        });

        console.log('Loaded legacy level configurations');
        
    } catch (error) {
        console.error('Error loading legacy level configurations:', error);
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
    safeAddEventListener('addCompetitionBtn', 'click', () => openCompetitionMeritModal());
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
        // Check if we need to migrate from old structure
        return await loadLegacyMeritValues();
    }
}

async function loadLegacyMeritValues() {
    try {
        const firestore = window.firestore;
        const result = {
            committee: {},
            nonCommittee: {},
            competitions: {}
        };

        // Try to load from legacy eventMeritValues collection
        const eventSnapshot = await firestore.collection('eventMeritValues').get();
        
        eventSnapshot.forEach(doc => {
            const data = doc.data();
            if (doc.id === 'committee') {
                result.committee = data || {};
            } else if (doc.id === 'nonCommittee') {
                result.nonCommittee = data || {};
            }
        });

        // Try to load from legacy competitionMeritValues collection
        const competitionSnapshot = await firestore.collection('competitionMeritValues').get();
        
        competitionSnapshot.forEach(doc => {
            result.competitions[doc.id] = doc.data();
        });

        console.log('Loaded legacy merit data:', result);
        
        // If we found legacy data, offer to migrate
        const hasLegacyData = Object.keys(result.committee).length > 0 || 
                             Object.keys(result.nonCommittee).length > 0 || 
                             Object.keys(result.competitions).length > 0;
        
        // Legacy data still exists but hierarchical system is now default

        return result;

    } catch (error) {
        console.error('Error loading legacy merit values:', error);
        throw error;
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
            console.log('Level configurations not loaded, loading them first...');
            await loadLevelConfigurationsLegacy();
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

// Helper function to get merit value for a level (supports both legacy and hierarchical formats)
function getMeritValueForLevel(roleData, level) {
    // New hierarchical format: levelValues[levelId]
    if (roleData.levelValues && roleData.levelValues[level.id] !== undefined) {
        return roleData.levelValues[level.id];
    }
    
    // Legacy format: direct level key
    if (roleData[level.key] !== undefined) {
        return roleData[level.key];
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
        
        nonCommitteeHeader.innerHTML = headerHtml;
    }
    
    // Add drag and drop listeners to level headers
    addLevelHeaderDragListeners();
}

// Helper function to save merit data in the appropriate format (hierarchical or legacy)
async function saveMeritData(data, type, category = null) {
    try {
        const firestore = window.firestore;
        
        // Check if hierarchical structure exists
        const roleMetadataDoc = await firestore.collection('meritValues').doc('roleMetadata').get();
        
        if (roleMetadataDoc.exists) {
            // Save to hierarchical structure
            await saveToHierarchicalStructure(data, type, category);
        } else {
            // Save to legacy structure
            await saveToLegacyStructure(data, type, category);
        }
        
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

async function saveToLegacyStructure(data, type, category) {
    const firestore = window.firestore;
    
    if (type === 'event') {
        const collectionPath = category === 'committee' ? 'committee' : 'nonCommittee';
        await firestore.collection('eventMeritValues').doc(collectionPath).set({
            [data.id]: data
        }, { merge: true });
    } else if (type === 'competition') {
        await firestore.collection('competitionMeritValues').doc(data.id).set(data);
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
    
    // Check if hierarchical structure should be used
    const useHierarchical = document.querySelector('#useHierarchicalStructure')?.checked;
    
    if (useHierarchical) {
        // New hierarchical format: levelValues object with levelId keys
        data.levelValues = {};
        const levelConfigs = type === 'competition' ? currentLevelConfigs.competitionLevels : currentLevelConfigs.eventLevels;
        
        levelConfigs.forEach(level => {
            const value = formData.levelValues && formData.levelValues[level.id] !== undefined 
                ? formData.levelValues[level.id] 
                : (formData[level.key] || 0);
            data.levelValues[level.id] = parseInt(value) || 0;
        });
    } else {
        // Legacy format: direct level key properties
        const levelConfigs = type === 'competition' ? currentLevelConfigs.competitionLevels : currentLevelConfigs.eventLevels;
        
        levelConfigs.forEach(level => {
            data[level.key] = formData[level.key] !== undefined ? parseInt(formData[level.key]) || 0 : 0;
        });
    }
    
    return data;
}

function updateCompetitionTableHeaders() {
    const competitionTable = document.querySelector('#competition-meritsTab .table thead tr');
    if (competitionTable) {
        let headerHtml = `
            <th>Achievement (BM)</th>
            <th>Achievement (EN)</th>
        `;
        
        // Add level headers dynamically
        if (currentLevelConfigs && currentLevelConfigs.competitionLevels) {
            currentLevelConfigs.competitionLevels.forEach(level => {
                headerHtml += `
                    <th>
                        <a href="#" onclick="editLevel('${level.id}', 'competition'); return false;" 
                           class="level-header-link" 
                           title="Click to edit ${level.nameEN} level">
                            ${level.nameEN}
                        </a>
                    </th>`;
            });
        }
        
        headerHtml += `<th>Actions</th>`;
        
        competitionTable.innerHTML = headerHtml;
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
            const aOrder = a.sortOrder !== undefined ? a.sortOrder : 999;
            const bOrder = b.sortOrder !== undefined ? b.sortOrder : 999;
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
            const aOrder = a.sortOrder !== undefined ? a.sortOrder : 999;
            const bOrder = b.sortOrder !== undefined ? b.sortOrder : 999;
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

    const totalColumns = 4 + currentLevelConfigs.competitionLevels.length; // Name columns + level columns + actions + manage levels
    if (Object.keys(currentCompetitionMeritValues).length === 0) {
        html = `<tr><td colspan="${totalColumns}" class="text-center text-secondary">No competition achievements defined</td></tr>`;
    } else {
        // Sort achievements by sortOrder field
        const sortedAchievements = Object.entries(currentCompetitionMeritValues).sort(([, a], [, b]) => {
            const aOrder = a.sortOrder !== undefined ? a.sortOrder : 999;
            const bOrder = b.sortOrder !== undefined ? b.sortOrder : 999;
            return aOrder - bOrder;
        });

        sortedAchievements.forEach(([achievementId, achievementData]) => {
            html += `
                <tr data-achievement="${achievementId}" draggable="true" class="draggable-row">
                    <td class="font-medium drag-handle">${achievementData.nameBM || 'Unknown'}</td>
                    <td class="text-secondary">${achievementData.nameEN || 'Unknown'}</td>
            `;
            
            // Add dynamic level columns for competition levels
            if (currentLevelConfigs && currentLevelConfigs.competitionLevels) {
                currentLevelConfigs.competitionLevels.forEach(level => {
                    const value = getMeritValueForLevel(achievementData, level);
                    html += `<td class="text-center">${value}</td>`;
                });
            }
            
            html += `
                    <td>
                        <div class="flex gap-2">
                            <button onclick="editCompetitionMeritRole('${achievementId}')" 
                                    class="btn btn-outline btn-sm" style="cursor: pointer" title="Edit">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="deleteCompetitionMeritRole('${achievementId}')" 
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
        const aOrder = a.sortOrder !== undefined ? a.sortOrder : 999;
        const bOrder = b.sortOrder !== undefined ? b.sortOrder : 999;
        return aOrder - bOrder;
    });
    
    // Find positions
    const draggedIndex = sortedRoles.findIndex(([id]) => id === draggedId);
    const targetIndex = sortedRoles.findIndex(([id]) => id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder array
    const [draggedItem] = sortedRoles.splice(draggedIndex, 1);
    sortedRoles.splice(targetIndex, 0, draggedItem);
    
    // Update sort orders
    const batch = [];
    sortedRoles.forEach(([roleId, roleData], index) => {
        roles[roleId].sortOrder = index;
        batch.push({
            path: `eventMeritValues/${collection}`,
            data: { [roleId]: { ...roleData, sortOrder: index } }
        });
    });
    
    // Save to Firestore
    await firestore.collection('eventMeritValues').doc(collection).set(
        Object.fromEntries(sortedRoles.map(([roleId, roleData], index) => [
            roleId, { ...roleData, sortOrder: index }
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
        const aOrder = a.sortOrder !== undefined ? a.sortOrder : 999;
        const bOrder = b.sortOrder !== undefined ? b.sortOrder : 999;
        return aOrder - bOrder;
    });
    
    // Find positions
    const draggedIndex = sortedAchievements.findIndex(([id]) => id === draggedId);
    const targetIndex = sortedAchievements.findIndex(([id]) => id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder array
    const [draggedItem] = sortedAchievements.splice(draggedIndex, 1);
    sortedAchievements.splice(targetIndex, 0, draggedItem);
    
    // Update sort orders and save to Firestore
    const batch = firestore.batch();
    sortedAchievements.forEach(([achievementId, achievementData], index) => {
        currentCompetitionMeritValues[achievementId].sortOrder = index;
        const docRef = firestore.collection('competitionMeritValues').doc(achievementId);
        batch.set(docRef, { ...achievementData, sortOrder: index });
    });
    
    await batch.commit();
    
    // Refresh display
    displayCompetitionMeritRoles();
}

// ============================================================================
// LEVEL HEADER DRAG AND DROP
// ============================================================================
let draggedLevelElement = null;

function addLevelHeaderDragListeners() {
    const levelHeaders = document.querySelectorAll('.draggable-level-header');
    
    levelHeaders.forEach(header => {
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
        reorderLevels(draggedLevelElement, targetHeader);
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
            level.sortOrder = index;
            const levelRef = firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('event')
                .doc(level.id);
            batch.update(levelRef, { sortOrder: index });
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
    
    document.getElementById('addLevelModal').classList.remove('d-none');
}

function closeLevelModal() {
    document.getElementById('addLevelModal').classList.add('d-none');
    currentLevelType = null;
}

// Variables for editing levels
let currentEditingLevelId = null;
let currentEditingLevelType = null;

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
    if (type === 'event') {
        populateRoleMeritValuesForLevel(levelId);
    }
    
    // Show modal
    document.getElementById('editLevelModal').classList.remove('d-none');
}

function populateRoleMeritValuesForLevel(levelId) {
    const committeeContainer = document.getElementById('editLevelCommitteeRoles');
    const nonCommitteeContainer = document.getElementById('editLevelNonCommitteeRoles');
    
    // Clear containers
    committeeContainer.innerHTML = '';
    nonCommitteeContainer.innerHTML = '';
    
    // Generate committee role inputs
    if (currentEventMeritValues.committee) {
        Object.entries(currentEventMeritValues.committee).forEach(([roleId, roleData]) => {
            const currentValue = (roleData.levelValues && roleData.levelValues[levelId]) || 0;
            const roleInput = createRoleMeritInput(roleId, roleData, levelId, currentValue, 'committee');
            committeeContainer.appendChild(roleInput);
        });
    }
    
    // Generate non-committee role inputs
    if (currentEventMeritValues.nonCommittee) {
        Object.entries(currentEventMeritValues.nonCommittee).forEach(([roleId, roleData]) => {
            const currentValue = (roleData.levelValues && roleData.levelValues[levelId]) || 0;
            const roleInput = createRoleMeritInput(roleId, roleData, levelId, currentValue, 'nonCommittee');
            nonCommitteeContainer.appendChild(roleInput);
        });
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
    document.getElementById('editLevelModal').classList.add('d-none');
    currentEditingLevelId = null;
    currentEditingLevelType = null;
}

async function updateLevel() {
    try {
        const nameEN = document.getElementById('editLevelNameEN').value.trim();
        const nameBM = document.getElementById('editLevelNameBM').value.trim();
        const sortOrder = parseInt(document.getElementById('editLevelSortOrder').value) || 999;
        
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
        
        // Update merit values for all roles at this level (for event levels only)
        if (currentEditingLevelType === 'event') {
            await updateRoleMeritValuesForLevel();
        }
        
        console.log('Level updated successfully:', levelData);
        showToast(`${levelData.nameEN} level updated successfully!`, 'success');
        
        // Close modal
        closeEditLevelModal();
        hideLoading();
        
        // Reload level configurations and merit values
        await loadLevelConfigurations();
        await loadEventMeritValues();
        
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
        
        // Update the local data structure
        if (currentEventMeritValues[category] && currentEventMeritValues[category][roleId]) {
            if (!currentEventMeritValues[category][roleId].levelValues) {
                currentEventMeritValues[category][roleId].levelValues = {};
            }
            currentEventMeritValues[category][roleId].levelValues[levelId] = newValue;
            
            // Add to batch update
            const roleRef = firestore.collection('meritValues')
                .doc('roleMetadata')
                .collection(category)
                .doc(roleId);
            
            batch.update(roleRef, {
                [`levelValues.${levelId}`]: newValue,
                updated: new Date()
            });
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
}

function closeRoleModal() {
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
            
            // Try to get value from hierarchical format first
            if (roleData.levelValues && roleData.levelValues[levelId] !== undefined) {
                value = roleData.levelValues[levelId];
            } else {
                // Fallback to legacy format - check if levelId matches any level property
                const levels = currentLevelConfigs && currentLevelConfigs.eventLevels 
                    ? currentLevelConfigs.eventLevels 
                    : [];
                
                const matchingLevel = levels.find(level => 
                    level.id === levelId || 
                    level.key === levelId ||
                    level.nameEN?.toLowerCase() === levelId.toLowerCase()
                );
                
                if (matchingLevel && roleData[matchingLevel.key]) {
                    value = roleData[matchingLevel.key];
                }
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
    
    // Get role data
    const roleData = currentEventMeritValues[category === 'committee' ? 'committee' : 'nonCommittee'][roleId];
    
    if (!roleData) {
        showToast('Role not found', 'error');
        return;
    }
    
    // Update modal title
    const titles = {
        committee: 'Committee Member Role',
        nonCommittee: 'Non Committee Role'
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
}

function populateRoleMeritValuesForRole(roleId, roleData, category) {
    const levelsContainer = document.getElementById('editRoleLevels');
    
    // Clear container
    levelsContainer.innerHTML = '';
    
    // Generate level inputs
    if (currentLevelConfigs && currentLevelConfigs.eventLevels) {
        currentLevelConfigs.eventLevels.forEach(level => {
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
    document.getElementById('editRoleModal').classList.add('d-none');
    currentEditingRoleId = null;
    currentEditingRoleCategory = null;
}

async function updateRole() {
    try {
        const nameEN = document.getElementById('editRoleNameEN').value.trim();
        const nameBM = document.getElementById('editRoleNameBM').value.trim();
        const sortOrder = parseInt(document.getElementById('editRoleSortOrder').value) || 999;
        
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
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee')
            .doc(currentEditingRoleId)
            .update(roleData);
        
        console.log('Role updated successfully:', roleData);
        showToast(`${roleData.nameBM} role updated successfully!`, 'success');
        
        // Close modal
        closeEditRoleModal();
        
        // Reload merit values
        await loadEventMeritValues();
        
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
    const roleData = currentEventMeritValues[currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee'][currentEditingRoleId];
    
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
        await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection(currentEditingRoleCategory === 'committee' ? 'committee' : 'nonCommittee')
            .doc(currentEditingRoleId)
            .delete();
        
        console.log('Role deleted successfully:', roleData);
        showToast(`${roleData.nameBM} role deleted successfully!`, 'success');
        
        // Close modal
        closeEditRoleModal();
        
        // Reload merit values
        await loadEventMeritValues();
        
    } catch (error) {
        console.error('Error deleting role:', error);
        showToast('Error deleting role: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
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
            <div class="col-span-2 text-center text-secondary py-4">
                <p>No levels configured yet.</p>
                <p>Use "Add Level" to create level configurations first.</p>
            </div>
        `;
    } else {
        levels.forEach(level => {
            const levelName = level.nameEN || level.name || level.key || 'Unknown';
            const levelId = level.id || level.key || levelName.toLowerCase();
            const fieldId = `roleLevel_${levelId}`;
            
            html += `
                <div class="form-group">
                    <label for="${fieldId}" class="form-label">${levelName}</label>
                    <input type="number" 
                           id="${fieldId}" 
                           class="form-control level-input" 
                           min="0" 
                           placeholder="0" 
                           value="0"
                           data-level-id="${levelId}"
                           data-level-name="${levelName}">
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
            // Use user-provided sort order
            roleData.sortOrder = parseInt(sortOrderInput);
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
            // Use user-provided sort order
            achievementData.sortOrder = parseInt(sortOrderInput);
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

        // Remove from Firestore
        await firestore.collection('eventMeritValues').doc(collectionPath).update({
            [roleId]: firebase.firestore.FieldValue.delete()
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

async function deleteCompetitionMeritRole(achievementId) {
    if (!confirm('Are you sure you want to delete this achievement?')) {
        return;
    }

    try {
        showLoading();

        // Remove from local data
        delete currentCompetitionMeritValues[achievementId];

        // Remove from Firestore
        await firestore.collection('competitionMeritValues').doc(achievementId).delete();

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

// Create competition merit values from the provided table
async function createCompetitionMeritValues() {
    try {
        showLoading();
        
        const firestore = window.firestore;
        if (!firestore) {
            throw new Error('Firestore not available');
        }

        // First ensure we have the competition levels configured
        const competitionLevels = [
            { id: generateUniqueId(), key: 'blok', nameBM: 'Blok', nameEN: 'Block', sortOrder: 0 },
            { id: generateUniqueId(), key: 'fakulti', nameBM: 'Fakulti/Kelab', nameEN: 'Faculty/Club', sortOrder: 1 },
            { id: generateUniqueId(), key: 'persatuan', nameBM: 'Persatuan Kelab', nameEN: 'Club Association', sortOrder: 2 },
            { id: generateUniqueId(), key: 'university', nameBM: 'Universiti', nameEN: 'University', sortOrder: 3 },
            { id: generateUniqueId(), key: 'interuniversity', nameBM: 'Intervarsiti', nameEN: 'Inter-University', sortOrder: 4 },
            { id: generateUniqueId(), key: 'state', nameBM: 'Negeri', nameEN: 'State', sortOrder: 5 },
            { id: generateUniqueId(), key: 'national', nameBM: 'Kebangsaan', nameEN: 'National', sortOrder: 6 },
            { id: generateUniqueId(), key: 'international', nameBM: 'Antarabangsa', nameEN: 'International', sortOrder: 7 }
        ];

        // Save levels to hierarchical structure
        const batch = firestore.batch();

        // Save competition levels
        competitionLevels.forEach(level => {
            const levelRef = firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('competition')
                .doc(level.id);
            batch.set(levelRef, level);
        });

        // Create level ID mappings for merit values
        const levelMappings = {};
        competitionLevels.forEach(level => {
            levelMappings[level.key] = level.id;
        });

        // Competition merit data from the table
        const competitionMerits = [
            {
                id: generateUniqueId(),
                nameBM: 'Johan',
                nameEN: 'Champion', 
                sortOrder: 0,
                category: 'competition',
                levelValues: {
                    [levelMappings.blok]: 5,
                    [levelMappings.fakulti]: 10,
                    [levelMappings.persatuan]: 10,
                    [levelMappings.university]: 12,
                    [levelMappings.interuniversity]: 14,
                    [levelMappings.state]: 16,
                    [levelMappings.national]: 18,
                    [levelMappings.international]: 20
                }
            },
            {
                id: generateUniqueId(),
                nameBM: 'Naib Johan',
                nameEN: 'Runner-up',
                sortOrder: 1,
                category: 'competition',
                levelValues: {
                    [levelMappings.blok]: 4,
                    [levelMappings.fakulti]: 8,
                    [levelMappings.persatuan]: 8,
                    [levelMappings.university]: 10,
                    [levelMappings.interuniversity]: 12,
                    [levelMappings.state]: 14,
                    [levelMappings.national]: 16,
                    [levelMappings.international]: 19
                }
            },
            {
                id: generateUniqueId(),
                nameBM: 'Ketiga',
                nameEN: 'Third Place',
                sortOrder: 2,
                category: 'competition',
                levelValues: {
                    [levelMappings.blok]: 3,
                    [levelMappings.fakulti]: 6,
                    [levelMappings.persatuan]: 6,
                    [levelMappings.university]: 8,
                    [levelMappings.interuniversity]: 10,
                    [levelMappings.state]: 12,
                    [levelMappings.national]: 14,
                    [levelMappings.international]: 18
                }
            },
            {
                id: generateUniqueId(),
                nameBM: 'Penyertaan',
                nameEN: 'Participation',
                sortOrder: 3,
                category: 'competition',
                levelValues: {
                    [levelMappings.blok]: 2,
                    [levelMappings.fakulti]: 2,
                    [levelMappings.persatuan]: 2,
                    [levelMappings.university]: 4,
                    [levelMappings.interuniversity]: 5,
                    [levelMappings.state]: 6,
                    [levelMappings.national]: 7,
                    [levelMappings.international]: 17
                }
            },
            {
                id: generateUniqueId(),
                nameBM: 'Penyokong',
                nameEN: 'Supporter',
                sortOrder: 4,
                category: 'competition',
                levelValues: {
                    [levelMappings.blok]: 1,
                    [levelMappings.fakulti]: 1,
                    [levelMappings.persatuan]: 1,
                    [levelMappings.university]: 1,
                    [levelMappings.interuniversity]: 1,
                    [levelMappings.state]: 1,
                    [levelMappings.national]: 1,
                    [levelMappings.international]: 1
                }
            }
        ];

        // Save competition merits to hierarchical structure
        competitionMerits.forEach(merit => {
            const meritRef = firestore.collection('meritValues')
                .doc('roleMetadata')
                .collection('competition')
                .doc(merit.id);
            batch.set(meritRef, merit);
        });

        await batch.commit();

        // Update local level configs
        currentLevelConfigs.competitionLevels = competitionLevels;

        // Update local competition merit values
        const competitionMap = {};
        competitionMerits.forEach(merit => {
            competitionMap[merit.id] = merit;
        });
        currentCompetitionMeritValues = competitionMap;

        console.log('Competition merit values created successfully');
        showToast('Competition merit values added successfully!', 'success');
        
        // Refresh the display
        displayCompetitionMeritRoles();

    } catch (error) {
        console.error('Error creating competition merit values:', error);
        showToast('Error creating competition merit values: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
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
        
        // Create level data
        const levelData = {
            id: generateUniqueId(),
            nameEN: nameEN,
            nameBM: nameBM,
            type: currentLevelType,
            sortOrder: 999, // Default to end
            created: new Date()
        };
        
        // Save to hierarchical structure
        const firestore = window.firestore;
        await firestore.collection('meritValues')
            .doc('levelMetadata')
            .collection(currentLevelType)
            .doc(levelData.id)
            .set(levelData);
        
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
            roleData = {
                id: generateUniqueId(),
                nameEN: nameEN,
                nameBM: nameBM,
                category: currentRoleCategory,
                levelValues: levelValues,
                sortOrder: 999, // Add to end by default
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

// Function to create activity participation levels from the document
async function createActivityLevels() {
    try {
        showLoading();
        console.log('Creating activity participation levels...');
        
        const firestore = window.firestore;
        
        // Define the activity participation levels from the document
        const activityLevels = [
            { 
                id: generateUniqueId(), 
                key: 'persatuanKelab', 
                nameBM: 'Persatuan/Kelab', 
                nameEN: 'Club/Association', 
                sortOrder: 0,
                type: 'event',
                description: 'Club or Association level activities'
            },
            { 
                id: generateUniqueId(), 
                key: 'fakulti', 
                nameBM: 'Fakulti', 
                nameEN: 'Faculty', 
                sortOrder: 1,
                type: 'event',
                description: 'Faculty level activities'
            },
            { 
                id: generateUniqueId(), 
                key: 'kolej', 
                nameBM: 'Kolej', 
                nameEN: 'College', 
                sortOrder: 2,
                type: 'event',
                description: 'College level activities'
            },
            { 
                id: generateUniqueId(), 
                key: 'blok', 
                nameBM: 'Blok', 
                nameEN: 'Block', 
                sortOrder: 3,
                type: 'event',
                description: 'Block level activities'
            },
            { 
                id: generateUniqueId(), 
                key: 'universiti', 
                nameBM: 'Universiti', 
                nameEN: 'University', 
                sortOrder: 4,
                type: 'event',
                description: 'University level activities'
            },
            { 
                id: generateUniqueId(), 
                key: 'kebangsaan', 
                nameBM: 'Kebangsaan', 
                nameEN: 'National', 
                sortOrder: 5,
                type: 'event',
                description: 'National level activities'
            },
            { 
                id: generateUniqueId(), 
                key: 'antarabangsa', 
                nameBM: 'Antarabangsa', 
                nameEN: 'International', 
                sortOrder: 6,
                type: 'event',
                description: 'International level activities'
            }
        ];

        // Create batch operation
        const batch = firestore.batch();

        // Add each level to the event levels collection
        activityLevels.forEach(level => {
            const levelRef = firestore.collection('meritValues')
                .doc('levelMetadata')
                .collection('event')
                .doc(level.id);
            batch.set(levelRef, {
                ...level,
                created: new Date()
            });
        });

        // Execute batch
        await batch.commit();

        console.log('Activity levels created successfully:', activityLevels);
        showToast('Activity participation levels added successfully!', 'success');

        // Reload configurations to show new levels
        await loadLevelConfigurations();

    } catch (error) {
        console.error('Error creating activity levels:', error);
        showToast('Error creating activity levels: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Function to create standard merit roles with values from the document
async function createStandardMeritRoles() {
    try {
        showLoading();
        console.log('Creating standard merit roles with proper values...');
        
        const firestore = window.firestore;
        
        // Wait for levels to be loaded
        await loadLevelConfigurations();
        
        if (!currentLevelConfigs.eventLevels || currentLevelConfigs.eventLevels.length === 0) {
            throw new Error('No event levels found. Please create activity levels first.');
        }

        // Create level ID mapping for easier reference
        const levelMap = {};
        currentLevelConfigs.eventLevels.forEach(level => {
            levelMap[level.key] = level.id;
        });

        // Define standard committee roles with their merit values
        const committeeRoles = [
            {
                id: generateUniqueId(),
                key: 'pengarah',
                nameBM: 'Pengarah',
                nameEN: 'Director',
                sortOrder: 0,
                category: 'committee',
                levelValues: {
                    [levelMap.persatuanKelab]: 10,
                    [levelMap.fakulti]: 15,
                    [levelMap.kolej]: 20,
                    [levelMap.blok]: 25,
                    [levelMap.universiti]: 30,
                    [levelMap.kebangsaan]: 35,
                    [levelMap.antarabangsa]: 40
                }
            },
            {
                id: generateUniqueId(),
                key: 'naibPengarah',
                nameBM: 'Naib Pengarah',
                nameEN: 'Deputy Director',
                sortOrder: 1,
                category: 'committee',
                levelValues: {
                    [levelMap.persatuanKelab]: 8,
                    [levelMap.fakulti]: 12,
                    [levelMap.kolej]: 16,
                    [levelMap.blok]: 20,
                    [levelMap.universiti]: 24,
                    [levelMap.kebangsaan]: 28,
                    [levelMap.antarabangsa]: 32
                }
            },
            {
                id: generateUniqueId(),
                key: 'setiausaha',
                nameBM: 'Setiausaha',
                nameEN: 'Secretary',
                sortOrder: 2,
                category: 'committee',
                levelValues: {
                    [levelMap.persatuanKelab]: 6,
                    [levelMap.fakulti]: 9,
                    [levelMap.kolej]: 12,
                    [levelMap.blok]: 15,
                    [levelMap.universiti]: 18,
                    [levelMap.kebangsaan]: 21,
                    [levelMap.antarabangsa]: 24
                }
            },
            {
                id: generateUniqueId(),
                key: 'bendahari',
                nameBM: 'Bendahari',
                nameEN: 'Treasurer',
                sortOrder: 3,
                category: 'committee',
                levelValues: {
                    [levelMap.persatuanKelab]: 6,
                    [levelMap.fakulti]: 9,
                    [levelMap.kolej]: 12,
                    [levelMap.blok]: 15,
                    [levelMap.universiti]: 18,
                    [levelMap.kebangsaan]: 21,
                    [levelMap.antarabangsa]: 24
                }
            },
            {
                id: generateUniqueId(),
                key: 'ahliJawatankuasa',
                nameBM: 'Ahli Jawatankuasa',
                nameEN: 'Committee Member',
                sortOrder: 4,
                category: 'committee',
                levelValues: {
                    [levelMap.persatuanKelab]: 4,
                    [levelMap.fakulti]: 6,
                    [levelMap.kolej]: 8,
                    [levelMap.blok]: 10,
                    [levelMap.universiti]: 12,
                    [levelMap.kebangsaan]: 14,
                    [levelMap.antarabangsa]: 16
                }
            }
        ];

        // Define standard non-committee roles
        const nonCommitteeRoles = [
            {
                id: generateUniqueId(),
                key: 'peserta',
                nameBM: 'Peserta',
                nameEN: 'Participant',
                sortOrder: 0,
                category: 'nonCommittee',
                levelValues: {
                    [levelMap.persatuanKelab]: 2,
                    [levelMap.fakulti]: 3,
                    [levelMap.kolej]: 4,
                    [levelMap.blok]: 5,
                    [levelMap.universiti]: 6,
                    [levelMap.kebangsaan]: 7,
                    [levelMap.antarabangsa]: 8
                }
            },
            {
                id: generateUniqueId(),
                key: 'sukarelawan',
                nameBM: 'Sukarelawan',
                nameEN: 'Volunteer',
                sortOrder: 1,
                category: 'nonCommittee',
                levelValues: {
                    [levelMap.persatuanKelab]: 3,
                    [levelMap.fakulti]: 4,
                    [levelMap.kolej]: 5,
                    [levelMap.blok]: 6,
                    [levelMap.universiti]: 7,
                    [levelMap.kebangsaan]: 8,
                    [levelMap.antarabangsa]: 9
                }
            }
        ];

        // Create batch operation
        const batch = firestore.batch();

        // Add committee roles
        committeeRoles.forEach(role => {
            const roleRef = firestore.collection('meritValues')
                .doc('roleMetadata')
                .collection('committee')
                .doc(role.id);
            batch.set(roleRef, {
                ...role,
                created: new Date()
            });
        });

        // Add non-committee roles
        nonCommitteeRoles.forEach(role => {
            const roleRef = firestore.collection('meritValues')
                .doc('roleMetadata')
                .collection('nonCommittee')
                .doc(role.id);
            batch.set(roleRef, {
                ...role,
                created: new Date()
            });
        });

        // Execute batch
        await batch.commit();

        console.log('Standard merit roles created successfully');
        showToast('Standard merit roles with proper values added successfully!', 'success');

        // Reload configurations to show new roles
        await loadLevelConfigurations();
        await loadEventMeritValues();

    } catch (error) {
        console.error('Error creating standard merit roles:', error);
        showToast('Error creating merit roles: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Function to update existing roles with proper merit values
async function updateExistingRolesWithMeritValues() {
    try {
        showLoading();
        console.log('Updating existing roles with proper merit values...');
        
        const firestore = window.firestore;
        
        // Wait for levels to be loaded
        await loadLevelConfigurations();
        
        if (!currentLevelConfigs.eventLevels || currentLevelConfigs.eventLevels.length === 0) {
            throw new Error('No event levels found. Please create activity levels first.');
        }

        // Create level ID mapping for easier reference
        const levelMap = {};
        currentLevelConfigs.eventLevels.forEach(level => {
            levelMap[level.key] = level.id;
        });

        // Define merit values mapping based on role names
        const meritValuesMap = {
            // Committee roles - exact name matching (case insensitive)
            'pengarah': { // Director
                persatuanKelab: 10, fakulti: 15, kolej: 20, blok: 25, 
                universiti: 30, kebangsaan: 35, antarabangsa: 40
            },
            'timb. pengarah': { // Deputy Director  
                persatuanKelab: 8, fakulti: 12, kolej: 16, blok: 20,
                universiti: 24, kebangsaan: 28, antarabangsa: 32
            },
            'setiausaha': { // Secretary
                persatuanKelab: 6, fakulti: 9, kolej: 12, blok: 15,
                universiti: 18, kebangsaan: 21, antarabangsa: 24
            },
            'timb. setiausaha': { // Deputy Secretary
                persatuanKelab: 5, fakulti: 7, kolej: 10, blok: 12,
                universiti: 15, kebangsaan: 17, antarabangsa: 20
            },
            'bendahari': { // Treasurer
                persatuanKelab: 6, fakulti: 9, kolej: 12, blok: 15,
                universiti: 18, kebangsaan: 21, antarabangsa: 24
            },
            'timb. bendahari': { // Deputy Treasurer
                persatuanKelab: 5, fakulti: 7, kolej: 10, blok: 12,
                universiti: 15, kebangsaan: 17, antarabangsa: 20
            },
            'ajk tugas khas': { // Special Task Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk peralatan': { // Equipment Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk multimedia': { // Multimedia Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk kebersihan': { // Cleanliness Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk persembahan': { // Performance Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk pendaftaran': { // Registration Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk program': { // Programme Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk keselamatan': { // Security Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk protokol': { // Protocol Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk dekorasi': { // Decoration Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            'ajk makanan': { // Food Committee
                persatuanKelab: 4, fakulti: 6, kolej: 8, blok: 10,
                universiti: 12, kebangsaan: 14, antarabangsa: 16
            },
            // Non-committee roles
            'peserta': { // Participant
                persatuanKelab: 2, fakulti: 3, kolej: 4, blok: 5,
                universiti: 6, kebangsaan: 7, antarabangsa: 8
            },
            'sukarelawan': { // Volunteer
                persatuanKelab: 3, fakulti: 4, kolej: 5, blok: 6,
                universiti: 7, kebangsaan: 8, antarabangsa: 9
            }
        };

        // Get existing roles from both categories
        const committeeSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection('committee')
            .get();

        const nonCommitteeSnapshot = await firestore.collection('meritValues')
            .doc('roleMetadata')
            .collection('nonCommittee')
            .get();

        const batch = firestore.batch();
        let updatedCount = 0;

        // Update committee roles
        committeeSnapshot.forEach(doc => {
            const roleData = doc.data();
            const roleName = (roleData.nameBM || '').toLowerCase().trim();
            
            if (meritValuesMap[roleName]) {
                const meritValues = meritValuesMap[roleName];
                const levelValues = {};
                
                // Convert merit values to level ID format
                Object.keys(meritValues).forEach(levelKey => {
                    if (levelMap[levelKey]) {
                        levelValues[levelMap[levelKey]] = meritValues[levelKey];
                    }
                });

                // Update the role with new merit values
                batch.update(doc.ref, {
                    levelValues: levelValues,
                    updated: new Date()
                });
                
                updatedCount++;
                console.log(`Updating committee role: ${roleData.nameBM} (${roleData.nameEN})`);
            }
        });

        // Update non-committee roles
        nonCommitteeSnapshot.forEach(doc => {
            const roleData = doc.data();
            const roleName = (roleData.nameBM || '').toLowerCase().trim();
            
            if (meritValuesMap[roleName]) {
                const meritValues = meritValuesMap[roleName];
                const levelValues = {};
                
                // Convert merit values to level ID format
                Object.keys(meritValues).forEach(levelKey => {
                    if (levelMap[levelKey]) {
                        levelValues[levelMap[levelKey]] = meritValues[levelKey];
                    }
                });

                // Update the role with new merit values
                batch.update(doc.ref, {
                    levelValues: levelValues,
                    updated: new Date()
                });
                
                updatedCount++;
                console.log(`Updating non-committee role: ${roleData.nameBM} (${roleData.nameEN})`);
            }
        });

        if (updatedCount === 0) {
            showToast('No matching roles found to update. Please check role names.', 'warning');
            return;
        }

        // Execute batch update
        await batch.commit();

        console.log(`Successfully updated ${updatedCount} roles with merit values`);
        showToast(`Successfully updated ${updatedCount} roles with proper merit values!`, 'success');

        // Reload configurations to show updated values
        await loadLevelConfigurations();
        await loadEventMeritValues();

    } catch (error) {
        console.error('Error updating existing roles:', error);
        showToast('Error updating roles: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Make functions available in console
window.createActivityLevels = createActivityLevels;
window.createStandardMeritRoles = createStandardMeritRoles;
window.updateExistingRolesWithMeritValues = updateExistingRolesWithMeritValues;

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
window.openCompetitionMeritModal = openCompetitionMeritModal;
window.closeCompetitionMeritModal = closeCompetitionMeritModal;
window.openLevelModal = openLevelModal;
window.openAddLevelModal = openAddLevelModal;
window.closeLevelModal = closeLevelModal;
window.openAddRoleModal = openAddRoleModal;
window.closeRoleModal = closeRoleModal;
window.editRoleInNewModal = editRoleInNewModal;
window.editLevel = editLevel;
window.closeEditLevelModal = closeEditLevelModal;
window.updateLevel = updateLevel;
window.deleteLevel = deleteLevel;
window.editRole = editRole;
window.closeEditRoleModal = closeEditRoleModal;
window.updateRole = updateRole;
window.deleteRole = deleteRole;
window.editEventMeritRole = editEventMeritRole;
window.editCompetitionMeritRole = editCompetitionMeritRole;
window.deleteEventMeritRole = deleteEventMeritRole;
window.deleteCompetitionMeritRole = deleteCompetitionMeritRole;
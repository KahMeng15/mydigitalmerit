// Level Management System
// Handles level metadata, IDs, display names, and merit values in consolidated collection

let levelMetadata = new Map(); // Cache for level metadata
let levelCache = null; // Cache timestamp

// Generate random string ID for new levels
function generateLevelId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Load level metadata and merit values from consolidated database (with backward compatibility)
async function loadLevelMetadata() {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized');
        }
        
        let snapshot;
        let useOldStructure = false;
        
        try {
            // Try loading from new consolidated 'levels' collection first
            snapshot = await window.firestore.collection('levels').orderBy('order').get();
            if (snapshot.empty) {
                throw new Error('No levels found in new collection');
            }
        } catch (error) {
            console.warn('New levels collection not found, falling back to old structure');
            useOldStructure = true;
            
            // Fallback to old structure
            snapshot = await window.firestore.collection('levelMetadata').orderBy('order').get();
            
            if (snapshot.empty) {
                throw new Error('No level metadata found in old or new collections');
            }
        }
        
        levelMetadata.clear();
        
        if (useOldStructure) {
            // Old structure: load levelMetadata and merge with meritvalue
            console.log('Loading from old structure (levelMetadata + meritvalue)');
            
            // Load level metadata
            const metadataMap = new Map();
            snapshot.forEach(doc => {
                metadataMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
            
            // Load merit values
            const meritSnapshot = await window.firestore.collection('meritvalue').get();
            const meritMap = new Map();
            meritSnapshot.forEach(doc => {
                meritMap.set(doc.id, doc.data());
            });
            
            // Combine metadata and merit values
            metadataMap.forEach((metadata, levelId) => {
                const levelData = {
                    ...metadata,
                    meritValues: meritMap.get(levelId) || {}
                };
                levelMetadata.set(levelId, levelData);
            });
            
        } else {
            // New structure: levels collection contains everything
            console.log('Loading from new consolidated structure (levels)');
            snapshot.forEach(doc => {
                const levelData = { id: doc.id, ...doc.data() };
                levelMetadata.set(doc.id, levelData);
            });
        }
        
        levelCache = Date.now();
        console.log('Loaded level metadata:', Array.from(levelMetadata.values()));
        return levelMetadata;
        
    } catch (error) {
        console.error('Error loading level metadata:', error);
        throw error;
    }
}

// Get level display name by ID
function getLevelName(levelId) {
    if (!levelMetadata.has(levelId)) {
        console.warn(`Level ID not found: ${levelId}`);
        return levelId; // Fallback to ID if not found
    }
    return levelMetadata.get(levelId).name;
}

// Get level short name by ID
function getLevelShortName(levelId) {
    if (!levelMetadata.has(levelId)) {
        return levelId;
    }
    return levelMetadata.get(levelId).shortName || levelMetadata.get(levelId).name;
}

// Get all active levels
function getActiveLevels() {
    return Array.from(levelMetadata.values())
        .filter(level => level.isActive !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Get level ID by name (for migration purposes)
function getLevelIdByName(name) {
    for (const [id, level] of levelMetadata.entries()) {
        if (level.name === name || level.shortName === name) {
            return id;
        }
    }
    return null;
}

// Check if cache needs refresh (5 minutes)
function shouldRefreshCache() {
    return !levelCache || (Date.now() - levelCache > 300000);
}

// Ensure level metadata is loaded
async function ensureLevelMetadata() {
    if (levelMetadata.size === 0 || shouldRefreshCache()) {
        await loadLevelMetadata();
    }
}

// Populate level dropdown with display names but store IDs
function populateLevelDropdown(selectElement, selectedLevelId = '', includeEmpty = true) {
    if (!selectElement) return;
    
    const levels = getActiveLevels();
    let html = includeEmpty ? '<option value="">Select event level</option>' : '';
    
    levels.forEach(level => {
        const selected = level.id === selectedLevelId ? 'selected' : '';
        html += `<option value="${level.id}" ${selected}>${sanitizeHTML(level.name)}</option>`;
    });
    
    selectElement.innerHTML = html;
}

// Create new level with random ID and merit values
async function createLevel(levelData, meritValues = {}) {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized. Please ensure Firebase is properly loaded.');
        }
        
        const levelId = generateLevelId();
        const completeData = {
            ...levelData,
            id: levelId,
            meritValues: meritValues || {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await window.firestore.collection('levels').doc(levelId).set(completeData);
        
        // Update cache
        levelMetadata.set(levelId, completeData);
        
        return levelId;
    } catch (error) {
        console.error('Error creating level:', error);
        throw error;
    }
}

// Migration helper: Create default levels with consolidated structure
async function createDefaultLevels() {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized. Please ensure Firebase is properly loaded.');
        }
        
        const batch = window.firestore.batch();
        
        const defaultLevels = [
            {
                name: 'University Level',
                shortName: 'University',
                order: 1,
                description: 'University-wide events and activities',
                isActive: true,
                color: '#1f2937',
                meritValues: {
                    'Committee Member': 5,
                    'Program Director': 10,
                    'Deputy Program Director': 8,
                    'Secretary': 8,
                    'Deputy Secretary': 6,
                    'Treasurer': 8,
                    'Deputy Treasurer': 6,
                    'Participant': 3
                }
            },
            {
                name: 'National Level',
                shortName: 'National',
                order: 2,
                description: 'National level competitions and events',
                isActive: true,
                color: '#dc2626',
                meritValues: {
                    'Committee Member': 8,
                    'Program Director': 15,
                    'Deputy Program Director': 12,
                    'Secretary': 12,
                    'Deputy Secretary': 10,
                    'Treasurer': 12,
                    'Deputy Treasurer': 10,
                    'Participant': 5
                }
            },
            {
                name: 'College Level', 
                shortName: 'College',
                order: 3,
                description: 'College and faculty level activities',
                isActive: true,
                color: '#059669',
                meritValues: {
                    'Committee Member': 3,
                    'Program Director': 6,
                    'Deputy Program Director': 5,
                    'Secretary': 5,
                    'Deputy Secretary': 4,
                    'Treasurer': 5,
                    'Deputy Treasurer': 4,
                    'Participant': 2
                }
            },
            {
                name: 'Block Level',
                shortName: 'Block', 
                order: 4,
                description: 'Block and residential college activities',
                isActive: true,
                color: '#7c3aed',
                meritValues: {
                    'Committee Member': 2,
                    'Program Director': 4,
                    'Deputy Program Director': 3,
                    'Secretary': 3,
                    'Deputy Secretary': 2,
                    'Treasurer': 3,
                    'Deputy Treasurer': 2,
                    'Participant': 1
                }
            },
            {
                name: 'International Level',
                shortName: 'International',
                order: 5, 
                description: 'International competitions and events',
                isActive: true,
                color: '#ea580c',
                meritValues: {
                    'Committee Member': 12,
                    'Program Director': 20,
                    'Deputy Program Director': 18,
                    'Secretary': 18,
                    'Deputy Secretary': 15,
                    'Treasurer': 18,
                    'Deputy Treasurer': 15,
                    'Participant': 8
                }
            }
        ];
        
        defaultLevels.forEach(level => {
            const levelId = generateLevelId();
            const docRef = window.firestore.collection('levels').doc(levelId);
            batch.set(docRef, {
                ...level,
                id: levelId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();
        console.log('Default levels created successfully');
        
        // Reload metadata after creation
        await loadLevelMetadata();
        
    } catch (error) {
        console.error('Error creating default levels:', error);
        throw error;
    }
}

// Get merit values for a specific level and role
function getMeritValue(levelId, roleName) {
    if (!levelMetadata.has(levelId)) {
        console.warn(`Level ID not found: ${levelId}`);
        return 0;
    }
    
    const level = levelMetadata.get(levelId);
    if (!level.meritValues || !level.meritValues[roleName]) {
        console.warn(`Merit value not found for level ${levelId}, role ${roleName}`);
        return 0;
    }
    
    return level.meritValues[roleName];
}

// Get all roles for a specific level
function getLevelRoles(levelId) {
    if (!levelMetadata.has(levelId)) {
        console.warn(`Level ID not found: ${levelId}`);
        return {};
    }
    
    const level = levelMetadata.get(levelId);
    return level.meritValues || {};
}

// Get all merit values organized by role
function getAllMeritValuesByRole() {
    const roleData = {};
    
    levelMetadata.forEach((level, levelId) => {
        if (level.meritValues) {
            Object.entries(level.meritValues).forEach(([roleName, points]) => {
                if (!roleData[roleName]) {
                    roleData[roleName] = {};
                }
                roleData[roleName][levelId] = points;
            });
        }
    });
    
    return roleData;
}

// Update merit value for a specific level and role
async function updateMeritValue(levelId, roleName, points) {
    try {
        if (!levelMetadata.has(levelId)) {
            throw new Error(`Level ID not found: ${levelId}`);
        }
        
        const level = levelMetadata.get(levelId);
        const updatedMeritValues = { ...level.meritValues };
        updatedMeritValues[roleName] = points;
        
        await window.firestore.collection('levels').doc(levelId).update({
            meritValues: updatedMeritValues,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update cache
        level.meritValues = updatedMeritValues;
        levelMetadata.set(levelId, level);
        
        console.log(`Updated merit value: ${roleName} = ${points} for level ${levelId}`);
        
    } catch (error) {
        console.error('Error updating merit value:', error);
        throw error;
    }
}

// Migration helper: Migrate from old separated collections to new consolidated structure
async function migrateToConsolidatedStructure() {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized');
        }
        
        console.log('Starting migration to consolidated structure...');
        
        // Load old levelMetadata
        const levelMetadataSnapshot = await window.firestore.collection('levelMetadata').get();
        const oldMetadata = {};
        
        levelMetadataSnapshot.forEach(doc => {
            oldMetadata[doc.id] = { id: doc.id, ...doc.data() };
        });
        
        // Load old meritvalue
        const meritValueSnapshot = await window.firestore.collection('meritvalue').get();
        const oldMeritValues = {};
        
        meritValueSnapshot.forEach(doc => {
            oldMeritValues[doc.id] = doc.data();
        });
        
        // Create new consolidated documents
        const batch = window.firestore.batch();
        
        // For each old level metadata, create a new consolidated document
        Object.values(oldMetadata).forEach(levelMeta => {
            const newLevelId = generateLevelId();
            const meritValues = oldMeritValues[levelMeta.id] || {};
            
            const consolidatedData = {
                ...levelMeta,
                id: newLevelId,
                meritValues: meritValues,
                migratedFrom: levelMeta.id, // Track original ID
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const newDocRef = window.firestore.collection('levels').doc(newLevelId);
            batch.set(newDocRef, consolidatedData);
            
            console.log(`Migrating ${levelMeta.id} -> ${newLevelId}`);
        });
        
        await batch.commit();
        console.log('Migration to consolidated structure completed successfully');
        
        // Reload metadata after migration
        await loadLevelMetadata();
        
        return true;
        
    } catch (error) {
        console.error('Error migrating to consolidated structure:', error);
        throw error;
    }
}

// Export functions for use in other files
window.levelManager = {
    // Core functions
    loadLevelMetadata,
    getLevelName,
    getLevelShortName,
    getActiveLevels,
    getLevelIdByName,
    ensureLevelMetadata,
    populateLevelDropdown,
    
    // Merit value functions
    getMeritValue,
    getLevelRoles,
    getAllMeritValuesByRole,
    updateMeritValue,
    
    // Creation and migration
    createLevel,
    createDefaultLevels,
    migrateToConsolidatedStructure,
    generateLevelId
};
// Level Management System
// Handles level metadata, IDs, and display names

let levelMetadata = new Map(); // Cache for level metadata
let levelCache = null; // Cache timestamp

// Load level metadata from database
async function loadLevelMetadata() {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized');
        }
        
        const snapshot = await window.firestore.collection('levelMetadata').orderBy('order').get();
        levelMetadata.clear();
        
        snapshot.forEach(doc => {
            const levelData = { id: doc.id, ...doc.data() };
            levelMetadata.set(doc.id, levelData);
        });
        
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

// Migration helper: Create default level metadata
async function createDefaultLevelMetadata() {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized. Please ensure Firebase is properly loaded.');
        }
        
        const batch = window.firestore.batch();
        
        const defaultLevels = [
            {
                id: 'level_001',
                name: 'University Level',
                shortName: 'University',
                order: 1,
                description: 'University-wide events and activities',
                isActive: true,
                color: '#1f2937'
            },
            {
                id: 'level_002', 
                name: 'National Level',
                shortName: 'National',
                order: 2,
                description: 'National level competitions and events',
                isActive: true,
                color: '#dc2626'
            },
            {
                id: 'level_003',
                name: 'College Level', 
                shortName: 'College',
                order: 3,
                description: 'College and faculty level activities',
                isActive: true,
                color: '#059669'
            },
            {
                id: 'level_004',
                name: 'Block Level',
                shortName: 'Block', 
                order: 4,
                description: 'Block and residential college activities',
                isActive: true,
                color: '#7c3aed'
            },
            {
                id: 'level_005',
                name: 'International Level',
                shortName: 'International',
                order: 5, 
                description: 'International competitions and events',
                isActive: true,
                color: '#ea580c'
            }
        ];
        
        defaultLevels.forEach(level => {
            const docRef = window.firestore.collection('levelMetadata').doc(level.id);
            batch.set(docRef, {
                ...level,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();
        console.log('Default level metadata created successfully');
        
        // Reload metadata after creation
        await loadLevelMetadata();
        
    } catch (error) {
        console.error('Error creating default level metadata:', error);
        throw error;
    }
}

// Migration helper: Update merit values to use level IDs
async function migrateMeritValues() {
    try {
        // Ensure Firebase is initialized
        if (!window.firestore) {
            throw new Error('Firestore not initialized');
        }
        
        const snapshot = await window.firestore.collection('meritvalue').get();
        const batch = window.firestore.batch();
        
        // Mapping from old names to new level IDs
        const nameToIdMapping = {
            'University Level': 'level_001',
            'National Level': 'level_002', 
            'College Level': 'level_003',
            'Block Level': 'level_004',
            'International Level': 'level_005'
        };
        
        const newMeritData = {};
        
        // Collect all data from old structure
        snapshot.forEach(doc => {
            const oldLevelName = doc.id;
            const levelData = doc.data();
            const newLevelId = nameToIdMapping[oldLevelName];
            
            if (newLevelId) {
                newMeritData[newLevelId] = levelData;
            } else {
                console.warn(`No mapping found for level: ${oldLevelName}`);
            }
        });
        
        // Delete old documents and create new ones
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        Object.entries(newMeritData).forEach(([levelId, data]) => {
            const docRef = window.firestore.collection('meritvalue').doc(levelId);
            batch.set(docRef, data);
        });
        
        await batch.commit();
        console.log('Merit values migrated to use level IDs');
        
    } catch (error) {
        console.error('Error migrating merit values:', error);
        throw error;
    }
}

// Export functions for use in other files
window.levelManager = {
    loadLevelMetadata,
    getLevelName,
    getLevelShortName,
    getActiveLevels,
    getLevelIdByName,
    ensureLevelMetadata,
    populateLevelDropdown,
    createDefaultLevelMetadata,
    migrateMeritValues
};
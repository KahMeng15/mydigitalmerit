// Firebase Configuration
// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDd9r8u2fr9pboTbV2DGNbmhBj20Ma5zTI",
  authDomain: "mydigitalmerit.firebaseapp.com",
  databaseURL: "https://mydigitalmerit-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mydigitalmerit",
  storageBucket: "mydigitalmerit.firebasestorage.app",
  messagingSenderId: "69229862912",
  appId: "1:69229862912:web:aa0ef177a855ffad23f8e5",
  measurementId: "G-BM39BHXZ9D"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);


// Initialize Firebase services with error handling
try {
    window.auth = firebase.auth ? firebase.auth() : null;
} catch (error) {
    console.warn('Firebase Auth not available:', error);
    window.auth = null;
}

try {
    window.firestore = firebase.firestore();
} catch (error) {
    console.error('Firebase Firestore not available:', error);
    throw error; // Firestore is critical, so throw the error
}

try {
    window.database = firebase.database ? firebase.database() : null;
} catch (error) {
    console.warn('Firebase Database not available:', error);
    window.database = null;
}

// Also create const variables for backward compatibility
const auth = window.auth;
const firestore = window.firestore;
const database = window.database;


// Configure Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
// Force account selection every time
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Authentication state observer
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('User is signed in:', user.email);
        // Check user role and redirect accordingly
        checkUserRole(user);
    } else {
        console.log('User is signed out');
        // Redirect to login if not on login page
        // Allow pages to opt-out of auto-redirect by setting window.SKIP_AUTH_REDIRECT = true
        if (!window.SKIP_AUTH_REDIRECT) {
            if (!window.location.pathname.includes('index.html') && !window.location.pathname.endsWith('/')) {
                window.location.href = getBasePath() + 'index.html';
            }
        }
    }
});

// Check user role and redirect
async function checkUserRole(user) {
    try {
        // First check if admin
        if (typeof sanitizeEmailForKey === 'function') {
            const adminKey = sanitizeEmailForKey(user.email);
            const adminDoc = await firestore.collection('admins').doc(adminKey).get();
            if (adminDoc.exists && adminDoc.data().active === true) {
                // Store admin data in session
                sessionStorage.setItem('userData', JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    role: 'admin',
                    matricNumber: ''
                }));
                return;
            }
        }
        
        // Not admin, try to find student record by extracting matric from email
        let matric = '';
        if (user.email) {
            const local = user.email.split('@')[0] || '';
            matric = local.split('+')[0].split('.').join('').trim();
            if (typeof normalizeMatric === 'function') {
                matric = normalizeMatric(matric);
            }
        }
        
        if (matric) {
            const studentDoc = await firestore.collection('students').doc(matric).get();
            if (studentDoc.exists) {
                const studentData = studentDoc.data();
                // Store student data in session
                sessionStorage.setItem('userData', JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: studentData.displayName,
                    role: 'student',
                    matricNumber: matric
                }));
                return;
            }
        }
        
        // No valid record found - redirect to login
        window.location.href = getBasePath() + 'index.html';
        
    } catch (error) {
        console.error('Error checking user role:', error);
        // On error, redirect to login
        window.location.href = getBasePath() + 'index.html';
    }
}

// Legacy function - user creation now handled in login.js
// This function is kept for backward compatibility but should not be used
async function createUserProfile(user) {
    console.warn('createUserProfile called - user creation should happen in login.js');
    // Redirect to login for proper user creation flow
    window.location.href = getBasePath() + 'index.html';
}

// Get the base path for the application (handles subdirectory deployments)
function getBasePath() {
    const path = window.location.pathname;
    const pathParts = path.split('/').filter(part => part !== ''); // Remove empty parts
    
    // If we're in a subdirectory (admin, student, assets), go to root
    if (path.includes('/admin/') || path.includes('/student/') || path.includes('/assets/')) {
        // Find the position of these folders and get everything before them
        let rootPath = '/';
        
        const adminIndex = pathParts.indexOf('admin');
        const studentIndex = pathParts.indexOf('student');
        const assetsIndex = pathParts.indexOf('assets');
        
        // Find the earliest occurrence of these folders
        const folderIndex = Math.min(
            adminIndex >= 0 ? adminIndex : Infinity,
            studentIndex >= 0 ? studentIndex : Infinity,
            assetsIndex >= 0 ? assetsIndex : Infinity
        );
        
        if (folderIndex < Infinity && folderIndex > 0) {
            // If there are path parts before admin/student/assets, include them
            rootPath = '/' + pathParts.slice(0, folderIndex).join('/') + '/';
        }
        
        return rootPath;
    }
    
    // If we're at root level or in index.html
    if (path.includes('index.html') || pathParts.length <= 1) {
        return '/';
    }
    
    // Default fallback - go up one level from current page
    return '/' + pathParts.slice(0, -1).join('/') + '/';
}

// Debug function to test getBasePath (can be removed in production)
function debugBasePath() {
    console.log('Current path:', window.location.pathname);
    console.log('Base path:', getBasePath());
    console.log('Redirect would go to:', getBasePath() + 'index.html');
}

// Get current user data
function getCurrentUser() {
    const userData = sessionStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
}

// Check if user is admin
function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

// Sign out function
async function signOut() {
    try {
        await auth.signOut();
        sessionStorage.clear();
        window.location.href = getBasePath() + 'index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

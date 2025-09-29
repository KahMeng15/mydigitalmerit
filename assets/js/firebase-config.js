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


// Initialize Firebase services
window.auth = firebase.auth();
window.firestore = firebase.firestore();
window.database = firebase.database();

// Also create const variables for backward compatibility
const auth = window.auth;
const firestore = window.firestore;
const database = window.database;


// Configure Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

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
                window.location.href = '/index.html';
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
        window.location.href = '/index.html';
        
    } catch (error) {
        console.error('Error checking user role:', error);
        // On error, redirect to login
        window.location.href = '/index.html';
    }
}

// Legacy function - user creation now handled in login.js
// This function is kept for backward compatibility but should not be used
async function createUserProfile(user) {
    console.warn('createUserProfile called - user creation should happen in login.js');
    // Redirect to login for proper user creation flow
    window.location.href = '/index.html';
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
        window.location.href = '/index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

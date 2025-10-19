// Login page functionality
document.addEventListener('DOMContentLoaded', function() {
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const loginSection = document.getElementById('loginSection');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Use centralized public provider list from utils (fallback if not present)
    const publicProviders = (typeof PUBLIC_EMAIL_PROVIDERS !== 'undefined')
        ? PUBLIC_EMAIL_PROVIDERS
        : new Set(['gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com','icloud.com']);

    // Check if user is already logged in
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                // FIRST: Check if user is an admin (bypasses all other checks)
                const isAdminUser = await checkIfAdmin(user.email);
                if (isAdminUser) {
                    // Admin user - bypass all checks and redirect to admin dashboard
                    const displayName = user.displayName ? cleanDisplayName(user.displayName) : user.email.split('@')[0];
                    sessionStorage.setItem('userData', JSON.stringify({
                        uid: user.uid,
                        email: user.email,
                        displayName: displayName,
                        matricNumber: '',
                        role: 'admin'
                    }));
                    console.log('Admin user detected, redirecting to admin dashboard');
                    redirectUser('admin');
                    return;
                }

                // For non-admins, check if they have a student record (by extracting matric first)
                const email = (user.email || '').toLowerCase();
                const domain = email.split('@')[1] || '';
                const isPublic = publicProviders.has(domain);
                const looksInstitutional = /\.(edu|ac|edu\.|\.edu\.|student|uni|university|college)\b/.test(domain) || !isPublic;

                if (!looksInstitutional || isPublic) {
                    // Public email provider -> sign out
                    await auth.signOut();
                    showToast('Please sign in with your institutional Google account. Public providers are not allowed.', 'error');
                    showLoginSection();
                    return;
                }

                // Extract matric from institutional email
                let matric = extractMatricFromEmail(user.email);
                if (typeof normalizeMatric === 'function') {
                    matric = normalizeMatric(matric);
                }

                if (!matric) {
                    await auth.signOut();
                    showToast('Could not extract matric from your email. Please contact admin.', 'error');
                    showLoginSection();
                    return;
                }

                // Check if student record exists using matric number as key
                const studentDoc = await firestore.collection('students').doc(matric).get();
                if (studentDoc.exists) {
                    // Existing student - update last login and redirect
                    await firestore.collection('students').doc(matric).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                        uid: user.uid // Update UID in case it changed
                    });
                    const studentData = studentDoc.data();
                    sessionStorage.setItem('userData', JSON.stringify({
                        uid: user.uid,
                        email: user.email,
                        displayName: studentData.displayName,
                        matricNumber: matric,
                        role: 'student'
                    }));
                    redirectUser('student');
                } else {
                    // New student - create record
                    await processNewStudent(user, matric);
                }
            } catch (error) {
                console.error('Error checking user profile:', error);
                showToast('Error checking user profile', 'error');
                showLoginSection();
            }
        }
    });

    // Google Sign In
    googleSignInBtn.addEventListener('click', async function() {
        try {
            showLoading();
            hideAllSections();
            
            const result = await auth.signInWithPopup(googleProvider);
            const user = result.user;
            
            // The auth state change handler will process the user
            // No need to duplicate logic here
            
        } catch (error) {
            console.error('Error signing in:', error);
            showToast('Error signing in: ' + error.message, 'error');
            showLoginSection();
        } finally {
            hideLoading();
        }
    });

    // Manual profile setup removed. For public accounts we'll sign them out and ask them to use an institutional account.

    // Check if email is in admin list
    async function checkIfAdmin(email) {
        if (!email) return false;

        try {
            // Use sanitized email key (all dots replaced with commas)
            const adminKey = (typeof sanitizeEmailForKey === 'function') ? sanitizeEmailForKey(email) : email.toLowerCase().replace(/\./g, ',');
            const adminDoc = await firestore.collection('admins').doc(adminKey).get();
            return adminDoc.exists && adminDoc.data().active === true;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    // Process new student with matric-based key
    async function processNewStudent(user, matric) {
        try {
            const cleanedMatric = normalizeMatric(matric);
            
            // Create student record with matric as key
            const studentData = {
                email: user.email,
                matricNumber: cleanedMatric,
                displayName: cleanDisplayName(user.displayName),
                role: 'student',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                totalMerits: 0
            };
            await firestore.collection('students').doc(cleanedMatric).set(studentData);
            
            showToast('Welcome! Your student profile has been created.', 'success');
            redirectUser('student');
            
        } catch (error) {
            console.error('Error creating student profile:', error);
            showToast('Error creating profile: ' + error.message, 'error');
            await auth.signOut();
            showLoginSection();
        }
    }

    // Auto-process or prompt logic
    async function autoProcessOrPrompt(user) {
        if (!user || !user.email) {
            // No signed-in user: show login UI
            showLoginSection();
            return;
        }

        // FIRST: Check if user is an admin (bypasses all other checks)
        const isAdminUser = await checkIfAdmin(user.email);
        if (isAdminUser) {
            // Admin user - bypass all checks and redirect to admin dashboard
            const displayName = user.displayName ? cleanDisplayName(user.displayName) : user.email.split('@')[0];
            sessionStorage.setItem('userData', JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: displayName,
                matricNumber: '',
                role: 'admin'
            }));
            showToast('Signed in as admin', 'success');
            redirectUser('admin');
            return;
        }

        // For non-admins, check if institutional email
        const email = (user.email || '').toLowerCase();
        const domain = email.split('@')[1] || '';

        const isPublic = publicProviders.has(domain);
        const looksInstitutional = /\.(edu|ac|edu\.|\.edu\.|student|uni|university|college)\b/.test(domain) || !isPublic;

        if (looksInstitutional && !isPublic) {
            // Try to extract matric and name automatically
            await processInstitutionalUser(user);
        } else {
            // Public email provider -> sign out and ask to use institutional account
            await auth.signOut();
            showToast('Please sign in with your institutional Google account. Public providers are not allowed.', 'error');
            showLoginSection();
        }
    }

    // Extract matric from email local part
    function extractMatricFromEmail(email) {
        if (!email) return '';
        const local = email.split('@')[0] || '';
        // Remove plus/addressing and dots commonly used
        const cleaned = local.split('+')[0].split('.').join('').trim();
        return cleaned;
    }

    // Clean display name: remove trailing institutional tags and title-case
    function cleanDisplayName(name) {
        if (!name) return '';
        // Remove anything after slash, pipe, or hyphen commonly used for org suffixes
        let cleaned = name.split('/')[0].split('|')[0].split('-')[0].trim();
        // Collapse multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ').toLowerCase();
        // Title case
        cleaned = cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return cleaned;
    }

    // Attempt to save institutional user automatically
    async function processInstitutionalUser(user) {
        try {
            showLoading();
            hideAllSections();

            let matric = extractMatricFromEmail(user.email);
            // Normalize matric if helper available
            if (typeof normalizeMatric === 'function') {
                matric = normalizeMatric(matric);
            }
            // Validate with flexible check if available
            const matricLooksValid = (typeof isFlexibleMatric === 'function') ? isFlexibleMatric(matric) : Boolean(matric);

            // If no matric extracted or doesn't look valid, force logout and ask for institutional account
            if (!matric || !matricLooksValid) {
                console.warn('No matric could be extracted from email:', user.email);
                await auth.signOut();
                showToast('Could not extract matric from your account. Please sign in with an institutional Google account.', 'error');
                showLoginSection();
                return;
            }

            // Check if student record already exists with this matric
            const studentDoc = await firestore.collection('students').doc(matric).get();
            if (studentDoc.exists) {
                // Student record exists - sign them in
                const studentData = studentDoc.data();
                // Update session storage
                sessionStorage.setItem('userData', JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: studentData.displayName,
                    matricNumber: matric,
                    role: 'student'
                }));
                // Update last login
                await firestore.collection('students').doc(matric).update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('Welcome back!', 'success');
                redirectUser('student');
            } else {
                // Create new student record
                await processNewStudent(user, matric);
            }

        } catch (error) {
            console.error('Error processing institutional user:', error);
            // If anything fails during automatic processing, sign out and ask for institutional login
            try { await auth.signOut(); } catch (e) { /* ignore */ }
            showToast('Error processing account automatically. Please sign in with your institutional account.', 'error');
            showLoginSection();
        } finally {
            hideLoading();
        }
    }

    function showLoginSection() {
        hideAllSections();
        loginSection.classList.remove('d-none');
    }

    function hideAllSections() {
    loginSection.classList.add('d-none');
        loadingSpinner.classList.add('d-none');
    }

    function showLoading() {
        hideAllSections();
        loadingSpinner.classList.remove('d-none');
    }

    function hideLoading() {
        loadingSpinner.classList.add('d-none');
    }

    function redirectUser(role) {
        setTimeout(() => {
            if (role === 'admin') {
                window.location.href = getBasePath() + 'admin/dashboard.html';
            } else {
                window.location.href = getBasePath() + 'student/dashboard.html';
            }
        }, 1000);
    }
});

// Student Dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!requireAuth()) return;

    // Initialize dashboard
    initializeDashboard();

    // Sign out button
    document.getElementById('signOutBtn').addEventListener('click', signOut);
});

let studentMerits = [];
let events = {};

async function initializeDashboard() {
    try {
        showLoading();
        
        // Display user info
        displayUserInfo();
        
        // Load dashboard data
        await Promise.all([
            loadStudentMerits(),
            loadEvents(),
            loadRankingInfo()
        ]);
        
        // Calculate and display stats
        calculateStats();
        displayMeritBreakdown();
        displayRoleBreakdown();
        displayRecentMerits();
        displayAchievements();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    } finally {
        hideLoading();
    }
}

function displayUserInfo() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userDisplayName').textContent = user.displayName || user.email;
        document.getElementById('studentName').textContent = user.displayName || 'Student';
    }
}

async function loadStudentMerits() {
    try {
        const user = getCurrentUser();
        const meritsRef = db.collection('userMerits').doc(user.uid);
        const doc = await meritsRef.get();
        const meritsData = doc.exists ? doc.data() : {};
        // Firestore: meritsData is an object where keys are eventIds, values are eventMerits objects
        studentMerits = [];
        for (const eventId in meritsData) {
            const eventMerits = meritsData[eventId];
            for (const meritId in eventMerits) {
                studentMerits.push({
                    eventId,
                    meritId,
                    ...eventMerits[meritId]
                });
            }
        }
        studentMerits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (error) {
        console.error('Error loading student merits:', error);
        studentMerits = [];
    }
}

async function loadEvents() {
    try {
        const eventsSnapshot = await db.collection('events').get();
        events = {};
        eventsSnapshot.forEach(doc => {
            events[doc.id] = doc.data();
        });
    } catch (error) {
        console.error('Error loading events:', error);
        events = {};
    }
}

async function loadRankingInfo() {
    try {
        // Load all users' merit totals for ranking
        const [usersSnapshot, meritsSnapshot] = await Promise.all([
            db.collection('users').get(),
            db.collection('userMerits').get()
        ]);
        const users = {};
        usersSnapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
        const allMerits = {};
        meritsSnapshot.forEach(doc => {
            allMerits[doc.id] = doc.data();
        });
        // Calculate total points for each user
        const userTotals = [];
        const currentUser = getCurrentUser();
        for (const userId in users) {
            if (users[userId].role === 'admin') continue; // Skip admins
            let totalPoints = 0;
            const userMerits = allMerits[userId] || {};
            for (const eventId in userMerits) {
                const eventMerits = userMerits[eventId];
                for (const meritId in eventMerits) {
                    totalPoints += eventMerits[meritId].meritPoints || 0;
                }
            }
            userTotals.push({
                userId,
                totalPoints,
                isCurrentUser: userId === currentUser.uid
            });
        }
        // Sort by total points (descending)
        userTotals.sort((a, b) => b.totalPoints - a.totalPoints);
        // Find current user's rank
        const currentUserRank = userTotals.findIndex(user => user.isCurrentUser) + 1;
        document.getElementById('currentRank').textContent = currentUserRank > 0 ? `#${currentUserRank}` : '-';
    } catch (error) {
        console.error('Error loading ranking info:', error);
        document.getElementById('currentRank').textContent = '-';
    }
}

function calculateStats() {
    // Total merit points
    const totalMerits = studentMerits.reduce((sum, merit) => sum + (merit.meritPoints || 0), 0);
    document.getElementById('totalMerits').textContent = totalMerits;
    
    // Unique events participated
    const uniqueEvents = new Set(studentMerits.map(merit => merit.eventId));
    document.getElementById('totalEvents').textContent = uniqueEvents.size;
    
    // Average merit per event
    const averageMerit = uniqueEvents.size > 0 ? Math.round(totalMerits / uniqueEvents.size) : 0;
    document.getElementById('averageMerit').textContent = averageMerit;
}

function displayMeritBreakdown() {
    const breakdown = {};
    
    studentMerits.forEach(merit => {
        const level = merit.eventLevel || 'Unknown';
        breakdown[level] = (breakdown[level] || 0) + (merit.meritPoints || 0);
    });
    
    const container = document.getElementById('meritBreakdown');
    
    if (Object.keys(breakdown).length === 0) {
        container.innerHTML = '<div class="text-center text-secondary">No merit records found</div>';
        return;
    }
    
    const totalPoints = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
    
    container.innerHTML = Object.entries(breakdown)
        .sort(([,a], [,b]) => b - a)
        .map(([level, points]) => {
            const percentage = totalPoints > 0 ? (points / totalPoints) * 100 : 0;
            return `
                <div class="mb-3">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-medium">${sanitizeHTML(level)}</span>
                        <span class="text-sm">${points} points</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%">
                            ${percentage > 20 ? `${Math.round(percentage)}%` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
}

function displayRoleBreakdown() {
    const breakdown = {};
    
    studentMerits.forEach(merit => {
        const role = merit.role || 'Unknown';
        breakdown[role] = (breakdown[role] || 0) + (merit.meritPoints || 0);
    });
    
    const container = document.getElementById('roleBreakdown');
    
    if (Object.keys(breakdown).length === 0) {
        container.innerHTML = '<div class="text-center text-secondary">No merit records found</div>';
        return;
    }
    
    const totalPoints = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
    
    container.innerHTML = Object.entries(breakdown)
        .sort(([,a], [,b]) => b - a)
        .map(([role, points]) => {
            const percentage = totalPoints > 0 ? (points / totalPoints) * 100 : 0;
            return `
                <div class="mb-3">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-medium">${sanitizeHTML(role)}</span>
                        <span class="text-sm">${points} points</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%">
                            ${percentage > 20 ? `${Math.round(percentage)}%` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
}

function displayRecentMerits() {
    const tableBody = document.getElementById('recentMeritsTable');
    const recentMerits = studentMerits.slice(0, 5); // Show last 5 activities
    
    if (recentMerits.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-secondary">No merit activities found</td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = recentMerits.map(merit => {
        const event = events[merit.eventId] || {};
        const eventName = event.name || 'Unknown Event';
        const eventDate = event.date || merit.createdAt;
        
        return `
            <tr>
                <td>
                    <div class="font-medium">${sanitizeHTML(eventName)}</div>
                    <div class="text-sm text-secondary">${sanitizeHTML(event.level || '')}</div>
                </td>
                <td>${formatDate(eventDate)}</td>
                <td>
                    <span class="badge bg-primary">${sanitizeHTML(merit.role || '')}</span>
                </td>
                <td class="font-medium text-success">${merit.meritPoints || 0}</td>
                <td>
                    ${merit.additionalNotes ? 
                        `<span class="text-sm">${sanitizeHTML(merit.additionalNotes)}</span>` : 
                        '<span class="text-secondary">-</span>'
                    }
                </td>
            </tr>
        `;
    }).join('');
}

function displayAchievements() {
    const container = document.getElementById('achievementHighlights');
    
    // Analyze achievements from merit records
    const achievements = analyzeAchievements();
    
    if (achievements.length === 0) {
        container.innerHTML = '<div class="text-center text-secondary">No achievements to display yet</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="flex flex-wrap gap-2">
            ${achievements.map(achievement => `
                <div class="achievement-badge">
                    <div class="achievement-icon">${achievement.icon}</div>
                    <div>
                        <div class="font-medium">${achievement.title}</div>
                        <div class="text-xs opacity-80">${achievement.description}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function analyzeAchievements() {
    const achievements = [];
    const totalPoints = studentMerits.reduce((sum, merit) => sum + (merit.meritPoints || 0), 0);
    const uniqueEvents = new Set(studentMerits.map(merit => merit.eventId));
    
    // Point-based achievements
    if (totalPoints >= 100) achievements.push({
        icon: '🏆',
        title: 'Merit Collector',
        description: `${totalPoints} total points`
    });
    
    if (totalPoints >= 500) achievements.push({
        icon: '⭐',
        title: 'Merit Star',
        description: 'Over 500 points!'
    });
    
    // Event participation achievements
    if (uniqueEvents.size >= 5) achievements.push({
        icon: '🎯',
        title: 'Active Participant',
        description: `${uniqueEvents.size} events joined`
    });
    
    if (uniqueEvents.size >= 10) achievements.push({
        icon: '🚀',
        title: 'Event Enthusiast',
        description: 'Double digit events!'
    });
    
    // Special achievements from notes
    const hasChampion = studentMerits.some(merit => 
        merit.additionalNotes && merit.additionalNotes.toLowerCase().includes('champion')
    );
    if (hasChampion) achievements.push({
        icon: '👑',
        title: 'Champion',
        description: 'Won a competition!'
    });
    
    const hasLeadership = studentMerits.some(merit => 
        merit.role && ['AJK', 'Committee', 'Leader'].some(role => 
            merit.role.toLowerCase().includes(role.toLowerCase())
        )
    );
    if (hasLeadership) achievements.push({
        icon: '🎖️',
        title: 'Leader',
        description: 'Organizing committee member'
    });
    
    // Level diversity
    const levels = new Set(studentMerits.map(merit => merit.eventLevel));
    if (levels.size >= 3) achievements.push({
        icon: '🌟',
        title: 'Well Rounded',
        description: 'Participated in multiple event levels'
    });
    
    return achievements;
}

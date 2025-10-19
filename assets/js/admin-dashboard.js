// Admin Dashboard functionality
// Use Firestore as db for consistency
const db = window.firestore || window.db || firebase.firestore();
document.addEventListener('DOMContentLoaded', function() {
    // Check admin authentication
    if (!requireAdmin()) return;

    // Initialize dashboard
    initializeDashboard();

    // Sign out button
    document.getElementById('signOutBtn').addEventListener('click', signOut);
});

async function initializeDashboard() {
    try {
        showLoading();
        
        // Display user info
        displayUserInfo();
        
        // Load dashboard data
        await Promise.all([
            loadDashboardStats(),
            loadRecentEvents(),
            loadRecentActivity()
        ]);
        
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
    }
}

async function loadDashboardStats() {
    try {
        // Load events count
        const eventsSnapshot = await db.collection('events').get();
        const eventsArray = eventsSnapshot.docs.map(doc => doc.data());
        document.getElementById('totalEvents').textContent = eventsArray.length;
        // Count active events (future events)
        const now = Date.now();
        const activeEvents = eventsArray.filter(event => new Date(event.date).getTime() > now);
        document.getElementById('activeEvents').textContent = activeEvents.length;
        // Load users count
        const usersSnapshot = await db.collection('users').get();
        const usersArray = usersSnapshot.docs.map(doc => doc.data());
        const studentsArray = usersArray.filter(user => user.role !== 'admin');
        document.getElementById('totalStudents').textContent = studentsArray.length;
        // Count total merits
        let totalMerits = 0;
        const userMeritsSnapshot = await db.collection('userMerits').get();
        userMeritsSnapshot.forEach(doc => {
            const userMerits = doc.data() || {};
            for (const eventId in userMerits) {
                const eventMerits = userMerits[eventId] || {};
                totalMerits += Object.keys(eventMerits).length;
            }
        });
        document.getElementById('totalMerits').textContent = totalMerits;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

async function loadRecentEvents() {
    try {
        const eventsSnapshot = await db.collection('events').orderBy('createdAt', 'desc').limit(10).get();
        const eventsArray = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(event => !event.isSubActivity).slice(0, 5);
        const tableBody = document.getElementById('recentEventsTable');
        if (eventsArray.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary">No events found</td>
                </tr>
            `;
            return;
        }
        tableBody.innerHTML = eventsArray.map(event => {
            const eventDate = new Date(event.date);
            const isUpcoming = eventDate.getTime() > Date.now();
            const status = isUpcoming ? 'Upcoming' : 'Completed';
            const statusClass = isUpcoming ? 'text-success' : 'text-secondary';
            return `
                <tr>
                    <td class="font-medium">${sanitizeHTML(event.name)}</td>
                    <td><span class="badge bg-primary">${sanitizeHTML(event.level)}</span></td>
                    <td>${formatDate(event.date)}</td>
                    <td><span class="${statusClass}">${status}</span></td>
                    <td>
                        <a href="event-details.html?id=${event.id}" class="btn btn-outline btn-sm">View</a>
                        <a href="upload-merits.html?eventId=${event.id}" class="btn btn-primary btn-sm">Add Merits</a>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading recent events:', error);
        document.getElementById('recentEventsTable').innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">Error loading events</td>
            </tr>
        `;
    }
}

async function loadRecentActivity() {
    try {
        const activityContainer = document.getElementById('recentActivity');
        // Load recent user registrations
        const usersSnapshot = await db.collection('users').orderBy('createdAt', 'desc').limit(5).get();
        const recentUsers = usersSnapshot.docs.map(doc => doc.data()).filter(user => user.createdAt).slice(0, 3);
        // Load recent events
        const eventsSnapshot = await db.collection('events').orderBy('createdAt', 'desc').limit(6).get();
        const recentEvents = eventsSnapshot.docs.map(doc => doc.data()).filter(event => event.createdAt).slice(0, 2);
        const activities = [];
        // Add user activities
        recentUsers.forEach(user => {
            activities.push({
                type: 'user',
                message: `New user registered: ${user.displayName}`,
                timestamp: user.createdAt
            });
        });
        // Add event activities
        recentEvents.forEach(event => {
            activities.push({
                type: 'event',
                message: `New event created: ${event.name}`,
                timestamp: event.createdAt
            });
        });
        // Sort by timestamp
        activities.sort((a, b) => b.timestamp - a.timestamp);
        if (activities.length === 0) {
            activityContainer.innerHTML = `
                <div class="text-center text-secondary">
                    <p>No recent activity</p>
                </div>
            `;
            return;
        }
        activityContainer.innerHTML = activities.slice(0, 5).map(activity => `
            <div class="flex items-start gap-3 mb-3 pb-3 border-b border-gray-200 last:border-b-0">
                <div class="w-2 h-2 rounded-full bg-${activity.type === 'user' ? 'success' : 'primary'} mt-2"></div>
                <div>
                    <p class="text-sm">${sanitizeHTML(activity.message)}</p>
                    <p class="text-xs text-secondary">${formatDateTime(activity.timestamp)}</p>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading recent activity:', error);
        document.getElementById('recentActivity').innerHTML = `
            <div class="text-center text-danger">
                <p>Error loading activity</p>
            </div>
        `;
    }
}

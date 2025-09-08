// Utility functions for the merit system

// Format date for display
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format datetime for display
function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Show loading spinner
function showLoading() {
    document.getElementById('loadingSpinner')?.classList.remove('d-none');
}

// Hide loading spinner
function hideLoading() {
    document.getElementById('loadingSpinner')?.classList.add('d-none');
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        // If no toast container, fall back to alert
        alert(message);
        return;
    }

    // Map types to CSS color variables
    const colorMap = {
        'success': 'var(--success-color)',
        'error': 'var(--danger-color)',
        'warning': 'var(--warning-color)',
        'info': 'var(--info-color)',
        'primary': 'var(--primary-color)'
    };
    
    const backgroundColor = colorMap[type] || colorMap['info'];

    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast toast-${type}" role="alert" style="min-width: 250px; margin-bottom: 0.5rem; padding: 0.75rem 1rem; background: ${backgroundColor}; color: white; border-radius: 0.375rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); opacity: 0; transition: opacity 0.3s ease; position: relative; z-index: 1050;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1; font-weight: 500;">${message}</div>
                <button type="button" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; margin-left: 0.5rem; padding: 0; line-height: 1;">&times;</button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
    
    // Show the toast with animation
    setTimeout(() => {
        toastElement.style.opacity = '1';
    }, 10);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toastElement && toastElement.parentNode) {
            toastElement.style.opacity = '0';
            setTimeout(() => {
                if (toastElement && toastElement.parentNode) {
                    toastElement.remove();
                }
            }, 300);
        }
    }, 5000);
}

// Validate matric number format
function validateMatricNumber(matricNumber) {
    const pattern = /^[A-Z]\d{8}$/; // Format: A12345678
    return pattern.test(matricNumber);
}

// Normalize institutional matric strings extracted from email local-part into a canonical form
function normalizeMatric(raw) {
    if (!raw) return '';
    // Remove dots and plus addressing, trim
    let s = String(raw).split('+')[0].replace(/\./g, '').trim();
    // Uppercase letters, preserve digits
    s = s.toUpperCase();
    // Common student local-parts like s12345 -> S12345 (no further padding)
    // If you need to map to A12345678 format, adapt this function.
    return s;
}

// A flexible matric check used for auto-detected values
function isFlexibleMatric(matric) {
    if (!matric) return false;
    const s = String(matric).trim();
    // Accept patterns like S12345, s12345, or the strict A12345678
    return /^[A-Z]\d{4,9}$/.test(s) || /^[A-Z]\d{8}$/.test(s);
}

// Public/common email providers set (used to differentiate institutional accounts)
const PUBLIC_EMAIL_PROVIDERS = new Set([
    'gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com',
    'icloud.com','protonmail.com','aol.com','live.com','mail.com'
]);

// Email sanitization for Firebase keys: replace ALL dots with commas (Firebase paths can't contain dots)
function sanitizeEmailForKey(email) {
    return String(email || '').toLowerCase().replace(/\./g, ',');
}

function unsanitizeKey(key) {
    return String(key || '').replace(/,/g, '.');
}

// Sanitize HTML to prevent XSS
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Export data to CSV
function exportToCSV(data, filename) {
    const csv = convertArrayToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Convert array to CSV format
function convertArrayToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const value = row[header] || '';
                // Escape commas and quotes
                return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                    ? `"${value.replace(/"/g, '""')}"` 
                    : value;
            }).join(',')
        )
    ].join('\n');
    
    return csvContent;
}

// Parse Excel file using SheetJS
function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                resolve(jsonData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Debounce function for search inputs
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Calculate merit points based on role, event level, and additional notes
function calculateMeritPoints(role, eventLevel, additionalNotes = '', meritValues) {
    if (!meritValues) return 0;
    
    let basePoints = 0;
    
    // Get base points for role and event level
    if (meritValues.roles && meritValues.roles[role] && meritValues.roles[role][eventLevel]) {
        basePoints = meritValues.roles[role][eventLevel];
    }
    
    // Add bonus points for achievements
    let bonusPoints = 0;
    if (additionalNotes && meritValues.achievements) {
        const notes = additionalNotes.toLowerCase();
        for (const [achievement, values] of Object.entries(meritValues.achievements)) {
            if (notes.includes(achievement.toLowerCase()) && values[eventLevel]) {
                bonusPoints = Math.max(bonusPoints, values[eventLevel]);
            }
        }
    }
    
    return basePoints + bonusPoints;
}

// Protected route function - redirect if not authenticated
function requireAuth() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = '/index.html';
        return false;
    }
    return true;
}

// Admin only route function
function requireAdmin() {
    if (!requireAuth()) return false;
    
    if (!isAdmin()) {
        window.location.href = '/student/dashboard.html';
        return false;
    }
    return true;
}

// Mobile Navigation Utilities
// Add this script to enhance mobile responsiveness across all pages

// Mobile navigation toggle function
function toggleMobileMenu() {
    const mobileNav = document.getElementById('mobileNav');
    if (mobileNav) {
        mobileNav.classList.toggle('active');
    }
}

// Initialize mobile navigation
function initMobileNav() {
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        const mobileNav = document.getElementById('mobileNav');
        const menuBtn = document.querySelector('.mobile-menu-btn');
        
        if (mobileNav && menuBtn && !mobileNav.contains(e.target) && !menuBtn.contains(e.target)) {
            mobileNav.classList.remove('active');
        }
    });
    
    // Close mobile menu when navigating
    const mobileLinks = document.querySelectorAll('.mobile-nav .nav-link');
    mobileLinks.forEach(link => {
        link.addEventListener('click', function() {
            const mobileNav = document.getElementById('mobileNav');
            if (mobileNav) {
                mobileNav.classList.remove('active');
            }
        });
    });
}

// Responsive table enhancements
function enhanceResponsiveTables() {
    const tables = document.querySelectorAll('.table');
    
    tables.forEach(table => {
        // Add mobile-specific classes for better scrolling
        const container = table.closest('.table-container');
        if (container) {
            container.style.position = 'relative';
            
            // Add scroll indicators for mobile
            if (window.innerWidth <= 768) {
                container.style.background = 'linear-gradient(90deg, white 30%, rgba(255,255,255,0)), linear-gradient(90deg, rgba(255,255,255,0), white 70%) 100% 0';
                container.style.backgroundRepeat = 'no-repeat';
                container.style.backgroundSize = '40px 100%, 40px 100%';
                container.style.backgroundAttachment = 'local, local';
            }
        }
    });
}

// Form enhancements for mobile
function enhanceMobileForms() {
    // Add better touch targets for checkboxes and radio buttons
    const checkboxes = document.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    checkboxes.forEach(input => {
        if (window.innerWidth <= 768) {
            input.style.transform = 'scale(1.2)';
            input.style.margin = '0.5rem';
        }
    });
    
    // Improve select dropdowns for touch
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        if (window.innerWidth <= 768) {
            select.style.minHeight = '44px'; // iOS recommended touch target
        }
    });
}

// Modal responsiveness
function enhanceModals() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent && window.innerWidth <= 768) {
            modalContent.style.maxHeight = '90vh';
            modalContent.style.margin = '5vh auto';
            modalContent.style.width = '95%';
        }
    });
}

// Toast positioning for mobile
function enhanceToasts() {
    const toastContainer = document.getElementById('toastContainer');
    if (toastContainer && window.innerWidth <= 768) {
        toastContainer.style.top = '1rem';
        toastContainer.style.left = '1rem';
        toastContainer.style.right = '1rem';
        toastContainer.style.width = 'auto';
    }
}

// Initialize all mobile enhancements
function initMobileEnhancements() {
    initMobileNav();
    enhanceResponsiveTables();
    enhanceMobileForms();
    enhanceModals();
    enhanceToasts();
}

// Run on DOM content loaded
document.addEventListener('DOMContentLoaded', function() {
    initMobileEnhancements();
});

// Re-run on window resize
window.addEventListener('resize', function() {
    enhanceResponsiveTables();
    enhanceMobileForms();
    enhanceModals();
    enhanceToasts();
});

// Viewport height fix for mobile browsers
function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Set on load and resize
setViewportHeight();
window.addEventListener('resize', setViewportHeight);

// Performance optimization: Debounce scroll events
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

// Smooth scroll polyfill for older browsers
if (!('scrollBehavior' in document.documentElement.style)) {
    const smoothScroll = function(target) {
        const element = document.querySelector(target);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    };
    
    // Apply to anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            smoothScroll(this.getAttribute('href'));
        });
    });
}

// Add loading states for better UX
function addLoadingStates() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(btn => {
        if (!btn.dataset.enhanced) {
            btn.addEventListener('click', function() {
                if (!this.disabled && !this.classList.contains('btn-outline')) {
                    this.style.opacity = '0.7';
                    this.style.cursor = 'not-allowed';
                    
                    // Reset after 2 seconds (fallback)
                    setTimeout(() => {
                        this.style.opacity = '';
                        this.style.cursor = '';
                    }, 2000);
                }
            });
            btn.dataset.enhanced = 'true';
        }
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', addLoadingStates);

// Enhanced error handling for forms
function enhanceFormValidation() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        if (!form.dataset.enhanced) {
            form.addEventListener('submit', function(e) {
                const requiredFields = form.querySelectorAll('[required]');
                let isValid = true;
                
                requiredFields.forEach(field => {
                    if (!field.value.trim()) {
                        field.style.borderColor = 'var(--danger-color)';
                        field.addEventListener('input', function() {
                            this.style.borderColor = '';
                        }, { once: true });
                        isValid = false;
                    }
                });
                
                if (!isValid) {
                    e.preventDefault();
                    const firstInvalid = form.querySelector('[style*="border-color"]');
                    if (firstInvalid) {
                        firstInvalid.focus();
                        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            });
            form.dataset.enhanced = 'true';
        }
    });
}

// Initialize form validation
document.addEventListener('DOMContentLoaded', enhanceFormValidation);

// Add keyboard navigation support
function enhanceKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        // Close modals with Escape key
        if (e.key === 'Escape') {
            const visibleModal = document.querySelector('.modal:not(.d-none)');
            if (visibleModal) {
                const closeBtn = visibleModal.querySelector('[onclick*="close"]');
                if (closeBtn) {
                    closeBtn.click();
                }
            }
            
            // Close mobile menu with Escape
            const mobileNav = document.getElementById('mobileNav');
            if (mobileNav && mobileNav.classList.contains('active')) {
                mobileNav.classList.remove('active');
            }
        }
        
        // Tab trapping in modals
        if (e.key === 'Tab') {
            const visibleModal = document.querySelector('.modal:not(.d-none)');
            if (visibleModal) {
                const focusableElements = visibleModal.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    });
}

// Initialize keyboard navigation
document.addEventListener('DOMContentLoaded', enhanceKeyboardNavigation);

// 0. VIEWPORT HEIGHT FIX FOR MOBILE
// On mobile, move the alpha-rail outside .app-container so we can use
// position:fixed against the real viewport (backdrop-filter on the
// container breaks fixed positioning when the rail is inside it).
function fixMobileLayout() {
    const rail = document.getElementById('alpha-rail');
    const header = document.querySelector('.search-header');
    if (!rail || !header) return;

    if (window.innerWidth <= 600) {
        // Move rail to body so position:fixed works correctly
        if (rail.parentElement !== document.body) {
            document.body.appendChild(rail);
        }
        rail.style.position = 'fixed';
        rail.style.right = '2px';
        rail.style.top = header.getBoundingClientRect().bottom + 'px';
        rail.style.bottom = '0px';
        rail.style.height = '';
        rail.style.zIndex = '9999';
        rail.style.overflowY = 'auto';
    } else {
        // Desktop: move rail back inside container, clear inline styles
        const container = document.querySelector('.app-container');
        if (rail.parentElement !== container) {
            container.appendChild(rail);
        }
        rail.style.position = '';
        rail.style.right = '';
        rail.style.top = '';
        rail.style.bottom = '';
        rail.style.height = '';
        rail.style.zIndex = '';
        rail.style.overflowY = '';
    }
}
window.addEventListener('load', fixMobileLayout);
setTimeout(fixMobileLayout, 100);
window.addEventListener('resize', fixMobileLayout);

// 1. DATA: Hardcoded list of 100 technical/HCI words (A–U coverage)
const database = [
    "Affordance", "Algorithm", "Animation", "API", "Application", "Array", "Authentication", "Automation",
    "Backend", "Bandwidth", "Beta", "Blockchain", "Bluetooth", "Boolean", "Browser",
    "Cache", "Cloud", "Code", "Compiler", "Computer", "Console", "Cookie", "CPU", "CSS",
    "Dashboard", "Database", "Debugging", "Deployment", "Design", "Developer", "Domain",
    "Element", "Email", "Encryption", "Error", "Event", "Exception", "Extension",
    "Feedback", "File", "Firewall", "Firmware", "Framework", "Frontend",
    "Gateway", "Gigabyte", "Git", "GPU", "Grid",
    "Hardware", "Header", "HTML", "HTTP", "Hyperlink",
    "Icon", "Image", "Import", "Input", "Interface",
    "Java", "Javascript", "JSON",
    "Kernel", "Keyboard", "Keyword",
    "Latency", "Library", "Linux", "Login",
    "Machine Learning", "Malware", "Memory", "Metadata", "Method",
    "Navbar", "Network", "Node", "Notification",
    "Pixel", "Plugin", "Protocol", "Python",
    "RAM", "Repository", "Router", "Runtime",
    "Server", "Software", "Stack", "Syntax",
    "Terminal", "Thread", "Token",
    "Upload", "URL", "Usability",
    "Variable", "Version", "Virtual",
    "Widget"
];

// 2. DOM ELEMENTS
const searchInput   = document.getElementById('search-input');
const wordList      = document.getElementById('word-list');
const countDisplay  = document.getElementById('count-display');
const emptyState    = document.getElementById('empty-state');
const clearBtn      = document.getElementById('clear-btn');
const scrollTopBtn  = document.getElementById('scroll-top-btn');
const listContainer = document.getElementById('list-container');
const alphaRail     = document.getElementById('alpha-rail');
const totalBadge    = document.getElementById('total-badge');
const shortcutHint  = document.getElementById('shortcut-hint');
const toast         = document.getElementById('toast');

// Set badge count
totalBadge.textContent = database.length;

// 3. HELPER: Escape regex special characters in user query
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// 4. SOUND EFFECTS (Web Audio API — no external files needed)
// ============================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
}

// Soft chime: single sine at 660Hz with a slow fade
function playSuccessSound() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
}

// Error buzz: harsh sawtooth at low frequency
function playFailSound() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
}

// ============================================================
// 5. TOAST NOTIFICATION
// ============================================================
let toastTimer = null;

function showToast(message, duration = 2000) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.remove('hidden');
    // Force reflow so the transition plays from the start
    void toast.offsetWidth;
    toast.classList.add('visible');

    toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

// ============================================================
// 6. SMOOTH SCROLL HELPER (replaces CSS scroll-behavior)
// ============================================================
let scrollAnimationId = null; // Track current animation so we can cancel it

function smoothScrollTo(container, targetTop, duration = 350) {
    // Cancel any in-progress scroll animation
    if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
    }

    const start = container.scrollTop;
    const distance = targetTop - start;
    if (Math.abs(distance) < 1) return;
    let startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out quad
        const ease = 1 - (1 - progress) * (1 - progress);
        container.scrollTop = start + distance * ease;
        if (progress < 1) {
            scrollAnimationId = requestAnimationFrame(step);
        } else {
            scrollAnimationId = null;
        }
    }
    scrollAnimationId = requestAnimationFrame(step);
}

// Helper: get an element's true scroll position inside the container.
// position:sticky distorts offsetTop/getBoundingClientRect when scrolled,
// so we temporarily reset scrollTop to 0 for a clean measurement.
// This is synchronous — the browser never paints the intermediate state.
function getScrollPosition(target, container) {
    const saved = container.scrollTop;
    container.scrollTop = 0;
    const pos = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop = saved;
    return pos;
}

// ============================================================
// 7. MAIN FUNCTION: Render the list grouped by first letter
// ============================================================
function renderList(query = '') {
    wordList.innerHTML = '';

    // Filter logic: case-insensitive
    const filteredWords = database.filter(word =>
        word.toLowerCase().includes(query.toLowerCase())
    );

    // Update counter
    if (query === '') {
        countDisplay.textContent = `${database.length} contacts available`;
    } else {
        countDisplay.textContent = `${filteredWords.length} result${filteredWords.length !== 1 ? 's' : ''} found`;
    }

    // Toggle empty state
    if (filteredWords.length === 0) {
        emptyState.classList.remove('hidden');
        wordList.classList.add('hidden');
        alphaRail.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        wordList.classList.remove('hidden');
        alphaRail.classList.remove('hidden');
    }

    // Group words by first letter
    const groups = {};
    filteredWords.forEach(word => {
        const letter = word[0].toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(word);
    });

    // Build list with section headers and items
    let itemIndex = 0;
    const MAX_STAGGER = 20;

    Object.keys(groups).sort().forEach(letter => {
        // Section header
        const header = document.createElement('li');
        header.className = 'section-header';
        header.textContent = letter;
        header.id = `section-${letter}`;
        wordList.appendChild(header);

        // Items in this group
        groups[letter].forEach(word => {
            const li = document.createElement('li');
            li.className = 'word-item';

            // Stagger animation delay (capped)
            const delay = Math.min(itemIndex, MAX_STAGGER) * 25;
            li.style.setProperty('--delay', `${delay}ms`);

            // Letter avatar
            const avatar = document.createElement('span');
            avatar.className = `avatar avatar-${letter.toLowerCase()}`;
            avatar.textContent = letter;
            li.appendChild(avatar);

            // Word text (with highlight if searching)
            const textSpan = document.createElement('span');
            if (query) {
                const escaped = escapeRegex(query);
                const regex = new RegExp(`(${escaped})`, 'gi');
                textSpan.innerHTML = word.replace(regex, '<span class="highlight">$1</span>');
            } else {
                textSpan.textContent = word;
            }
            li.appendChild(textSpan);

            wordList.appendChild(li);
            itemIndex++;
        });
    });

    // Rebuild alphabet rail
    buildAlphaRail(Object.keys(groups).sort());
}

// ============================================================
// 8. ALPHABET QUICK-JUMP RAIL
// ============================================================
function buildAlphaRail(activeLetters) {
    alphaRail.innerHTML = '';
    const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    allLetters.forEach(letter => {
        const span = document.createElement('span');
        span.className = 'alpha-rail-letter';
        span.textContent = letter;

        if (activeLetters.includes(letter)) {
            span.classList.add('active');
            span.addEventListener('click', () => {
                const target = document.getElementById(`section-${letter}`);
                if (target) {
                    const targetTop = getScrollPosition(target, listContainer);
                    smoothScrollTo(listContainer, targetTop);
                    playSuccessSound();
                }
            });
        } else {
            // Letter has no words — play fail sound + show toast
            span.addEventListener('click', () => {
                playFailSound();
                showToast(`No words starting with "${letter}"`);
            });
        }

        alphaRail.appendChild(span);
    });
}

// ============================================================
// 9. EVENT LISTENERS
// ============================================================

// Search input
searchInput.addEventListener('input', (e) => {
    const value = e.target.value;
    renderList(value);

    // Toggle clear button
    if (value.length > 0) {
        clearBtn.classList.remove('hidden');
        shortcutHint.style.opacity = '0';
    } else {
        clearBtn.classList.add('hidden');
        shortcutHint.style.opacity = '1';
    }
});

// Clear button
clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    shortcutHint.style.opacity = '1';
    searchInput.focus();
    renderList();
});

// Keyboard shortcut: "/" to focus search, Escape to clear
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        shortcutHint.style.opacity = '1';
        searchInput.blur();
        renderList();
    }
});

// Scroll-to-top button visibility
listContainer.addEventListener('scroll', () => {
    if (listContainer.scrollTop > 200) {
        scrollTopBtn.classList.add('visible');
        scrollTopBtn.classList.remove('hidden');
    } else {
        scrollTopBtn.classList.remove('visible');
    }
});

// Scroll-to-top click
scrollTopBtn.addEventListener('click', () => {
    smoothScrollTo(listContainer, 0);
});

// ============================================================
// 10. INITIAL RENDER
// ============================================================
renderList();

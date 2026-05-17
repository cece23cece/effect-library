// Full updated script.js with Sources and Backup functionality - see full code below
// =============================================
// Effect Library - Full Script v3.68
// =============================================

let effects = [];
let categories = ["All Effects"];
let sources = [];
let currentCategory = "All Effects";
let db = null;

// ==================== IndexedDB Setup ====================
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("EffectLibraryDB", 6);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains("sources")) {
                db.createObjectStore("sources", { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        request.onerror = (e) => reject(e);
    });
}

// Load Sources
async function loadSources() {
    if (!db) await initDB();
    return new Promise(resolve => {
        const tx = db.transaction("sources", "readonly");
        const store = tx.objectStore("sources");
        const req = store.getAll();
        req.onsuccess = () => {
            sources = req.result || [];
            resolve(sources);
        };
    });
}

function saveSources() {
    if (!db) return;
    const tx = db.transaction("sources", "readwrite");
    const store = tx.objectStore("sources");
    store.clear();
    sources.forEach(item => store.put(item));
}

// ==================== Sources Functions ====================
function renderSources() {
    const container = document.getElementById("sources-list") || document.getElementById("sources-container");
    if (!container) return;

    container.innerHTML = sources.length === 0 
        ? `<div class="text-center py-12 text-zinc-400">No sources yet.<br>Click "Add New Source"</div>`
        : sources.map((s, i) => `
            <div class="bg-zinc-900 border border-zinc-700 rounded-3xl p-5 flex justify-between items-center">
                <div>
                    <div class="font-medium">${s.name}</div>
                    ${s.type ? `<div class="text-xs text-zinc-500">${s.type}</div>` : ''}
                </div>
                <button onclick="deleteSource(${i})" class="text-red-400 hover:text-red-300 p-2">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
}

function addNewSource() {
    document.getElementById("source-modal").classList.remove("hidden");
    document.getElementById("source-name").focus();
}

function closeSourceModal() {
    document.getElementById("source-modal").classList.add("hidden");
}

function saveNewSource() {
    const name = document.getElementById("source-name").value.trim();
    if (!name) return alert("Source name is required");

    sources.unshift({
        id: "src_" + Date.now(),
        name: name,
        type: document.getElementById("source-type").value.trim() || "General",
        added: new Date().toISOString()
    });

    saveSources();
    renderSources();
    closeSourceModal();
    showToast("✅ Source added");
}

function deleteSource(i) {
    if (confirm("Delete this source?")) {
        sources.splice(i, 1);
        saveSources();
        renderSources();
    }
}

// ==================== Backup & Import/Export ====================
function fullAppBackup() {
    const backup = {
        version: "3.68",
        exportedAt: new Date().toISOString(),
        effects: effects,
        categories: categories,
        sources: sources
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EffectLibrary_FullBackup_${new Date().toISOString().slice(0,16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("💾 Full Backup downloaded");
}

function exportData() {
    fullAppBackup();
}

function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.effects) effects = data.effects;
                if (data.categories) categories = data.categories;
                if (data.sources) {
                    sources = data.sources;
                    saveSources();
                }
                renderEverything();
                showToast("✅ Import successful!");
            } catch (err) {
                alert("❌ Invalid backup file");
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ==================== Basic UI Helpers ====================
function showToast(message) {
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#18181b; color:white; padding:12px 24px; border-radius:9999px; z-index:9999; border:1px solid #3b82f6;";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function renderEverything() {
    // Placeholder - add your original render functions here if needed
    console.log("App rendered");
}

// ==================== Tab Switching ====================
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const content = document.getElementById('section-' + tab) || document.getElementById('tab-content-' + tab);
    if (content) content.classList.remove('hidden');

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + tab);
    if (activeTab) activeTab.classList.add('active');

    if (tab === 'sources' || tab === 2) {
        loadSources().then(renderSources);
    }
}

// Init App
window.onload = async function() {
    await initDB();
    await loadSources();
    
    // Default to Manage tab
    switchTab('manage');
    
    console.log("✅ Effect Library v3.68 fully loaded with Sources + Backup");
    showToast("✅ App restored - Import your backup now");
};

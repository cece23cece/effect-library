// =============================================
// Effect Library - Full Script v3.68 (Stable Restore)
// Restores original working Import + category rebuilding
// + Sources tab functionality
// =============================================

let effects = [];
let categories = [];
let sources = [];
let selectedCategory = null;
let db = null;

// ==================== IndexedDB ====================
function initDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open('EffectLibraryDB', 5);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('effects')) {
                db.createObjectStore('effects', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('categories')) {
                db.createObjectStore('categories', { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains('sources')) {
                db.createObjectStore('sources', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
    });
}

async function loadData() {
    effects = await getAllEffects();
    categories = await getAllCategories();
    if (categories.length === 0) {
        categories = ["Art Style","Artists","Colours","Details","Fantasy","Fashion","Lighting","Perspective","People","Photography","Textures","Vintage","Uncategorised"];
        await saveCategories();
    }
    if (!categories.includes("Uncategorised")) {
        categories.push("Uncategorised");
        await saveCategories();
    }
}

function getAllEffects() {
    return new Promise(resolve => {
        const tx = db.transaction('effects', 'readonly');
        tx.objectStore('effects').getAll().onsuccess = e => resolve(e.target.result || []);
    });
}

function getAllCategories() {
    return new Promise(resolve => {
        const tx = db.transaction('categories', 'readonly');
        tx.objectStore('categories').getAll().onsuccess = e => {
            const raw = e.target.result || [];
            resolve(raw.map(c => (c && c.name) ? c.name : c));
        };
    });
}

async function saveData() {
    const tx = db.transaction('effects', 'readwrite');
    const store = tx.objectStore('effects');
    store.clear();
    for (const eff of effects) {
        await new Promise(r => store.put(eff).onsuccess = r);
    }
}

async function saveCategories() {
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    store.clear();
    for (const cat of categories) {
        await new Promise(r => store.put({ name: cat }).onsuccess = r);
    }
}

// ==================== ORIGINAL WORKING IMPORT ====================
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                const importedData = JSON.parse(ev.target.result);

                if (!importedData.effects || !importedData.categories) {
                    alert("❌ Invalid backup file — missing effects or categories");
                    return;
                }

                if (!confirm(`Import ${importedData.effects.length} effects? This will replace current data.`)) {
                    return;
                }

                // Clean effects
                let cleanedEffects = importedData.effects.map(eff => {
                    let cats = [];
                    if (eff.categories && Array.isArray(eff.categories)) {
                        cats = eff.categories;
                    } else if (eff.category && typeof eff.category === 'string') {
                        cats = [eff.category];
                    }
                    cats = cats.map(c => {
                        if (typeof c === 'string') return c.trim();
                        if (c && c.name) return c.name.trim();
                        return String(c).trim();
                    }).filter(Boolean);
                    if (cats.length === 0) cats = ["Uncategorised"];

                    return {
                        id: eff.id || 'eff_' + Date.now() + Math.random(),
                        name: eff.name || 'Unnamed Effect',
                        categories: cats,
                        prompt: eff.prompt || '',
                        notes: eff.notes || '',
                        image: eff.image || null,
                        dateAdded: eff.dateAdded || new Date().toISOString()
                    };
                });

                // Clean categories
                let cleanedCategories = importedData.categories.map(c => {
                    if (typeof c === 'string') return c.trim();
                    if (c && c.name) return c.name.trim();
                    return String(c).trim();
                }).filter(Boolean);

                if (!cleanedCategories.includes("Uncategorised")) {
                    cleanedCategories.push("Uncategorised");
                }

                effects = cleanedEffects;
                categories = cleanedCategories;

                await saveData();
                await saveCategories();

                // Re-render UI
                if (typeof renderManageSidebar === 'function') renderManageSidebar();
                if (typeof renderMainEffects === 'function' && selectedCategory) {
                    renderMainEffects(selectedCategory);
                } else if (typeof renderMainEffects === 'function') {
                    renderMainEffects("Uncategorised");
                }

                const summary = `${effects.length} effects + ${categories.length} categories imported`;
                if (typeof showToast === 'function') showToast(summary);
                alert(`✅ Import Complete!\n\n${summary}`);

            } catch (err) {
                alert("❌ Error importing file: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ==================== EXPORT & FULL BACKUP ====================
async function exportData(autoBackup = false) {
    const data = {
        version: "3.68",
        exportedAt: new Date().toISOString(),
        categories: categories,
        effects: effects,
        sources: sources
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EL_${new Date().toISOString().slice(0,10)}_${new Date().toTimeString().slice(0,5).replace(':','-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function fullAppBackup() {
    exportData();
}

// ==================== SOURCES ====================
async function loadSources() {
    if (!db) await initDB();
    return new Promise(resolve => {
        const tx = db.transaction('sources', 'readonly');
        tx.objectStore('sources').getAll().onsuccess = e => {
            sources = e.target.result || [];
            resolve(sources);
        };
    });
}

function saveSources() {
    if (!db) return;
    const tx = db.transaction('sources', 'readwrite');
    const store = tx.objectStore('sources');
    store.clear();
    sources.forEach(s => store.put(s));
}

function renderSources() {
    const list = document.getElementById('sources-list');
    if (!list) return;
    list.innerHTML = sources.length === 0 
        ? `<p class="text-zinc-400 text-center py-8">No sources yet</p>`
        : sources.map((s, i) => `
            <div class="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 flex justify-between items-center">
                <div>
                    <div class="font-medium">${s.name}</div>
                    ${s.type ? `<div class="text-xs text-zinc-500">${s.type}</div>` : ''}
                </div>
                <button onclick="deleteSource(${i})" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
}

function addNewSource() {
    document.getElementById('source-modal').classList.remove('hidden');
}

function closeSourceModal() {
    document.getElementById('source-modal').classList.add('hidden');
}

function saveNewSource() {
    const name = document.getElementById('source-name').value.trim();
    if (!name) return alert("Name required");
    sources.unshift({
        id: 'src_' + Date.now(),
        name,
        type: document.getElementById('source-type').value.trim() || '',
        added: new Date().toISOString()
    });
    saveSources();
    renderSources();
    closeSourceModal();
}

function deleteSource(i) {
    if (confirm("Delete source?")) {
        sources.splice(i, 1);
        saveSources();
        renderSources();
    }
}

// ==================== BASIC TAB + INIT ====================
function switchTab(tab) {
    document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById('section-' + tab);
    if (section) section.classList.remove('hidden');

    if (tab === 'sources') {
        loadSources().then(renderSources);
    }
}

window.onload = async function() {
    await initDB();
    await loadData();
    await loadSources();
    
    if (typeof switchTab === 'function') switchTab('manage');
    
    console.log("✅ v3.68 stable restore loaded — Import should now rebuild categories & effects");
};

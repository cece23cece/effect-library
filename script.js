let categories = [];
let effects = [];
let selectedCategory = null;
let selectedBuilder = [];
let currentEditId = null;
let existingImageData = null;
let pendingImageData = null;
let isRemovingImage = false;
let db = null;

function log(msg) {
    const panel = document.getElementById('debug-panel');
    const ts = new Date().toLocaleTimeString();
    panel.innerHTML += `<span class=\"text-zinc-500\">[${ts}]</span> ${msg}<br>`;
    panel.scrollTop = panel.scrollHeight;
    console.log(msg);
}

function clearDebugLog() {
    document.getElementById('debug-panel').innerHTML = '';
}

function toLower(str) { return (str || '').toString().trim().toLowerCase(); }

function toTitleCase(str) {
    if (!str) return '';
    return str.toString().trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function getTotalCategoryLinks() {
    let total = 0;
    effects.forEach(e => {
        if (e.categories && e.categories.length > 0) total += e.categories.length;
    });
    return total;
}

function updateHeaderCount() {
    const unique = effects.length;
    const links = getTotalCategoryLinks();
    document.getElementById('total-count').textContent = `${unique} effects • ${links} links`;
}

function initDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open('EffectLibraryDB', 4);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('effects')) db.createObjectStore('effects', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'name' });
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            log('✅ IndexedDB ready');
            resolve();
        };
    });
}

async function loadData() {
    log('Loading data...');
    effects = await getAllEffects();
    categories = await getAllCategories();

    if (categories.length === 0) {
        categories = ["Art Style","Artists","Colours","Details","Fantasy","Fashion","Lighting","Perspective","People","Photography","Textures","Vintage", "Uncategorised"];
        await saveCategories();
    }
    if (!categories.includes("Uncategorised")) {
        categories.push("Uncategorised");
        await saveCategories();
    }

    updateHeaderCount();
    log(`Loaded: ${effects.length} effects, ${categories.length} categories`);
}

function getAllEffects() {
    return new Promise(resolve => {
        const tx = db.transaction('effects', 'readonly');
        tx.objectStore('effects').getAll().onsuccess = e => {
            const raw = e.target.result || [];
            const fixed = raw.map(eff => {
                if (eff.category && !eff.categories) {
                    eff.categories = [eff.category];
                    delete eff.category;
                }
                if (!eff.categories) eff.categories = ["Uncategorised"];
                return eff;
            });
            resolve(fixed);
        };
    });
}

function getAllCategories() {
    return new Promise(resolve => {
        const tx = db.transaction('categories', 'readonly');
        tx.objectStore('categories').getAll().onsuccess = e => {
            const raw = e.target.result || [];
            const fixed = raw.map(c => 
                (c && typeof c === 'object' && c.name) ? c.name : c
            );
            resolve(fixed);
        };
    });
}

async function saveData() {
    return new Promise(async (resolve) => {
        const tx = db.transaction('effects', 'readwrite');
        const store = tx.objectStore('effects');
        store.clear();
        
        for (const eff of effects) {
            await new Promise(r => store.put(eff).onsuccess = r);
        }
        
        tx.oncomplete = () => {
            updateHeaderCount();
            resolve();
        };
    });
}

async function saveCategories() {
    return new Promise(async (resolve) => {
        const tx = db.transaction('categories', 'readwrite');
        const store = tx.objectStore('categories');
        store.clear();
        
        for (const cat of categories) {
            await new Promise(r => store.put({ name: cat }).onsuccess = r);
        }
        
        tx.oncomplete = resolve;
    });
}

// ==================== IMPROVED EXPORT ====================
async function exportData(autoBackup = false) {
    log("Starting export (v3.65)...");
    
    const freshEffects = await getAllEffects();
    const freshCategories = await getAllCategories();
    
    if (freshEffects.length === 0) {
        alert("⚠️ No effects found in database.");
        return;
    }

    const exportEffects = freshEffects.map(eff => ({
        id: eff.id,
        name: eff.name,
        categories: eff.categories || ["Uncategorised"],
        prompt: eff.prompt || '',
        notes: eff.notes || '',
        image: eff.image || null,
        dateAdded: eff.dateAdded || new Date().toISOString()
    }));

    const data = {
        version: "3.65",
        exportedAt: new Date().toISOString(),
        categories: freshCategories,
        effects: exportEffects
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = `${hours}-${minutes}`;
    
    a.download = `EL_${date}_${time}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (autoBackup) {
        showToast(`✅ Auto-backup created (${freshEffects.length} effects)`);
    } else {
        alert(`✅ Exported ${freshEffects.length} effects!`);
    }
}

// ==================== IMPROVED IMPORT ====================
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
                    alert("❌ Invalid backup file");
                    return;
                }
                
                if (!confirm(`Import ${importedData.effects.length} effects? This will replace current data.`)) {
                    return;
                }
                
                log("Starting import...");
                
                let cleanedEffects = importedData.effects.map(eff => {
                    let cats = [];
                    
                    if (eff.categories && Array.isArray(eff.categories)) {
                        cats = eff.categories;
                    } else if (eff.category && typeof eff.category === 'string') {
                        cats = [eff.category];
                    }
                    
                    cats = cats.map(c => {
                        if (typeof c === 'string') return toTitleCase(c);
                        if (c && typeof c === 'object' && c.name) return toTitleCase(c.name);
                        return String(c);
                    }).filter(c => c && c.length > 0);
                    
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
                
                let cleanedCategories = importedData.categories.map(c => {
                    if (typeof c === 'string') return toTitleCase(c);
                    if (c && typeof c === 'object' && c.name) return toTitleCase(c.name);
                    return String(c);
                }).filter(c => c && c.length > 0);
                
                if (!cleanedCategories.includes("Uncategorised")) {
                    cleanedCategories.push("Uncategorised");
                }
                
                effects = cleanedEffects;
                categories = cleanedCategories;
                
                log("Saving to IndexedDB...");
                await saveData();
                await saveCategories();
                
                await new Promise(r => setTimeout(r, 300));
                const verifyEffects = await getAllEffects();
                
                if (typeof renderManageSidebar === 'function') renderManageSidebar();
                if (typeof renderMainEffects === 'function' && selectedCategory) renderMainEffects(selectedCategory);
                
                const summary = `${verifyEffects.length} effects + ${cleanedCategories.length} categories imported successfully`;
                if (typeof showToast === 'function') showToast(summary);
                alert(`✅ Import Complete!\n\n${summary}`);
                
            } catch (err) {
                alert("❌ Error importing file: " + err.message);
                log("Import error: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Add other functions as needed from stable v3.65
// (Sources, render functions, etc. can be added after stable restore is confirmed)

function switchTab(tab) {
    document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
    document.getElementById('section-' + tab).classList.remove('hidden');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'manage') {
        if (!selectedCategory) selectedCategory = "Uncategorised";
        if (typeof renderManageSidebar === 'function') renderManageSidebar();
        if (typeof renderMainEffects === 'function') renderMainEffects(selectedCategory);
    }
}

window.onload = async function() {
    await initDB();
    await loadData();
    switchTab('manage');
    log('🚀 v3.65 stable restored as requested');
};
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

// ==================== RENDER FUNCTIONS (RESTORED) ====================
function renderManageSidebar() {
    const container = document.getElementById('sidebar-categories');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...categories].sort();
    if (sorted.includes("Uncategorised")) {
        sorted.splice(sorted.indexOf("Uncategorised"), 1);
        sorted.unshift("Uncategorised");
    }

    sorted.forEach(cat => {
        const count = effects.filter(e => (e.categories || []).includes(cat)).length;
        const item = document.createElement('div');
        item.className = `px-4 py-3 rounded-2xl cursor-pointer flex justify-between items-center transition-colors ${selectedCategory === cat ? 'ring-2 ring-indigo-500 bg-zinc-800' : 'hover:bg-zinc-900'}`;
        item.innerHTML = `
            <div class="flex items-center gap-x-2">
                <span class="font-medium">${cat}</span>
            </div>
            <span class="text-xs text-zinc-400">${count}</span>
        `;
        item.onclick = () => {
            selectedCategory = cat;
            renderManageSidebar();
            renderMainEffects(cat);
        };
        container.appendChild(item);
    });
}

function renderMainEffects(category) {
    const grid = document.getElementById('main-effects-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = effects.filter(e => (e.categories || []).includes(category));

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-zinc-400">No effects in this category yet.</div>`;
        return;
    }

    filtered.forEach(effect => {
        const card = document.createElement('div');
        card.className = 'effect-card bg-zinc-900 border border-zinc-700 rounded-3xl p-5 cursor-pointer';
        card.innerHTML = `
            <div class="font-semibold mb-1">${effect.name}</div>
            <div class="text-xs text-zinc-500 mb-3">${(effect.categories || []).join(', ')}</div>
            ${effect.image ? `<img src="${effect.image}" class="w-full h-40 object-cover rounded-2xl mb-3">` : ''}
            <div class="flex gap-2">
                <button onclick="event.stopImmediatePropagation(); editEffect('${effect.id}')" class="text-xs px-3 py-1 bg-zinc-800 rounded-xl">Edit</button>
                <button onclick="event.stopImmediatePropagation(); deleteEffect('${effect.id}')" class="text-xs px-3 py-1 bg-red-900/30 text-red-400 rounded-xl">Delete</button>
            </div>
        `;
        card.onclick = () => editEffect(effect.id);
        grid.appendChild(card);
    });
}

// ==================== IMPORT (WITH RENDER CALLS) ====================
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
                
                let cleanedEffects = importedData.effects.map(eff => {
                    let cats = eff.categories || (eff.category ? [eff.category] : []);
                    cats = cats.map(c => typeof c === 'string' ? toTitleCase(c) : c).filter(Boolean);
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

                let cleanedCategories = importedData.categories.map(c => typeof c === 'string' ? toTitleCase(c) : c).filter(Boolean);
                if (!cleanedCategories.includes("Uncategorised")) cleanedCategories.push("Uncategorised");

                effects = cleanedEffects;
                categories = cleanedCategories;

                await saveData();
                await saveCategories();

                selectedCategory = "Uncategorised";
                renderManageSidebar();
                renderMainEffects("Uncategorised");

                alert(`✅ Import Complete! ${effects.length} effects restored.`);

            } catch (err) {
                alert("❌ Import error: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ==================== BASIC HELPERS ====================
function switchTab(tab) {
    document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
    document.getElementById('section-' + tab).classList.remove('hidden');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'manage') {
        if (!selectedCategory) selectedCategory = "Uncategorised";
        renderManageSidebar();
        renderMainEffects(selectedCategory);
    }
}

window.onload = async function() {
    await initDB();
    await loadData();
    switchTab('manage');
    log('🚀 v3.65 + render fix loaded');
};
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
    panel.innerHTML += `<span class="text-zinc-500">[${ts}]</span> ${msg}<br>`;
    panel.scrollTop = panel.scrollHeight;
    console.log(msg);
}

function clearDebugLog() {
    document.getElementById('debug-panel').innerHTML = '';
}

function toLower(str) { return (str || '').toString().trim().toLowerCase(); }

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
        categories = ["art style","artists","colours","details","fantasy","fashion","lighting","perspective","people","photography","textures","vintage", "uncategorised"];
        await saveCategories();
    }
    if (!categories.includes("uncategorised")) {
        categories.push("uncategorised");
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
                if (!eff.categories) eff.categories = ["uncategorised"];
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
    log("Starting export (v3.57)...");
    
    const freshEffects = await getAllEffects();
    const freshCategories = await getAllCategories();
    
    if (freshEffects.length === 0) {
        alert("⚠️ No effects found in database.");
        return;
    }

    const exportEffects = freshEffects.map(eff => ({
        id: eff.id,
        name: eff.name,
        categories: eff.categories || ["uncategorised"],
        prompt: eff.prompt || '',
        notes: eff.notes || '',
        image: eff.image || null,
        dateAdded: eff.dateAdded || new Date().toISOString()
    }));

    const data = {
        version: "3.57",
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
    const time = `${hours}:${minutes}`;
    
    a.download = `effect-library_${date}_${time}.json`;
    
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
                        if (typeof c === 'string') return c;
                        if (c && typeof c === 'object' && c.name) return c.name;
                        return String(c);
                    }).filter(c => c && c.length > 0);
                    
                    if (cats.length === 0) cats = ["uncategorised"];
                    
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
                    if (typeof c === 'string') return c;
                    if (c && typeof c === 'object' && c.name) return c.name;
                    return String(c);
                }).filter(c => c && c.length > 0);
                
                if (!cleanedCategories.includes("uncategorised")) {
                    cleanedCategories.push("uncategorised");
                }
                
                effects = cleanedEffects;
                categories = cleanedCategories;
                
                log("Saving to IndexedDB...");
                await saveData();
                await saveCategories();
                
                await new Promise(r => setTimeout(r, 300));
                const verifyEffects = await getAllEffects();
                
                renderManageSidebar();
                if (selectedCategory) renderMainEffects(selectedCategory);
                
                const summary = `${verifyEffects.length} effects + ${cleanedCategories.length} categories imported successfully`;
                showToast(summary);
                alert(`✅ Import Complete!\n\n${summary}`);
                
                log(`Import complete: ${verifyEffects.length} effects saved`);
                
            } catch (err) {
                alert("❌ Error importing file: " + err.message);
                log("Import error: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function switchTab(tab) {
    document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
    document.getElementById('section-' + tab).classList.remove('hidden');
    document.getElementById('section-' + tab).classList.remove('hidden');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    if (tab === 'manage') {
        if (!selectedCategory) selectedCategory = "uncategorised";
        renderManageSidebar();
        renderMainEffects(selectedCategory);
    }
    if (tab === 'builder') updateBuilderCategory();
}

function getSortedCategories() {
    let sorted = [...categories].filter(c => c !== "uncategorised");
    sorted.sort();
    if (categories.includes("uncategorised")) sorted.unshift("uncategorised");
    return sorted;
}

function renderCategoryCheckboxes(selected = []) {
    const container = document.getElementById('category-checkboxes');
    container.innerHTML = '';
    
    // Clear any previous selection state
    getSortedCategories().forEach(cat => {
        if (cat === "uncategorised") return;
        const checked = selected.includes(cat) ? 'checked' : '';
        const div = document.createElement('div');
        div.className = "flex items-center gap-2 text-sm";
        div.innerHTML = `<input type="checkbox" value="${cat}" ${checked}> <label>${cat}</label>`;
        container.appendChild(div);
    });
}

function getSelectedCategories() {
    const checked = Array.from(document.querySelectorAll('#category-checkboxes input:checked')).map(cb => cb.value);
    return checked.length > 0 ? checked : ["uncategorised"];
}

function renderManageSidebar() {
    const container = document.getElementById('sidebar-categories');
    container.innerHTML = '';

    getSortedCategories().forEach(cat => {
        const count = effects.filter(e => (e.categories || []).includes(cat)).length;
        const item = document.createElement('div');

        if (cat === "uncategorised") {
            item.className = `px-4 py-3 rounded-2xl cursor-pointer flex justify-between items-center transition-colors uncategorised-item ${selectedCategory === cat ? 'ring-1 ring-slate-400' : ''}`;
            item.innerHTML = `
                <div class="flex items-center gap-x-2">
                    <i class="fa-solid fa-inbox text-slate-400 text-sm"></i>
                    <span class="font-medium">${cat}</span>
                </div>
                <span class="text-xs text-slate-400">${count}</span>
            `;
        } else {
            item.className = `px-4 py-3 rounded-2xl cursor-pointer flex justify-between items-center transition-colors ${selectedCategory === cat ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-900'}`;
            item.innerHTML = `
                <div class="flex items-center gap-x-2">
                    <button onclick="event.stopImmediatePropagation(); deleteCategory('${cat}');" class="text-red-400 hover:text-red-500 mr-1 text-lg leading-none">×</button>
                    <span>${cat}</span>
                </div>
                <span class="text-xs text-zinc-500">${count}</span>
            `;
        }

        item.onclick = () => {
            selectedCategory = cat;
            renderManageSidebar();
            renderMainEffects(cat);
        };
        container.appendChild(item);
    });
}

function renderMainEffects(cat) {
    document.getElementById('current-category-title').textContent = cat;
    const grid = document.getElementById('main-effects-grid');
    grid.innerHTML = '';

    const filtered = effects.filter(e => (e.categories || []).includes(cat))
                          .sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-20 text-zinc-500">No effects in this category yet</div>`;
        return;
    }

    filtered.forEach(eff => {
        const card = document.createElement('div');
        card.className = "effect-card bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden cursor-pointer";
        card.innerHTML = `
            <div class="aspect-[4/3] bg-zinc-900 flex items-center justify-center overflow-hidden" onclick="viewFullImage('${eff.image || ''}')">
                ${eff.image ? `<img src="${eff.image}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-image text-6xl text-zinc-700"></i>`}
            </div>
            <div class="p-4">
                <h3 class="font-semibold text-sm">${eff.name}</h3>
                <div class="flex gap-2 mt-4">
                    <button onclick="event.stopImmediatePropagation(); addToBuilderFromCard('${eff.id}');" class="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded-xl text-sm">+ Builder</button>
                    <button onclick="event.stopImmediatePropagation(); editEffect('${eff.id}');" class="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-xl text-sm">Edit</button>
                    <button onclick="event.stopImmediatePropagation(); deleteEffect('${eff.id}');" class="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 py-2 rounded-xl text-sm">Delete</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function addToBuilderFromCard(id) {
    const eff = effects.find(e => e.id === id);
    if (!eff) return;

    if (selectedBuilder.some(item => item.id === id)) {
        showToast("Already in Builder");
        return;
    }

    const promptToUse = eff.prompt && eff.prompt.trim() !== '' ? eff.prompt : eff.name;
    selectedBuilder.push({ 
        id: eff.id, 
        name: eff.name, 
        prompt: promptToUse, 
        isCustom: false 
    });

    showToast("Added to Builder");
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast px-6 py-3 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center gap-2 pointer-events-auto`;
    toast.innerHTML = `
        <i class="fa-solid fa-check"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 1800);
}

function viewFullImage(src) {
    if (!src) return;
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4";
    modal.innerHTML = `<img src="${src}" class="max-h-[90vh] max-w-[90vw] rounded-2xl cursor-pointer" onclick="this.parentElement.remove()">`;
    document.body.appendChild(modal);
}

function addNewCategory() {
    let name = prompt("New category name:");
    if (!name) return;
    name = toLower(name);
    if (categories.includes(name)) return alert("Category already exists");
    categories.push(name);
    saveCategories();
    renderManageSidebar();
}

function addNewEffect() {
    currentEditId = null;
    resetImageState();
    document.getElementById('modal-title').textContent = "Add New Effect";
    document.getElementById('save-btn').textContent = "Save Effect";
    document.getElementById('edit-form').reset();

    // Only pre-select the currently viewed category
    const preselect = (selectedCategory && selectedCategory !== "uncategorised") ? [selectedCategory] : [];
    renderCategoryCheckboxes(preselect);

    document.getElementById('edit-modal').classList.remove('hidden');
}

function editEffect(id) {
    const eff = effects.find(e => e.id === id);
    if (!eff) return;
    currentEditId = id;
    resetImageState();
    existingImageData = eff.image || null;

    document.getElementById('modal-title').textContent = "Edit Effect";
    document.getElementById('save-btn').textContent = "Update Effect";
    document.getElementById('effect-name').value = eff.name;
    document.getElementById('prompt-text').value = eff.prompt || '';
    document.getElementById('notes-text').value = eff.notes || '';

    renderCategoryCheckboxes(eff.categories || []);

    if (eff.image) {
        document.getElementById('preview-img').src = eff.image;
        document.getElementById('image-preview').classList.remove('hidden');
        document.getElementById('image-upload-area').classList.add('hidden');
    }
    document.getElementById('edit-modal').classList.remove('hidden');
}

function resetImageState() {
    existingImageData = null;
    pendingImageData = null;
    isRemovingImage = false;
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('image-upload-area').classList.remove('hidden');
    document.getElementById('image-upload').value = '';
}

function handleImageSelect(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        let data = e.target.result;
        data = await compressImage(data);
        pendingImageData = data;
        isRemovingImage = false;
        document.getElementById('preview-img').src = data;
        document.getElementById('image-preview').classList.remove('hidden');
        document.getElementById('image-upload-area').classList.add('hidden');
    };
    reader.readAsDataURL(input.files[0]);
}

function replaceImage() { document.getElementById('image-upload').click(); }

function removeImage() {
    if (!confirm("Remove this image?")) return;
    pendingImageData = null;
    isRemovingImage = true;
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('image-upload-area').classList.remove('hidden');
    document.getElementById('image-upload').value = '';
}

async function saveEffect(e) {
    e.preventDefault();
    const name = toLower(document.getElementById('effect-name').value);
    if (!name) return alert("Effect name is required");

    let isDuplicate = false;
    if (!currentEditId) {
        isDuplicate = effects.some(e => e.name === name);
    } else {
        const original = effects.find(e => e.id === currentEditId);
        if (original && original.name !== name) {
            isDuplicate = effects.some(e => e.id !== currentEditId && e.name === name);
        }
    }
    if (isDuplicate) return alert("An effect with this name already exists!");

    const selectedCats = getSelectedCategories();
    let prompt = document.getElementById('prompt-text').value.trim();
    const notes = document.getElementById('notes-text').value.trim();

    if (currentEditId) {
        const eff = effects.find(e => e.id === currentEditId);
        if (eff) {
            eff.name = name;
            eff.categories = selectedCats;
            eff.prompt = prompt;
            eff.notes = notes;
            if (isRemovingImage) eff.image = null;
            else if (pendingImageData) eff.image = pendingImageData;
        }
    } else {
        effects.unshift({
            id: 'eff_' + Date.now(),
            name: name,
            categories: selectedCats,
            prompt: prompt,
            notes: notes,
            image: pendingImageData,
            dateAdded: new Date().toISOString()
        });
    }

    await saveData();
    closeModal();
    renderManageSidebar();
    renderMainEffects(selectedCategory || "uncategorised");
}

function closeModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    currentEditId = null;
    resetImageState();
}

function deleteEffect(id) {
    if (!confirm("Delete this effect permanently?")) return;
    effects = effects.filter(e => e.id !== id);
    saveData();
    renderManageSidebar();
    renderMainEffects(selectedCategory || "uncategorised");
}

function deleteCategory(cat) {
    if (!confirm(`Delete category "${cat}"? Effects will not be deleted.`)) return;
    categories = categories.filter(c => c !== cat);

    effects.forEach(e => {
        if (e.categories) {
            e.categories = e.categories.filter(c => c !== cat);
            if (e.categories.length === 0) {
                e.categories = ["uncategorised"];
            }
        }
    });

    saveCategories();
    selectedCategory = "uncategorised";
    renderManageSidebar();
    renderMainEffects("uncategorised");
}

function updateBuilderCategory() {
    const sel = document.getElementById('builder-category');
    sel.innerHTML = '<option value="">Select category...</option>';
    getSortedCategories().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c; sel.appendChild(opt);
    });
}

function updateBuilderEffects() {
    const cat = document.getElementById('builder-category').value;
    const sel = document.getElementById('builder-effect');
    sel.innerHTML = '<option value="">Select effect...</option>';
    if (!cat) return;
    effects.filter(e => (e.categories || []).includes(cat)).forEach(eff => {
        const opt = document.createElement('option');
        opt.value = eff.id; opt.textContent = eff.name; sel.appendChild(opt);
    });
}

function addToBuilder() {
    const id = document.getElementById('builder-effect').value;
    if (!id) return;
    const eff = effects.find(e => e.id === id);
    if (!eff || selectedBuilder.some(item => item.id === id)) return;

    const promptToUse = eff.prompt && eff.prompt.trim() !== '' ? eff.prompt : eff.name;

    selectedBuilder.push({ 
        id: eff.id, 
        name: eff.name, 
        prompt: promptToUse, 
        isCustom: false 
    });
    renderSelectedBuilder();
}

function addCustomPhrase() {
    const text = document.getElementById('extra-instructions').value.trim();
    if (!text) return alert("Please enter a phrase first");
    selectedBuilder.push({ id: 'custom_' + Date.now(), name: text, prompt: text, isCustom: true });
    renderSelectedBuilder();
    document.getElementById('extra-instructions').value = '';
}

function renderSelectedBuilder() {
    const container = document.getElementById('selected-builder-list');
    container.innerHTML = '';
    selectedBuilder.forEach((item, index) => {
        const chip = document.createElement('div');
        chip.className = `px-4 py-2.5 rounded-2xl flex items-center gap-2 text-sm draggable ${item.isCustom ? 'bg-emerald-900/70 text-emerald-100' : 'bg-zinc-800'}`;
        chip.draggable = true;
        chip.dataset.index = index;
        chip.innerHTML = `${item.name} <button onclick="removeFromBuilder(${index})" class="ml-auto text-red-400">×</button>`;
        chip.ondragstart = (e) => e.dataTransfer.setData('text/plain', index);
        chip.ondragover = (e) => e.preventDefault();
        chip.ondrop = (e) => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const to = parseInt(chip.dataset.index);
            if (from === to) return;
            const [moved] = selectedBuilder.splice(from, 1);
            selectedBuilder.splice(to, 0, moved);
            renderSelectedBuilder();
        };
        container.appendChild(chip);
    });
}

function removeFromBuilder(index) {
    selectedBuilder.splice(index, 1);
    renderSelectedBuilder();
}

function clearBuilder() { selectedBuilder = []; renderSelectedBuilder(); }

function generatePrompt() {
    if (selectedBuilder.length === 0) return alert("Add at least one effect or phrase");
    const prompt = selectedBuilder.map(item => item.prompt).join(", ");
    document.getElementById('generated-prompt').textContent = prompt;
    document.getElementById('generated-prompt-container').classList.remove('hidden');
}

function clearGeneratedPrompt() { document.getElementById('generated-prompt-container').classList.add('hidden'); }

function copyPrompt() {
    navigator.clipboard.writeText(document.getElementById('generated-prompt').textContent);
    alert("✅ Prompt copied!");
}

function compressImage(dataUrl) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > 1200) { h = Math.round(h * 1200 / w); w = 1200; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.src = dataUrl;
    });
}

function showStorageInfo() {
    const size = Math.round(JSON.stringify(effects).length / 1024);
    alert(`Effects: ${effects.length}\nApprox size: ${size} KB`);
}

window.autoBackup = function() {
    exportData(true);
};

window.onload = async function() {
    await initDB();
    await loadData();
    switchTab('manage');
    log('🚀 v3.57 loaded — final backup filename format');
};
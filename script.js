let selectedBuilder = [];

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
    renderSelectedBuilder();
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
        chip.className = `px-3 py-1 rounded-full flex items-center gap-1.5 text-xs draggable cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] ${item.isCustom ? 'bg-emerald-900/70 text-emerald-100' : 'bg-zinc-800 hover:bg-zinc-700'}`;
        chip.draggable = true;
        chip.dataset.index = index;
        chip.title = item.prompt;  // Hover preview of full prompt
        chip.innerHTML = `
            <span class="font-medium">${item.name}</span>
            <button onclick="removeFromBuilder(${index}); event.stopImmediatePropagation();" class="ml-1 text-red-400 hover:text-red-500 text-[10px] leading-none">×</button>
        `;
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
    alert("Prompt copied!");
}
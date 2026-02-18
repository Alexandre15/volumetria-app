// ------------------------- Carregamento de dados -------------------------
async function loadAll() {
  const data = await api('get_all');
  DB.packages = data.packages || [];
  DB.vehicles  = data.vehicles || [];
}

// ------------------------- Renderização de UI ---------------------------
function renderVehicleSelect() {
  const sel = document.getElementById('vehicleSelect'); 
  if (!sel) return;
  sel.innerHTML = '';
  DB.vehicles.forEach(v => {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = `${v.nome} (${v.interno.largura}×${v.interno.altura}×${v.interno.comprimento} m)`;
    sel.appendChild(o);
  });
}

function renderLoadPackageSelect() {
  const sel = document.getElementById('loadPkgSelect'); 
  if (!sel) return;
  sel.innerHTML = '';
  DB.packages.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nome;
    sel.appendChild(opt);
  });
}

function renderLoadList() {
  const list = document.getElementById('loadList'); 
  if (!list) return;
  list.innerHTML = '';
  DB.load.forEach((item, idx) => {
    const p = DB.packages.find(x => x.id === item.packageId);
    const row = document.createElement('div'); 
    row.className = 'row';

    const w = item.unitWeight ?? p?.peso_unitario ?? 0;
    const emp = (item.empilhavel === 'inherit') ? (p?.empilhavel ? 'sim' : 'não') : (item.empilhavel ? 'sim' : 'não');
    const rot = (item.rotacionar === 'inherit') ? (p?.rotacionar ? 'sim' : 'não') : (item.rotacionar ? 'sim' : 'não');
    const must = item.mustStackSelf ? ' • empilhar sobre o mesmo tipo: sim' : '';

    row.innerHTML = `<div><strong>${p?.nome || 'Embalagem'}</strong> — ${item.quantidade} un • ${w} kg/un • empilhável: ${emp} • rotação: ${rot}${must}</div>`;

    const actions = document.createElement('div');

    const minus = document.createElement('button'); 
    minus.textContent = '-1'; 
    minus.className='ghost'; 
    minus.onclick = ()=>{
      item.quantidade = Math.max(0, (item.quantidade||1)-1); 
      if (item.quantidade===0){ DB.load.splice(idx,1); }
      renderLoadList(); 
      recalc();
    };

    const plus = document.createElement('button'); 
    plus.textContent = '+1'; 
    plus.className='ghost'; 
    plus.onclick = ()=>{
      item.quantidade = (item.quantidade||1)+1; 
      renderLoadList(); 
      recalc();
    };

    const del = document.createElement('button'); 
    del.textContent = 'Remover'; 
    del.className='danger'; 
    del.onclick=()=>{
      DB.load.splice(idx,1); 
      renderLoadList(); 
      recalc();
    };

    actions.append(minus, plus, del);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

// ------------------------- Expansão dos itens em caixas ------------------
function expandLoadToBoxes() {
  const boxes = [];
  for (const item of DB.load) {
    const pkg = DB.packages.find(p=>p.id===item.packageId); 
    if (!pkg) continue;

    const qty       = Math.max(1, parseInt(item.quantidade||1,10));
    const weight    = (item.unitWeight ?? pkg.peso_unitario) || 0;
    const empilhavel= item.empilhavel==='inherit' ? !!pkg.empilhavel : !!item.empilhavel;
    const rotacionar= item.rotacionar==='inherit' ? !!pkg.rotacionar : !!item.rotacionar;

    // Flag de empilhamento obrigatório no mesmo tipo
    const mustSelf  = !!item.mustStackSelf;

    for (let i=0;i<qty;i++) {
      boxes.push({
        id: uid(),
        typeKey: pkg.id,                  // chave para cor fixa por tipo
        w: pkg.largura,
        h: pkg.altura,
        d: pkg.comprimento,
        weight,
        stackable: empilhavel,
        rotatable: rotacionar,

        // Regras de empilhamento (consumidas pelo pack por camadas)
        mustStack: mustSelf,              // empilhar obrigatoriamente em camadas > 0
        selfStackOnly: mustSelf           // somente sobre o mesmo tipo (sem misturar)
      });
    }
  }
  return boxes;
}

// ------------------------- Estatísticas ---------------------------------
function updateStats(usedVol, totalVol, totalWeight, comL) {
  const pct = totalVol>0 ? (usedVol/totalVol*100) : 0;
  const elOcc = document.getElementById('statOcc');
  const elVol = document.getElementById('statVol');
  const elVolTot = document.getElementById('statVolTot');
  const elWeight = document.getElementById('statWeight');
  const elCOM = document.getElementById('statCOM');

  if (elOcc)    elOcc.textContent = pct.toFixed(1) + '%';
  if (elVol)    elVol.textContent = usedVol.toFixed(2) + ' m³';
  if (elVolTot) elVolTot.textContent = totalVol.toFixed(2) + ' m³';
  if (elWeight) elWeight.textContent = totalWeight.toFixed(1) + ' kg';
  if (elCOM)    elCOM.textContent = comL.toFixed(2) + ' m';
}
// expõe para o Viz (modo manual) poder atualizar as stats ao mover
window.updateStats = updateStats;

// ------------------------- Modo Manual (estado) --------------------------
const MANUAL = {
  enabled: false,
  placements: null,   // arranjo "congelado" para edição no 3D
};

// ------------------------- Recalcular/Desenhar ---------------------------
function recalc() {
  const vId = document.getElementById('vehicleSelect')?.value;
  const vehicle = DB.vehicles.find(v=>v.id===vId);
  if (!vehicle) { 
    console.warn('[recalc] Nenhum veículo selecionado.'); 
    return; 
  }

  const container = { 
    W: vehicle.interno.largura, 
    H: vehicle.interno.altura, 
    D: vehicle.interno.comprimento 
  };

  // ------ MODO MANUAL: não recalcula com pack, apenas redesenha o que você editou ------
  if (MANUAL.enabled && MANUAL.placements) {
    if (Viz.ensure()) {
      Viz.clear(container);
      Viz.drawManual(MANUAL.placements, container); // desenha com TransformControls
      const stats = Viz.computeStatsFromScene(container);
      updateStats(stats.usedVol, stats.totalVol, stats.totalWeight, stats.comL);
    }
    // Desabilita adicionar e +1 no modo manual
    const btnAdd = document.getElementById('btnAddLoad');
    if (btnAdd) btnAdd.disabled = true;
    document.querySelectorAll('#loadList .row button').forEach(b=>{
      if (b.textContent === '+1') b.disabled = true;
    });
    return;
  }

  // ------ MODO AUTOMÁTICO: empacota e desenha -------
  const boxes = expandLoadToBoxes();
  const { placements, usedVol, totalVol, totalWeight, comL } = pack(container, boxes);

  updateStats(usedVol, totalVol, totalWeight, comL);
  if (Viz.ensure()) { Viz.clear(container); Viz.draw(placements); }

  // ------ Detecção de lotação: se não coube tudo ou 100% do volume ------
  const allPlaced  = placements.length === boxes.length;
  const almostFull = usedVol >= (totalVol - 1e-6);
  const truckFull  = !allPlaced || almostFull;

  const btnAdd = document.getElementById('btnAddLoad');
  if (btnAdd) btnAdd.disabled = truckFull;

  document.querySelectorAll('#loadList .row button').forEach(b=>{
    if (b.textContent === '+1') b.disabled = truckFull;
  });

  if (truckFull) {
    Toast.show('Caminhão lotado — não é possível adicionar mais caixas.', 'error', 2500);
  }
}

// ------------------------- Eventos / UI ---------------------------------
function bindEvents() {
  const selVehicle  = document.getElementById('vehicleSelect');
  const btnAdd      = document.getElementById('btnAddLoad');
  const btnClear    = document.getElementById('btnClear');
  const btnSaveLoad = document.getElementById('btnSaveLoad');
  const btnSnapshot = document.getElementById('btnSnapshot');

  const btnFixLayout= document.getElementById('btnFixLayout');
  const chkManual   = document.getElementById('chkManual');
  const selGizmo    = document.getElementById('selGizmo');
  const snapCm      = document.getElementById('snapCm');
  const btnResetSel = document.getElementById('btnResetSel');

  if (selVehicle) {
    selVehicle.addEventListener('change', ()=>{
      recalc(); 
      Toast.show('Veículo alterado', 'info');
    });
  }

  if (btnAdd) {
    btnAdd.addEventListener('click', ()=>{
      const pkgId = document.getElementById('loadPkgSelect')?.value;
      const quantidade = Math.max(1, parseInt(document.getElementById('loadQty')?.value||'1',10));
      const empStr = document.getElementById('loadStackable')?.value;
      const rotStr = document.getElementById('loadRot')?.value;
      const unitWStr = (document.getElementById('loadUnitWeight')?.value || '').trim();
      const unitWeight = unitWStr ? parseFloat(unitWStr) : undefined;
      const mustSelf = (document.getElementById('loadMustSelf')?.value === 'true');

      DB.load.push({
        packageId: pkgId,
        quantidade,
        empilhavel: empStr==='true'?true:empStr==='false'?false:'inherit',
        rotacionar: rotStr==='true'?true:rotStr==='false'?false:'inherit',
        unitWeight,
        mustStackSelf: mustSelf
      });

      renderLoadList();
      recalc();
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', ()=>{
      DB.load = [];
      renderLoadList();
      recalc();
    });
  }

  if (btnSaveLoad) {
    btnSaveLoad.addEventListener('click', async ()=>{
      const name = prompt('Nome para esta carga (opcional):','Carga '+new Date().toLocaleString());
      const vId = document.getElementById('vehicleSelect')?.value;
      const payload = { name: name||('Carga '+Date.now()), vehicleId: vId, items: DB.load };
      await api('save_load', payload);
      Toast.show('Carga salva em data/loads.json', 'success');
    });
  }

  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', ()=>{
      const dataURL = Viz.snapshotPNG(); 
      if (!dataURL){ Toast.show('Não foi possível capturar imagem', 'error'); return; }
      const a = document.createElement('a'); a.href = dataURL; a.download = 'volumetria.png'; a.click();
    });
  }

  // ---------- MODO MANUAL ----------
  if (btnFixLayout) {
    btnFixLayout.addEventListener('click', ()=>{
      const vId = document.getElementById('vehicleSelect')?.value;
      const vehicle = DB.vehicles.find(v=>v.id===vId);
      if (!vehicle) { Toast.show('Selecione um veículo.', 'error'); return; }

      const boxes = expandLoadToBoxes();
      const container = { W: vehicle.interno.largura, H: vehicle.interno.altura, D: vehicle.interno.comprimento };
      const { placements } = pack(container, boxes);

      MANUAL.placements = placements.map(p => ({ ...p })); // congela arranjo
      MANUAL.enabled = true;

      if (Viz.ensure()) {
        Viz.clear(container);
        Viz.drawManual(MANUAL.placements, container);

        // Aplica gizmo/snap conforme UI
        const mode = document.getElementById('selGizmo')?.value || 'translate';
        const cm   = parseFloat(document.getElementById('snapCm')?.value || '1');
        Viz.setGizmoMode(mode);
        Viz.setSnap(cm > 0 ? cm/100 : 0);
      }

      // Marcar checkbox manual (se existir)
      if (chkManual) chkManual.checked = true;

      // Desabilita adições no modo manual
      const btnAdd2 = document.getElementById('btnAddLoad');
      if (btnAdd2) btnAdd2.disabled = true;
      document.querySelectorAll('#loadList .row button').forEach(b=>{
        if (b.textContent === '+1') b.disabled = true;
      });
    });
  }

  if (chkManual) {
    chkManual.addEventListener('change', (e)=>{
      MANUAL.enabled = !!e.target.checked;
      if (!MANUAL.enabled) {
        MANUAL.placements = null; // solta o layout manual e volta para auto
      }
      recalc();
    });
  }

  if (selGizmo) {
    selGizmo.addEventListener('change', (e)=>{
      Viz.setGizmoMode(e.target.value);
    });
  }

  if (snapCm) {
    snapCm.addEventListener('change', (e)=>{
      const cm = parseFloat(e.target.value || '1');
      Viz.setSnap(cm > 0 ? cm/100 : 0);
    });
  }

  if (btnResetSel) {
    btnResetSel.addEventListener('click', ()=>{
      Viz.unselect();
    });
  }
}

// ------------------------- Utilidades -----------------------------------
function uid() { 
  return 'id_' + Math.random().toString(36).slice(2, 10); 
}

// ------------------------- Boot -----------------------------------------
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadAll();
  renderVehicleSelect();
  renderLoadPackageSelect();
  renderLoadList();
  Viz.ensure();
  recalc();
  bindEvents();
});
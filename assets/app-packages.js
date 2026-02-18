async function loadAll() {
  const data = await api('get_all');
  DB.packages = data.packages || [];
  DB.vehicles = data.vehicles || [];
}

function renderPackages() {
  const list = document.getElementById('pkgList'); list.innerHTML = '';
  DB.packages.forEach(p => {
    const row = document.createElement('div'); row.className = 'row';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${p.nome}</strong><div class="muted">${p.largura}×${p.altura}×${p.comprimento} m • ${p.peso_unitario} kg • empilhável: ${p.empilhavel?'sim':'não'} • rotação: ${p.rotacionar?'sim':'não'}</div>`;
    const del = document.createElement('button'); del.className='danger'; del.textContent='Excluir'; del.onclick=async()=>{ await api('delete_package',{id:p.id}); await loadAll(); renderPackages(); };
    row.append(info, del); list.appendChild(row);
  });
}

function renderVehicles() {
  const list = document.getElementById('vehList'); list.innerHTML = '';
  DB.vehicles.forEach(v => {
    const row = document.createElement('div'); row.className='row';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${v.nome}</strong><div class=muted>${v.interno.largura}×${v.interno.altura}×${v.interno.comprimento} m • ${v.peso_max_t} t</div>`;
    const del = document.createElement('button'); del.className='danger'; del.textContent='Excluir'; del.onclick=async()=>{ await api('delete_vehicle',{id:v.id}); await loadAll(); renderVehicles(); };
    row.append(info, del); list.appendChild(row);
  });
}

async function onAddPackage() {
  const nome = document.getElementById('pkgName').value.trim();
  const peso = parseFloat(document.getElementById('pkgWeight').value);
  const largura = parseFloat(document.getElementById('pkgW').value);
  const altura = parseFloat(document.getElementById('pkgH').value);
  const comprimento = parseFloat(document.getElementById('pkgD').value);
  const empilhavel = document.getElementById('pkgStackable').value === 'true';
  const rotacionar = document.getElementById('pkgRot').value === 'true';
  if (!nome || !largura || !altura || !comprimento || !peso) { Toast.show('Preencha todos os campos da embalagem','error'); return; }
  await api('add_package', { nome, peso_unitario: peso, largura, altura, comprimento, empilhavel, rotacionar });
  document.getElementById('pkgName').value=''; document.getElementById('pkgWeight').value=''; document.getElementById('pkgW').value=''; document.getElementById('pkgH').value=''; document.getElementById('pkgD').value='';
  await loadAll(); renderPackages(); Toast.show('Embalagem salva','success');
}

async function onAddVehicle() {
  const nome = document.getElementById('vehName').value.trim();
  const largura = parseFloat(document.getElementById('vehW').value);
  const altura = parseFloat(document.getElementById('vehH').value);
  const comprimento = parseFloat(document.getElementById('vehD').value);
  const peso_max_t = parseFloat(document.getElementById('vehT').value||'0');
  if (!nome || !largura || !altura || !comprimento) { Toast.show('Preencha todos os campos do veículo','error'); return; }
  await api('add_vehicle', { nome, largura, altura, comprimento, peso_max_t });
  document.getElementById('vehName').value=''; document.getElementById('vehW').value=''; document.getElementById('vehH').value=''; document.getElementById('vehD').value=''; document.getElementById('vehT').value='';
  await loadAll(); renderVehicles(); Toast.show('Veículo adicionado','success');
}

window.addEventListener('DOMContentLoaded', async ()=>{
  await loadAll();
  renderPackages();
  renderVehicles();
  document.getElementById('btnAddPkg').addEventListener('click', onAddPackage);
  document.getElementById('btnAddVehicle').addEventListener('click', onAddVehicle);
  document.getElementById('btnReset').addEventListener('click', ()=>{
    ['pkgName','pkgWeight','pkgW','pkgH','pkgD'].forEach(id=>document.getElementById(id).value='');
  });
});
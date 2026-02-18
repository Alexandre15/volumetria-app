if (!window.THREE) {
  console.warn('[app-common] window.THREE ainda não está definido. Verifique a ordem dos scripts no index.html.');
}
// ====================== UI: Toast ======================
const Toast = {
  el: null,
  show(msg, type='info', ms=2500) {
    if (!this.el) this.el = document.getElementById('toast');
    if (!this.el) return alert(msg);
    this.el.textContent = msg;
    this.el.className = `toast ${type}`;
    this.el.classList.add('show');
    setTimeout(()=> this.el.classList.remove('show'), ms);
  }
};

// ====================== API helper (PHP) ======================
async function api(action, payload) {
  try {
    const url = `api/api.php?action=${encodeURIComponent(action)}`;
    const opts = payload ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    } : undefined;

    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      console.error('API error', res.status, text);
      Toast.show(`Falha na API (${res.status}). Veja Console.`, 'error');
      throw new Error(`API ${action} falhou: ${res.status} ${text}`);
    }

    try { return JSON.parse(text); }
    catch (e) {
      console.error('JSON parse error', text);
      Toast.show('Resposta da API inválida. Veja Console.', 'error');
      throw e;
    }
  } catch (err) {
    console.error('API exception', err);
    Toast.show('Não foi possível comunicar com a API. Verifique servidor PHP.', 'error');
    throw err;
  }
}

// ====================== Estado global ======================
const DB = { packages: [], vehicles: [], load: [] };

// ====================== Utilidades numéricas ======================
const EPS = 1e-9;
const Q   = 0.01; // 1 cm
const q   = (x) => Math.max(0, Math.round(x / Q) * Q);

// ====================== Orientações 2D (no piso) ======================
function orientationsOf(box, allowRotation) {
  if (!allowRotation) return [{ w: box.w, d: box.d }];
  return [
    { w: box.w, d: box.d },
    { w: box.d, d: box.w }
  ];
}

// ====================== MaxRects 2D (piso) ======================
function MR_initFreeRects(W, D, obstacles, qfn, eps) {
  let freeRects = [{ x: 0, y: 0, w: qfn(W), d: qfn(D) }];
  for (const ob of (obstacles || [])) {
    const r = { x: qfn(ob.x), y: qfn(ob.y), w: qfn(ob.w), d: qfn(ob.d) };
    freeRects = MR_splitFreeRects(freeRects, r, qfn, eps);
    freeRects = MR_pruneFreeRects(freeRects, qfn, eps);
  }
  return freeRects;
}

function MR_findPosition(freeRects, rw, rd, qfn, eps) {
  let best = null;
  for (const fr of freeRects) {
    if (rw <= fr.w + eps && rd <= fr.d + eps) {
      const areaFit  = (fr.w * fr.d) - (rw * rd);
      const shortFit = Math.min(fr.w - rw, fr.d - rd);
      if (!best || areaFit < best.areaFit || (Math.abs(areaFit - best.areaFit) < eps && shortFit < best.shortFit)) {
        best = { x: fr.x, y: fr.y, areaFit, shortFit };
      }
    }
  }
  return best;
}

function MR_splitFreeRects(freeRects, placed, qfn, eps) {
  const out = [];
  for (const fr of freeRects) {
    if (!MR_intersects(fr, placed, eps)) { out.push(fr); continue; }

    const leftCut   = { x: fr.x,                    y: fr.y,                    w: qfn(Math.max(0, placed.x - fr.x)),                         d: fr.d };
    const rightCut  = { x: qfn(placed.x + placed.w),y: fr.y,                    w: qfn(Math.max(0, (fr.x + fr.w) - (placed.x + placed.w))),   d: fr.d };
    const topCut    = { x: fr.x,                    y: fr.y,                    w: fr.w,                                                    d: qfn(Math.max(0, placed.y - fr.y)) };
    const bottomCut = { x: fr.x,                    y: qfn(placed.y + placed.d),w: fr.w,                                                    d: qfn(Math.max(0, (fr.y + fr.d) - (placed.y + placed.d))) };

    [leftCut, rightCut, topCut, bottomCut].forEach(rc => {
      if (rc.w > eps && rc.d > eps) {
        const rx2 = qfn(rc.x + rc.w), ry2 = qfn(rc.y + rc.d);
        const fx2 = qfn(fr.x + fr.w), fy2 = qfn(fr.y + fr.d);
        const nx  = qfn(Math.max(fr.x, rc.x));
        const ny  = qfn(Math.max(fr.y, rc.y));
        const nx2 = qfn(Math.min(fx2, rx2));
        const ny2 = qfn(Math.min(fy2, ry2));
        const nw  = qfn(nx2 - nx), nd = qfn(ny2 - ny);
        if (nw > eps && nd > eps) out.push({ x: nx, y: ny, w: nw, d: nd });
      }
    });
  }
  return out;
}

function MR_pruneFreeRects(rects, qfn, eps) {
  rects.forEach(r => { r.x=qfn(r.x); r.y=qfn(r.y); r.w=qfn(r.w); r.d=qfn(r.d); });
  for (let i=0; i<rects.length; i++) {
    const a = rects[i];
    for (let j=rects.length-1; j>i; j--) {
      const b = rects[j];
      if (MR_contains(a,b,eps)) { rects.splice(j,1); continue; }
      if (MR_contains(b,a,eps)) { rects.splice(i,1); i--; break; }
    }
  }
  return rects;
}

function MR_intersects(a, b, eps) {
  return !(a.x + a.w <= b.x + eps ||
           b.x + b.w <= a.x + eps ||
           a.y + a.d <= b.y + eps ||
           b.y + b.d <= a.y + eps);
}

function MR_contains(a, b, eps) {
  return (b.x >= a.x - eps &&
          b.y >= a.y - eps &&
          b.x + b.w <= a.x + a.w + eps &&
          b.y + b.d <= a.y + a.d + eps);
}

function MR_intersectionsOfLists(listA, listB, qfn, eps) {
  const out = [];
  for (const a of listA) {
    for (const b of listB) {
      const ix = Math.max(a.x, b.x);
      const iy = Math.max(a.y, b.y);
      const ix2 = Math.min(a.x+a.w, b.x+b.w);
      const iy2 = Math.min(a.y+a.d, b.y+b.d);
      const iw = qfn(ix2 - ix), id = qfn(iy2 - iy);
      if (iw > eps && id > eps) out.push({ x: qfn(ix), y: qfn(iy), w: iw, d: id });
    }
  }
  return out;
}

function placeOneBox2D(box, allowedRects, freeRects, qfn, eps) {
  const candidates = orientationsOf(box, box.rotatable);
  let best = null, bestOri = null;

  for (const cand of candidates) {
    for (const fr of allowedRects) {
      if (cand.w <= fr.w + eps && cand.d <= fr.d + eps) {
        const areaFit  = (fr.w*fr.d) - (cand.w*cand.d);
        const shortFit = Math.min(fr.w - cand.w, fr.d - cand.d);
        const score = { areaFit, shortFit };
        if (!best ||
            score.areaFit < best.areaFit ||
            (Math.abs(score.areaFit - best.areaFit) < eps && score.shortFit < best.shortFit)) {
          best = score;
          bestOri = { px: fr.x, py: fr.y, pw: qfn(cand.w), pd: qfn(cand.d) };
        }
      }
    }
  }
  return bestOri;
}

// ---------- Colisão 3D (AABB) ----------
// AABB overlap com tolerância para flutuantes
function aabbOverlap(a, b, eps = 1e-6) {
  return !(
    a.x + a.w <= b.x + eps ||  // a à esquerda de b
    b.x + b.w <= a.x + eps ||  // b à esquerda de a
    a.y + a.d <= b.y + eps ||  // a "atrás" de b (no comprimento)
    b.y + b.d <= a.y + eps ||  // b "atrás" de a
    a.z + a.h <= b.z + eps ||  // a abaixo de b
    b.z + b.h <= a.z + eps     // b abaixo de a
  );
}

// Checa se um candidato {px,py,pw,pd,pz,ph} colide com algum placement existente
function canPlace(px, py, pw, pd, pz, ph, placements, eps = 1e-6) {
  const cand = { x: px, y: py, z: pz, w: pw, d: pd, h: ph };
  for (const p of placements) {
    if (aabbOverlap(cand, p, eps)) return false;
  }
  return true;
}

// ----- Limite máximo de empilhamento (em número de caixas por coluna) -----
const MAX_STACK_COUNT = 2;

// Conta quantas caixas já existem abaixo (ou no mesmo z) que se sobrepõem ao footprint (X×Y)
function stackCountAtFootprint(placements, px, py, pw, pd, eps = 1e-6) {
  // Considera qualquer caixa com interseção 2D (X×Y). O Z é verificado separadamente no canPlace, mas aqui
  // a ideia é contar a "coluna" que ocupa a mesma projeção.
  let count = 0;
  for (const p of placements) {
    const overlapX = !(p.x + p.w <= px + eps || px + pw <= p.x + eps);
    const overlapY = !(p.y + p.d <= py + eps || py + pd <= p.y + eps);
    if (overlapX && overlapY) count++;
  }
  return count;
}

// Variante mais estrita (opcional): conta apenas as caixas COM z < zNovo (abaixo do novo elemento).
// Se preferir esse comportamento, use esta função no lugar de stackCountAtFootprint:
function stackCountBelowAtFootprint(placements, px, py, pw, pd, zNew, eps = 1e-6) {
  let count = 0;
  for (const p of placements) {
    const overlapX = !(p.x + p.w <= px + eps || px + pw <= p.x + eps);
    const overlapY = !(p.y + p.d <= py + eps || py + pd <= p.y + eps);
    if (overlapX && overlapY && p.z + p.h <= zNew + eps) count++;
  }
  return count;
}


// ====================== Empacotador por Camadas (com regras de empilhamento) ======================
function pack(container, items) {
  const W = q(container.W), H = q(container.H), D = q(container.D);

  const pending = items.map(b => ({
    id: b.id,
    typeKey: b.typeKey || null,
    w: q(b.w),
    h: q(b.h),
    d: q(b.d),
    weight: +b.weight || 0,
    stackable: !!b.stackable,
    rotatable: !!b.rotatable,
    mustStack: !!b.mustStack,
    selfStackOnly: !!b.selfStackOnly
  })).filter(b => b.w>EPS && b.h>EPS && b.d>EPS);

  if (!pending.length) {
    return { placements: [], usedVol: 0, totalVol: W*H*D, totalWeight: 0, comL: 0 };
  }

  pending.sort((a,b) => (b.h - a.h) || ((b.w*b.d) - (a.w*a.d)));

  const placements = [];
  let totalWeight = 0;

  const floorObstacles = [];
  let lastSupportByType = {};
  let baseZ = 0;

  function takeNextUnitSameType(typeKey, requireMust) {
    const idx = pending.findIndex(u => u.typeKey===typeKey && (!requireMust || u.mustStack));
    if (idx >= 0) {
      const u = pending[idx];
      pending.splice(idx, 1);
      return u;
    }
    return null;
  }

  while (pending.length > 0) {
    const remH = q(H - baseZ);
    if (remH <= EPS) break;

    const anchorIdx = pending.findIndex(b => b.h <= remH + EPS);
    if (anchorIdx === -1) break;

    const layerHeight = pending[anchorIdx].h;
    let freeRects = MR_initFreeRects(W, D, floorObstacles, q, EPS);

    const layerPool = pending.filter(b => b.h <= remH + EPS);
    const placedThisLayer = new Set();

    // 1) mustStack primeiro
    const mustStackList = layerPool.filter(b => b.mustStack).sort((a,b) => (b.w*b.d - a.w*a.d));
    for (const box of mustStackList) {
      if (placedThisLayer.has(box.id)) continue;
      const idxNow = pending.findIndex(u => u.id === box.id);
      if (idxNow === -1) continue;

      const baseH = q(box.h);
      if (baseZ + baseH > H + EPS) continue;

      let allowed = freeRects;
      if (baseZ > 0) {
        const support = lastSupportByType[box.typeKey] || [];
        allowed = MR_intersectionsOfLists(freeRects, support, q, EPS);
        if (allowed.length === 0) continue;
      }

      const placedBase = placeOneBox2D(box, allowed, freeRects, q, EPS);
      if (!placedBase) continue;

      const { px, py, pw, pd } = placedBase;

      if (q(baseZ) + baseH > H + EPS) continue;
      if (!canPlace(px, py, pw, pd, q(baseZ), baseH, placements, 1e-6)) continue;

      // ---- limite de pilha na BASE ----
      const stackCountBase = stackCountAtFootprint(placements, px, py, pw, pd);
      if (stackCountBase >= MAX_STACK_COUNT) continue;

      // insere base
      placements.push({
        id: box.id,
        typeKey: box.typeKey || null,
        x: px, y: py, z: q(baseZ),
        w: pw, h: baseH, d: pd,
        weight: box.weight,
        stackable: box.stackable
      });
      totalWeight += box.weight;
      placedThisLayer.add(box.id);

      pending.splice(idxNow, 1);

      const rect = { x: px, y: py, w: pw, d: pd };
      freeRects = MR_splitFreeRects(freeRects, rect, q, EPS);
      freeRects = MR_pruneFreeRects(freeRects, q, EPS);

      // Empilhamento imediato (somente se empilhável)
      if (!box.stackable) {
        console.warn('[pack] Item mustStack, mas não-empilhável. Não empilha:', box.typeKey);
      } else {
        let zTop = q(baseZ + baseH);
        while (true) {
          const next = takeNextUnitSameType(box.typeKey, /*requireMust=*/true);
          if (!next) break;

          const nh = q(next.h);
          if (zTop + nh > H + EPS) {
            pending.push(next);
            pending.sort((a,b) => (b.h - a.h) || ((b.w*b.d) - (a.w*a.d)));
            break;
          }

          if (!canPlace(px, py, pw, pd, zTop, nh, placements, 1e-6)) {
            pending.push(next);
            pending.sort((a,b) => (b.h - a.h) || ((b.w*b.d) - (a.w*a.d)));
            break;
          }

          // ---- limite de pilha ao empilhar ----
          const stackCountHere = stackCountAtFootprint(placements, px, py, pw, pd);
          if (stackCountHere >= MAX_STACK_COUNT) {
            pending.push(next);
            pending.sort((a,b) => (b.h - a.h) || ((b.w*b.d) - (a.w*a.d)));
            break;
          }

          placements.push({
            id: next.id,
            typeKey: next.typeKey || null,
            x: px, y: py, z: zTop,
            w: pw, h: nh, d: pd,
            weight: next.weight,
            stackable: next.stackable
          });
          totalWeight += next.weight;
          placedThisLayer.add(next.id);

          zTop = q(zTop + nh);
        }
      }
    }

    // 2) Demais itens
    const others = layerPool.filter(b => !placedThisLayer.has(b.id) && !b.mustStack)
                            .sort((a,b) => (b.w*b.d - a.w*a.d));
    for (const box of others) {
      const idxNow = pending.findIndex(u => u.id === box.id);
      if (idxNow === -1) continue;

      const ph = q(box.h);
      if (baseZ + ph > H + EPS) continue;

      let allowed = freeRects;
      if (baseZ > 0 && box.selfStackOnly) {
        const support = lastSupportByType[box.typeKey] || [];
        allowed = MR_intersectionsOfLists(freeRects, support, q, EPS);
        if (allowed.length === 0) continue;
      }

      const placed = placeOneBox2D(box, allowed, freeRects, q, EPS);
      if (!placed) continue;

      const { px, py, pw, pd } = placed;

      if (q(baseZ) + ph > H + EPS) continue;
      if (!canPlace(px, py, pw, pd, q(baseZ), ph, placements, 1e-6)) continue;

      // ---- limite de pilha nos "others" ----
      const stackCountOther = stackCountAtFootprint(placements, px, py, pw, pd);
      if (stackCountOther >= MAX_STACK_COUNT) continue;

      placements.push({
        id: box.id,
        typeKey: box.typeKey || null,
        x: px, y: py, z: q(baseZ),
        w: pw, h: ph, d: pd,
        weight: box.weight,
        stackable: box.stackable
      });
      totalWeight += box.weight;
      placedThisLayer.add(box.id);

      pending.splice(idxNow, 1);

      const rect = { x: px, y: py, w: pw, d: pd };
      freeRects = MR_splitFreeRects(freeRects, rect, q, EPS);
      freeRects = MR_pruneFreeRects(freeRects, q, EPS);
    }

    // Obstáculos por NÃO empilháveis
    for (const p of placements) {
      if (p.z === baseZ && !p.stackable) {
        floorObstacles.push({ x: p.x, y: p.y, w: p.w, d: p.d });
      }
    }

    // Suporte por tipo para a próxima camada
    lastSupportByType = {};
    for (const p of placements) {
      if (p.z !== baseZ) continue;
      const key = p.typeKey || p.id;
      if (!lastSupportByType[key]) lastSupportByType[key] = [];
      lastSupportByType[key].push({ x: p.x, y: p.y, w: p.w, d: p.d });
    }

    baseZ = q(baseZ + layerHeight);
    if (![...placedThisLayer].length) break;
  }

  const usedVol  = placements.reduce((s,p)=> s + p.w*p.h*p.d, 0);
  const totalVol = W*H*D;
  let sum=0, wsum=0;
  for (const p of placements) { const yCenter = p.y + p.d/2; sum += yCenter * p.weight; wsum += p.weight; }
  const comL = wsum ? (sum/wsum) : 0;

  return { placements, usedVol, totalVol, totalWeight, comL };
}

// ====================== Visualização (Three.js) ======================

// Cores fixas por tipo
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i=0; i<str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function colorFromKey(key) {
  const k = (key || 'default') + '';
  const h = hash32(k) % 360;
  const s = 65, l = 55;
  return new THREE.Color(`hsl(${h}, ${s}%, ${l}%)`);
}

const Viz = {
  // Cena 3D
  scene: null, renderer: null, camera: null, controls: null,
  containerMesh: null, placed: [],

  // ---- Modo manual (novo) ----
  raycaster: null,
  mouseNDC: new THREE.Vector2(),
  selected: null,
  tControls: null,             // TransformControls
  snap: 0.01,                  // 1 cm (em metros). Ajuste via UI.
  gizmoMode: 'translate',      // 'translate' | 'rotateY'
  manualPlacements: null,      // referência ao array MANUAL.placements
  containerDims: null,         // { W, H, D }

  ensure(rootId='threeRoot') {
    if (!window.THREE) {
      const el = document.getElementById('threeError');
      if (el) el.classList.remove('hidden');
      console.error('[Viz.ensure] THREE ausente. O boot ESM precisa rodar antes.');
      return false;
    }
    const root = document.getElementById(rootId);
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      root.appendChild(this.renderer.domElement);
      window.addEventListener('resize', ()=>this.resize());
    }
    if (!this.scene) {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0b1220);

      this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
      this.camera.position.set(6, 6, 10);

      const OC = (window.OrbitControls || THREE.OrbitControls);
      if (!OC) {
        console.error('OrbitControls não carregado.');
        const el = document.getElementById('threeError');
        if (el) el.classList.remove('hidden');
        return false;
      }
      this.controls = new OC(this.camera, this.renderer.domElement);
      this.controls.target.set(0, 1, 0);

      const amb = new THREE.AmbientLight(0xffffff, 0.6);
      const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(5,10,7);
      const axes = new THREE.AxesHelper(1.2);
      this.scene.add(amb, dir, axes);
    }
    this.resize();
    this.renderer.setAnimationLoop(()=>{ if (this.scene && this.camera) this.renderer.render(this.scene, this.camera); });
    return true;
  },

  resize() {
    if (!this.renderer || !this.camera) return;
    const root = this.renderer.domElement.parentElement;
    const w = root.clientWidth || 800, h = root.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
  },

  clear(container) {
    // Container
    if (this.containerMesh) { 
      this.scene.remove(this.containerMesh); 
      this.containerMesh.geometry.dispose(); 
      this.containerMesh = null; 
    }
    // Caixas e linhas
    for (const m of this.placed) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material && m.material.dispose) m.material.dispose();
    }
    this.placed = [];

    // Gizmo, seleção
    if (this.tControls) this.tControls.detach();
    this.selected = null;

    // Novo container
    if (container) {
      const { W,H,D } = container;
      const geo = new THREE.BoxGeometry(W, H, D);
      const mat = new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true, transparent: true, opacity: 0.35 });
      this.containerMesh = new THREE.Mesh(geo, mat);
      this.containerMesh.position.set(W/2, H/2, D/2);
      this.scene.add(this.containerMesh);
    }
  },

  // ---- Desenho automático (apenas visual) ----
  draw(placements) {
    if (!window.THREE) return;
    console.log('[Viz.draw] desenhando', placements.length, 'caixas');
    for (const p of placements) {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const c = colorFromKey(p.typeKey || p.id);
      const mat = new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.98 });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x + p.w/2, p.z + p.h/2, p.y + p.d/2);
      mesh.renderOrder = 1;

      const edges = new THREE.EdgesGeometry(geo, 1e-6);
      const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
      line.position.copy(mesh.position);
      line.renderOrder = 2;

      this.placed.push(mesh, line);
      this.scene.add(mesh, line);
    }
  },

  // ---- Desenho para edição manual ( liga TransformControls e links ) ----
  drawManual(placements, container) {
    this.manualPlacements = placements;
    this.containerDims = { W: container.W, H: container.H, D: container.D };

    for (const p of placements) {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const c = colorFromKey(p.typeKey || p.id);
      const mat = new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.98 });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x + p.w/2, p.z + p.h/2, p.y + p.d/2);
      mesh.renderOrder = 1;
      mesh.userData.placement = p;
      mesh.userData.lastOk = { pos: mesh.position.clone(), rotY: 0 };

      const edges = new THREE.EdgesGeometry(geo, 1e-6);
      const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
      line.position.copy(mesh.position);
      line.renderOrder = 2;

      // link rápido para atualizar a linha quando mover
      mesh.userData.edgeLine = line;

      this.placed.push(mesh, line);
      this.scene.add(mesh, line);
    }

    this.enableManualPicking(true);
    this.ensureTransformControls();
    this.setGizmoMode(this.gizmoMode);
    this.setSnap(this.snap);
  },

  // ---- Recalcula stats olhando para as meshes atuais (modo manual) ----
  computeStatsFromScene(container) {
    const totalVol = container.W * container.H * container.D;
    let usedVol = 0, totalWeight = 0;

    const seen = new Set();
    for (const obj of this.placed) {
      if (!(obj instanceof THREE.Mesh)) continue;
      const p = obj.userData.placement;
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      usedVol += p.w * p.h * p.d;
      totalWeight += p.weight || 0;
    }

    let sum=0, wsum=0;
    for (const obj of this.placed) {
      if (!(obj instanceof THREE.Mesh)) continue;
      const p = obj.userData.placement; if (!p) continue;
      const yCenter = p.y + p.d/2;
      sum += yCenter * (p.weight || 0);
      wsum += (p.weight || 0);
    }
    const comL = wsum ? (sum/wsum) : 0;
    return { usedVol, totalVol, totalWeight, comL };
  },

  // ---- Picking / seleção ----
  enableManualPicking(on=true) {
    if (!this.raycaster) this.raycaster = new THREE.Raycaster();
    const dom = this.renderer.domElement;

    const onPointerDown = (e)=>{
      if (!this.scene) return;
      const rect = dom.getBoundingClientRect();
      this.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouseNDC, this.camera);
      const meshes = this.placed.filter(o => o instanceof THREE.Mesh);
      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length) this.select(hits[0].object);
      else this.unselect();
    };

    if (on) {
      if (!this._pointerDown) {
        this._pointerDown = onPointerDown;
        dom.addEventListener('pointerdown', this._pointerDown);
      }
    } else {
      if (this._pointerDown) {
        dom.removeEventListener('pointerdown', this._pointerDown);
        this._pointerDown = null;
      }
    }
  },

  ensureTransformControls() {
    if (this.tControls) return;
    if (!window.TransformControls) {
      console.error('TransformControls não disponível. Importe vendor/TransformControls.js');
      return;
    }
    this.tControls = new window.TransformControls(this.camera, this.renderer.domElement);
    this.scene.add(this.tControls);

    // Desabilita câmera enquanto arrasta
    this.tControls.addEventListener('dragging-changed', (e)=>{
      if (this.controls) this.controls.enabled = !e.value;
    });

    // Ao mudar, aplica snap/limites/colisão e atualiza placement
    this.tControls.addEventListener('objectChange', ()=>{
      if (!this.selected) return;
      this.applyConstraintsAndUpdatePlacement(this.selected);
    });
  },

  select(mesh) {
    this.selected = mesh;
    if (this.tControls) {
      this.tControls.attach(mesh);
      this.setGizmoMode(this.gizmoMode);
    }
  },

  unselect() {
    if (this.tControls) this.tControls.detach();
    this.selected = null;
  },

  setGizmoMode(mode) {
    this.gizmoMode = mode || 'translate';
    if (!this.tControls) return;
    if (this.gizmoMode === 'translate') {
      this.tControls.setMode('translate');
      this.tControls.showX = true; this.tControls.showY = true; this.tControls.showZ = true;
    } else if (this.gizmoMode === 'rotateY') {
      this.tControls.setMode('rotate');
      // mostrar só o anel Y (vertical)
      this.tControls.showX = false; this.tControls.showZ = false; this.tControls.showY = true;
    }
  },

  setSnap(snapMeters) {
    this.snap = snapMeters || 0;
    if (!this.tControls) return;
    if (this.gizmoMode === 'translate') {
      this.tControls.setTranslationSnap(this.snap > 0 ? this.snap : null);
    } else if (this.gizmoMode === 'rotateY') {
      // Snap angular opcional (ex.: 15°) → this.tControls.setRotationSnap(Math.PI/12);
      this.tControls.setRotationSnap(null);
    }
  },

  applyConstraintsAndUpdatePlacement(mesh) {
    const p = mesh.userData.placement;
    if (!p || !this.containerDims) return;

    // SNAP de posição
    if (this.gizmoMode === 'translate' && this.snap > 0) {
      mesh.position.x = Math.round(mesh.position.x / this.snap) * this.snap;
      mesh.position.y = Math.round(mesh.position.y / this.snap) * this.snap;
      mesh.position.z = Math.round(mesh.position.z / this.snap) * this.snap;
    }

    // Limites internos do baú
    const { W,H,D } = this.containerDims;
    const half = { x: p.w/2, y: p.h/2, z: p.d/2 };
    mesh.position.x = Math.min(Math.max(mesh.position.x, half.x), W - half.x);
    mesh.position.y = Math.min(Math.max(mesh.position.y, half.y), H - half.y);
    mesh.position.z = Math.min(Math.max(mesh.position.z, half.z), D - half.z);

    // Rotação Y apenas
    if (this.gizmoMode === 'rotateY') {
      mesh.rotation.x = 0;
      mesh.rotation.z = 0;
      // (snap opcional de 90°) // mesh.rotation.y = Math.round(mesh.rotation.y/(Math.PI/2))*(Math.PI/2);
    } else {
      mesh.rotation.set(0, 0, 0);
    }

    // Colisão 3D (AABB) contra as demais
    const ok = this.validateNoCollision(mesh);
    if (!ok) {
      // Reverte
      const last = mesh.userData.lastOk;
      mesh.position.copy(last.pos);
      mesh.rotation.y = last.rotY || 0;
      if (mesh.userData.edgeLine) mesh.userData.edgeLine.position.copy(mesh.position);
      return;
    }

    // Atualiza placement (conversão viewer→pack)
    p.x = mesh.position.x - p.w/2;           // largura
    p.y = mesh.position.z - p.d/2;           // comprimento
    p.z = mesh.position.y - p.h/2;           // altura

    // Salva último ok
    mesh.userData.lastOk = { pos: mesh.position.clone(), rotY: mesh.rotation.y };

    // Move a linha junto
    if (mesh.userData.edgeLine) mesh.userData.edgeLine.position.copy(mesh.position);

    // Atualiza stats
    const stats = this.computeStatsFromScene(this.containerDims);
    if (window.updateStats) {
      window.updateStats(stats.usedVol, stats.totalVol, stats.totalWeight, stats.comL);
    }
  },

  validateNoCollision(mesh) {
    // AABB da mesh selecionada
    const p = mesh.userData.placement;
    const testAABB = {
      x: mesh.position.x - p.w/2,
      y: mesh.position.z - p.d/2,
      z: mesh.position.y - p.h/2,
      w: p.w, d: p.d, h: p.h
    };

    for (const obj of this.placed) {
      if (!(obj instanceof THREE.Mesh)) continue;
      if (obj === mesh) continue;
      const pj = obj.userData.placement; if (!pj) continue;
      const aabbJ = {
        x: obj.position.x - pj.w/2,
        y: obj.position.z - pj.d/2,
        z: obj.position.y - pj.h/2,
        w: pj.w, d: pj.d, h: pj.h
      };
      if (aabbOverlap(testAABB, aabbJ, 1e-6)) return false;
    }
    return true;
  },

  snapshotPNG() {
    if (!this.renderer) return null;
    return this.renderer.domElement.toDataURL('image/png');
  }
};
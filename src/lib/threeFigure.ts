import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { segData, segColor } from '../data/portalData'

export type FigGender = 'male' | 'female'
export interface FigureHandle {
  setSelected: (key: string) => void
  dispose: () => void
}

const NOOP: FigureHandle = { setSelected: () => {}, dispose: () => {} }

/**
 * Classify an anatomy-model mesh into one of the 5 InBody segments by its name
 * (left/right + body-part keywords) with a spatial fallback (height + x offset).
 * Returns null for head/neck/other meshes (rendered neutral, not selectable).
 */
function classifySeg(name: string, cx: number, yNorm: number, halfW: number): string | null {
  const n = name.toLowerCase()
  const L = /left|_l\b|\bl_|\.l\b|(^|[^a-z])l([^a-z]|$)/.test(n)
  const R = /right|_r\b|\br_|\.r\b|(^|[^a-z])r([^a-z]|$)/.test(n)
  const side = L && !R ? 'left' : R && !L ? 'right' : (cx >= 0 ? 'right' : 'left')
  const head = /head|skull|neck|face|cervic|jaw|crani|hair|eye/.test(n)
  const arm = /arm|brachi|deltoid|forearm|bicep|tricep|shoulder|hand|wrist|elbow/.test(n)
  const leg = /leg|femor|quadric|gastro|calf|thigh|glute|hamstring|tibia|fibula|foot|shin|soleus|ankle|knee|patella/.test(n)
  const trunk = /trunk|torso|abdom|abs|pector|chest|trapez|spine|back|lat|obliq|core|rib|serrat|erector|waist|pelvi|gluteus/.test(n)
  if (head) return null
  if (arm) return side === 'right' ? 'rightArm' : 'leftArm'
  if (leg) return side === 'right' ? 'rightLeg' : 'leftLeg'
  if (trunk) return 'trunk'
  // spatial fallback when the name is uninformative
  if (yNorm > 0.86) return null
  if (yNorm >= 0.5 && Math.abs(cx) > halfW * 0.4) return side === 'right' ? 'rightArm' : 'leftArm'
  if (yNorm < 0.45) return side === 'right' ? 'rightLeg' : 'leftLeg'
  return 'trunk'
}

/**
 * Builds the segmental lean 3D figure and wires drag-rotate + tap-to-pick.
 * Starts with the procedural capsule mannequin, then—if an anatomy model exists
 * at /assets/anatomy-<gender>.glb—swaps it in (muscle meshes auto-mapped to the
 * 5 InBody segments). Falls back silently to the mannequin if the file is
 * missing or WebGL is unavailable.
 */
export function createFigure(mount: HTMLElement, onPick: (seg: string) => void, gender: FigGender = 'male'): FigureHandle {
  try {
  let segMats: Record<string, THREE.MeshStandardMaterial[]> = {}
  let selected = 'trunk'

  // For a single-body (unsegmented) model we paint segments via per-vertex color.
  const SKIN = new THREE.Color(0xcaa892)
  const SEG_ORDER = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg']
  let bodyMeshes: { geo: THREE.BufferGeometry; seg: Uint8Array }[] | null = null
  const vertexSeg = (x: number, yNorm: number, halfW: number): number => {
    if (yNorm > 0.86) return 255                                            // head/neck
    if (yNorm >= 0.5 && Math.abs(x) > halfW * 0.34) return x >= 0 ? 0 : 1    // arm (R/L)
    if (yNorm < 0.46) return x >= 0 ? 3 : 4                                  // leg (R/L)
    return 2                                                                // trunk
  }
  const applyBodyColors = () => {
    if (!bodyMeshes) return
    const tmp = new THREE.Color()
    for (const { geo, seg } of bodyMeshes) {
      const col = geo.getAttribute('color') as THREE.BufferAttribute
      for (let i = 0; i < seg.length; i++) {
        const sid = seg[i]
        if (sid === 255) tmp.copy(SKIN)
        else { const key = SEG_ORDER[sid]; const sd = segData.find((s) => s.key === key); tmp.set(segColor(sd ? sd.pct : 100)); if (selected !== key) tmp.lerp(SKIN, 0.6) }
        col.setXYZ(i, tmp.r, tmp.g, tmp.b)
      }
      col.needsUpdate = true
    }
  }

  const w = mount.clientWidth || 520
  const h = mount.clientHeight || 360
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 100)
  cam.position.set(0, 1.3, 9.4)
  cam.lookAt(0, 1.25, 0)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  mount.appendChild(renderer.domElement)

  scene.add(new THREE.HemisphereLight(0xcfeef2, 0x0a2422, 0.85))
  const key = new THREE.DirectionalLight(0xeafcff, 1.05); key.position.set(4, 8, 6); scene.add(key)
  const fill = new THREE.DirectionalLight(0x16c0ce, 0.55); fill.position.set(-5, 3, -4); scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffe8c8, 0.4); rim.position.set(0, 4, -7); scene.add(rim)

  // soft ground blob
  const sc = document.createElement('canvas'); sc.width = sc.height = 256
  const sx = sc.getContext('2d')!
  const grd = sx.createRadialGradient(128, 128, 8, 128, 128, 128)
  grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)')
  sx.fillStyle = grd; sx.fillRect(0, 0, 256, 256)
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2; blob.position.y = -2.35; scene.add(blob)

  const fig = new THREE.Group(); scene.add(fig)
  const mk = (k: string) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x37b6c2, roughness: 0.5, metalness: 0.15, emissive: 0x06231f, emissiveIntensity: 0.4 });
    (segMats[k] = segMats[k] || []).push(m)
    return m
  }
  const tag = (obj: THREE.Object3D, k: string) => obj.traverse((o) => { o.userData.seg = k })
  const neutral = new THREE.MeshStandardMaterial({ color: 0x7c9690, roughness: 0.6, metalness: 0.05 })

  const capsule = (r: number, len: number, mat: THREE.Material) => {
    const g = new THREE.Group()
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), mat)
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat); top.position.y = len / 2
    const bot = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat); bot.position.y = -len / 2
    g.add(cyl, top, bot)
    return g
  }

  const trunkMat = mk('trunk')
  const trunk = capsule(0.6, 1.45, trunkMat); trunk.position.set(0, 2.0, 0); trunk.scale.set(1, 1, 0.74); tag(trunk, 'trunk'); fig.add(trunk)
  const hips = capsule(0.5, 0.35, trunkMat); hips.position.set(0, 1.15, 0); hips.scale.set(1.05, 1, 0.74); tag(hips, 'trunk'); fig.add(hips)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 20), neutral); head.position.set(0, 3.35, 0); fig.add(head)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.3, 20), neutral); neck.position.set(0, 2.95, 0); fig.add(neck)
  const la = capsule(0.185, 1.45, mk('leftArm')); la.position.set(-0.82, 2.35, 0); la.rotation.z = 0.32; tag(la, 'leftArm'); fig.add(la)
  const ra = capsule(0.185, 1.45, mk('rightArm')); ra.position.set(0.82, 2.35, 0); ra.rotation.z = -0.32; tag(ra, 'rightArm'); fig.add(ra)
  const ll = capsule(0.245, 1.7, mk('leftLeg')); ll.position.set(-0.3, 0.05, 0); ll.rotation.z = 0.04; tag(ll, 'leftLeg'); fig.add(ll)
  const rl = capsule(0.245, 1.7, mk('rightLeg')); rl.position.set(0.3, 0.05, 0); rl.rotation.z = -0.04; tag(rl, 'rightLeg'); fig.add(rl)
  ;[-0.32, 0.32].forEach((x) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), neutral)
    f.scale.set(1, 0.6, 1.6); f.position.set(x, -1.72, 0.12); fig.add(f)
  })
  fig.rotation.y = -0.35

  const applySegColors = () => {
    Object.keys(segMats).forEach((k) => {
      const sd = segData.find((s) => s.key === k); if (!sd) return
      const col = segColor(sd.pct); const sel = selected === k
      segMats[k].forEach((m) => {
        m.color.set(col); m.emissive.set(sel ? col : 0x06231f); m.emissiveIntensity = sel ? 0.55 : 0.35
      })
    })
  }
  applySegColors()

  // Swap in an external model when available: first a segmented anatomy model
  // (muscle meshes → the 5 InBody segments, tap-to-highlight), else a plain body
  // model rendered as clean skin. Falls back to the mannequin if none load.
  let disposed = false
  const swapGltf = (gltf: { scene: THREE.Object3D }, faceFlip = false) => {
    const root = gltf.scene
    const box0 = new THREE.Box3().setFromObject(root)
    const size = box0.getSize(new THREE.Vector3())
    const ctr = box0.getCenter(new THREE.Vector3())
    const height = size.y || 1
    const halfW = (size.x || 1) / 2
    const newSeg: Record<string, THREE.MeshStandardMaterial[]> = {}
    const allMats: THREE.MeshStandardMaterial[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return
      const mc = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())
      const yNorm = (mc.y - box0.min.y) / height
      const seg = classifySeg(`${m.name} ${m.parent?.name ?? ''}`, mc.x - ctr.x, yNorm, halfW)
      const mat = new THREE.MeshStandardMaterial({ color: 0x9aa6a4, roughness: 0.5, metalness: 0.06, emissive: 0x0a1a18, emissiveIntensity: 0.3 })
      m.material = mat; allMats.push(mat)
      if (seg) { (newSeg[seg] = newSeg[seg] || []).push(mat); m.userData.seg = seg }
    })
    // segmented only if the model actually splits into ≥3 parts; otherwise it's a
    // single-body model → paint the 5 segments onto it via per-vertex color so
    // selecting a part still highlights on the body.
    const segmented = Object.keys(newSeg).length >= 3
    if (!segmented) {
      segMats = {}
      bodyMeshes = []
      root.updateWorldMatrix(true, true) // world coords still match box0 (not recentered yet)
      const v = new THREE.Vector3()
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return
        const geo = m.geometry as THREE.BufferGeometry
        const pos = geo.getAttribute('position') as THREE.BufferAttribute
        const seg = new Uint8Array(pos.count)
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); m.localToWorld(v); seg[i] = vertexSeg(v.x - ctr.x, (v.y - box0.min.y) / height, halfW) }
        if (!geo.getAttribute('color')) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3))
        const mat = m.material as THREE.MeshStandardMaterial
        mat.vertexColors = true; mat.color.set(0xffffff); mat.emissive.set(0x120b07); mat.emissiveIntensity = 0.12; mat.roughness = 0.62; mat.metalness = 0.02
        m.userData.seg = undefined; m.userData.bodySeg = seg
        bodyMeshes!.push({ geo, seg })
      })
    }
    while (fig.children.length) fig.remove(fig.children[0])
    root.position.sub(ctr)
    const holder = new THREE.Group(); holder.add(root)
    holder.scale.setScalar(5.2 / height); holder.position.y = 1.1
    if (faceFlip) holder.rotation.y = Math.PI // model faces -Z → turn to face the camera
    fig.add(holder)
    if (segmented) { segMats = newSeg; bodyMeshes = null; applySegColors() }
    else applyBodyColors()
    void allMats
  }
  ;(() => {
    const loader = new GLTFLoader()
    try {
      const draco = new DRACOLoader()
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
      loader.setDRACOLoader(draco)
    } catch { /* draco optional */ }
    const chain = [`/assets/anatomy-${gender}.glb`, `/assets/fallback-${gender}.glb`, '/assets/fallback-male.glb']
    const tryNext = (i: number) => {
      if (disposed || i >= chain.length) return
      loader.load(chain[i], (gltf) => {
        if (disposed) return
        try { swapGltf(gltf, chain[i].includes('fallback')) } catch (err) { console.warn('[figure] model wiring failed', err) }
      }, undefined, () => tryNext(i + 1))
    }
    tryNext(0)
  })()

  // interaction
  const el = renderer.domElement
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let dragging = false; let lastX = 0; let lastY = 0; let moved = 0

  const pick = (e: MouseEvent | TouchEvent) => {
    const rect = el.getBoundingClientRect()
    const t = 'changedTouches' in e ? e.changedTouches[0] : e
    ndc.x = ((t.clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((t.clientY - rect.top) / rect.height) * 2 + 1
    ray.setFromCamera(ndc, cam)
    const hits = ray.intersectObjects(fig.children, true)
    for (const hpt of hits) {
      const seg = hpt.object.userData.seg
      if (seg) { onPick(seg); return }
      const bs = hpt.object.userData.bodySeg as Uint8Array | undefined // single-body model
      if (bs && hpt.face) { const id = bs[hpt.face.a]; if (id !== 255 && id != null) { onPick(SEG_ORDER[id]); return } }
    }
  }
  const down = (e: MouseEvent | TouchEvent) => {
    dragging = true; moved = 0
    const t = 'touches' in e ? e.touches[0] : e
    lastX = t.clientX; lastY = t.clientY; el.style.cursor = 'grabbing'
  }
  const moveH = (e: MouseEvent | TouchEvent) => {
    if (!dragging) return
    const t = 'touches' in e ? e.touches[0] : e
    const dx = t.clientX - lastX; const dy = t.clientY - lastY
    moved += Math.abs(dx) + Math.abs(dy)
    fig.rotation.y += dx * 0.01
    fig.rotation.x = Math.max(-0.5, Math.min(0.5, fig.rotation.x + dy * 0.006))
    lastX = t.clientX; lastY = t.clientY
    if (e.cancelable && 'touches' in e) e.preventDefault()
  }
  const up = (e: MouseEvent | TouchEvent) => {
    if (dragging && moved < 6) pick(e)
    dragging = false; el.style.cursor = 'grab'
  }
  el.addEventListener('mousedown', down)
  window.addEventListener('mousemove', moveH)
  window.addEventListener('mouseup', up)
  el.addEventListener('touchstart', down, { passive: true })
  el.addEventListener('touchmove', moveH, { passive: false })
  el.addEventListener('touchend', up)

  const ro = new ResizeObserver(() => {
    const W = mount.clientWidth; const H = mount.clientHeight
    if (W && H) { cam.aspect = W / H; cam.updateProjectionMatrix(); renderer.setSize(W, H) }
  })
  ro.observe(mount)

  const clock = new THREE.Clock()
  let raf = 0
  const loop = () => {
    raf = requestAnimationFrame(loop)
    const t = clock.getElapsedTime()
    if (!dragging) fig.rotation.y += 0.0045
    fig.position.y = Math.sin(t * 1.1) * 0.07
    renderer.render(scene, cam)
  }
  loop()

  return {
    setSelected: (k: string) => { selected = k; applySegColors(); applyBodyColors() },
    dispose: () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', moveH)
      window.removeEventListener('mouseup', up)
      ro.disconnect()
      renderer.dispose()
      if (el.parentNode === mount) mount.removeChild(el)
    },
  }
  } catch (e) {
    console.warn('figure 3D failed', e)
    return NOOP
  }
}

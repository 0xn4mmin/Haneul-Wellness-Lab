import * as THREE from 'three'

export interface FieldHandle {
  follow: (nx: number, ny: number) => void
  dispose: () => void
}

const NOOP: FieldHandle = { follow: () => {}, dispose: () => {} }

function sparkleTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(190,234,238,.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/**
 * Intro hero background: dim drifting faceted crystals + starfield, cursor parallax.
 * Degrades to a no-op (static CSS background) if WebGL is unavailable.
 */
export function createField(mount: HTMLElement): FieldHandle {
  try {
    const w = mount.clientWidth || window.innerWidth
    const h = mount.clientHeight || window.innerHeight
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.1, 100)
    cam.position.set(0, 0, 7)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0x8fd6dc, 0x06140f, 0.55))
    const pl = new THREE.PointLight(0x16c0ce, 0.8, 40); pl.position.set(0, 0, 6); scene.add(pl)
    const key = new THREE.DirectionalLight(0xbfeef2, 0.5); key.position.set(3, 5, 4); scene.add(key)

    const crystals: THREE.Mesh[] = []
    const mat = new THREE.MeshStandardMaterial({
      color: 0x176d75, roughness: 0.4, metalness: 0.3, flatShading: true,
      emissive: 0x0a2e33, emissiveIntensity: 0.7, transparent: true, opacity: 0.92,
    })
    for (let i = 0; i < 9; i++) {
      const r = 0.32 + Math.random() * 0.42
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat)
      m.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 7, -2 - Math.random() * 4)
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      m.userData = { sp: 0.1 + Math.random() * 0.2, dr: 0.1 + Math.random() * 0.2 }
      scene.add(m); crystals.push(m)
      const wire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r * 1.08, 0),
        new THREE.MeshBasicMaterial({ color: 0x6fd6de, wireframe: true, transparent: true, opacity: 0.18 }),
      )
      m.add(wire)
    }

    const N = 260
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14
      pos[i * 3 + 2] = -1 - Math.random() * 9
    }
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        size: 0.06, map: sparkleTex(), transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9fe9ef,
      }),
    )
    scene.add(pts)

    let tx = 0; let ty = 0

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
      crystals.forEach((m, i) => {
        const ud = m.userData as { sp: number; dr: number }
        m.rotation.x += 0.0016 * ud.sp * 6
        m.rotation.y += 0.0014 * ud.sp * 6
        m.position.y += Math.sin(t * ud.dr + i) * 0.0016
      })
      pts.rotation.y += 0.0003
      cam.position.x += (tx * 0.5 - cam.position.x) * 0.03
      cam.position.y += (-ty * 0.35 - cam.position.y) * 0.03
      cam.lookAt(0, 0, 0)
      renderer.render(scene, cam)
    }
    loop()

    return {
      follow: (nx: number, ny: number) => { tx = (nx - 0.5) * 2; ty = (ny - 0.5) * 2 },
      dispose: () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
        renderer.dispose()
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      },
    }
  } catch (e) {
    console.warn('field 3D failed', e)
    return NOOP
  }
}

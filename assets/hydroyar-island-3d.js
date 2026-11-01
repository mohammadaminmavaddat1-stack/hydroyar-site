/* HydroYar 3D Island — self-contained procedural WebGL scene.
   Three.js r160 is locally hosted with its MIT license in assets/vendor. */
(() => {
  'use strict';
  const canvas = document.getElementById('hydroyarIsland3D');
  const host = document.querySelector('.calm-waves');
  if (!canvas || !host || !window.THREE) return;

  const T = window.THREE;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: window.innerWidth > 700,
      powerPreference: 'low-power',
      stencil: false,
      depth: true
    });
  } catch (error) {
    canvas.hidden = true;
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(39, 1, 0.1, 80);
  const smallScreen = () => window.innerWidth < 700;

  const hemi = new T.HemisphereLight(0xb8d9ed, 0x142a30, 1.85);
  scene.add(hemi);
  const keyLight = new T.DirectionalLight(0xf1e8cf, 3.0);
  keyLight.position.set(-3.5, 7, 5);
  scene.add(keyLight);
  const rimLight = new T.DirectionalLight(0x6fa5c2, 1.7);
  rimLight.position.set(5, 3, -5);
  scene.add(rimLight);

  const island = new T.Group();
  scene.add(island);

  const seaUniforms = {
    uTime: { value: 0 },
    uNight: { value: 1 }
  };
  const seaMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: seaUniforms,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float a = sin(p.x * 1.34 + uTime * 0.62) * 0.038;
        float b = cos(p.y * 1.72 - uTime * 0.78) * 0.028;
        float c = sin((p.x + p.y) * 0.92 + uTime * 0.43) * 0.022;
        p.z += a + b + c;
        vWave = a + b + c;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uNight;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vec2 centered = vUv - 0.5;
        float radius = length(centered);
        float edge = 1.0 - smoothstep(0.29, 0.51, radius);
        float ripple = sin(radius * 118.0 - uTime * 1.7) * 0.5 + 0.5;
        float glint = smoothstep(0.84, 0.98, sin(vUv.x * 41.0 + vUv.y * 29.0 + uTime * 0.7) * 0.5 + 0.5);
        vec3 nightWater = vec3(0.035, 0.16, 0.23);
        vec3 dayWater = vec3(0.16, 0.42, 0.52);
        vec3 water = mix(dayWater, nightWater, uNight);
        water += vec3(0.07, 0.17, 0.20) * (ripple * 0.12 + glint * 0.12 + vWave * 1.4);
        float alpha = edge * (0.16 + ripple * 0.06 + glint * 0.12);
        gl_FragColor = vec4(water, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const sea = new T.Mesh(new T.PlaneGeometry(11.5, 11.5, 92, 92), seaMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.56;
  island.add(sea);

  function terrainHeight(x, z) {
    const radius = Math.sqrt(x * x + z * z) / 2.18;
    if (radius < 0.74) return 0.23 + 0.39 * (1 - Math.pow(radius / 0.74, 2));
    const t = Math.min(1, (radius - 0.74) / 0.26);
    return 0.23 - 0.80 * Math.pow(t, 1.12);
  }

  function makeIslandTerrain() {
    const rings = 18;
    const segments = 112;
    const positions = [];
    const colors = [];
    const indices = [];
    const green = new T.Color('#42745e');
    const greenLight = new T.Color('#67966f');
    const sand = new T.Color('#b6a27c');
    const stone = new T.Color('#607176');
    const deepStone = new T.Color('#3c525a');
    for (let ring = 0; ring <= rings; ring++) {
      const r = ring / rings;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const irregular = 1 + 0.032 * Math.sin(angle * 5 + 0.4) + 0.018 * Math.cos(angle * 9 - 0.8);
        const radius = 2.18 * r * irregular;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const normalized = radius / 2.18;
        let y;
        if (normalized < 0.74) {
          y = 0.23 + 0.39 * (1 - Math.pow(normalized / 0.74, 2));
        } else {
          const t = Math.min(1, (normalized - 0.74) / 0.26);
          y = 0.23 - 0.80 * Math.pow(t, 1.12);
        }
        y += (Math.sin(angle * 7) + Math.cos(angle * 11)) * 0.012 * r;
        positions.push(x, y, z);

        const color = new T.Color();
        if (normalized < 0.66) {
          color.copy(green).lerp(greenLight, 0.18 + 0.13 * Math.sin(angle * 3));
        } else if (normalized < 0.78) {
          color.copy(greenLight).lerp(sand, (normalized - 0.66) / 0.12);
        } else {
          color.copy(stone).lerp(deepStone, Math.min(1, (normalized - 0.78) / 0.22));
          color.lerp(sand, 0.08 * Math.sin(angle * 6));
        }
        colors.push(color.r, color.g, color.b);
        if (ring < rings && i < segments) {
          const a = ring * (segments + 1) + i;
          const b = a + segments + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    island.add(mesh);
  }
  makeIslandTerrain();

  const grassMat = new T.MeshStandardMaterial({ color: 0x376b52, roughness: 1 });
  const trunkMat = new T.MeshStandardMaterial({ color: 0x71533c, roughness: 1 });
  const leafMats = [
    new T.MeshStandardMaterial({ color: 0x245c49, roughness: 0.94 }),
    new T.MeshStandardMaterial({ color: 0x34765a, roughness: 0.92 }),
    new T.MeshStandardMaterial({ color: 0x4b8965, roughness: 0.94 })
  ];

  function addTree(x, z) {
    const tree = new T.Group();
    tree.position.set(x, terrainHeight(x, z), z);
    island.add(tree);
    const trunk = new T.Mesh(new T.CylinderGeometry(0.075, 0.115, 0.94, 12), trunkMat);
    trunk.position.y = 0.44;
    trunk.rotation.z = -0.08;
    tree.add(trunk);
    const foliage = [
      [-0.22, 0.92, 0.02, 0.42],
      [0.17, 1.06, -0.05, 0.48],
      [-0.08, 1.30, 0.06, 0.46],
      [0.20, 1.47, 0.08, 0.34],
      [-0.28, 1.54, -0.04, 0.32],
      [0.0, 1.72, 0.01, 0.30]
    ];
    foliage.forEach((item, index) => {
      const crown = new T.Mesh(new T.IcosahedronGeometry(item[3], 2), leafMats[index % leafMats.length]);
      crown.position.set(item[0], item[1], item[2]);
      crown.scale.set(1.12, 0.92, 0.98);
      tree.add(crown);
    });
    const rootRim = new T.Mesh(new T.CylinderGeometry(0.30, 0.36, 0.06, 20), grassMat);
    rootRim.position.y = 0.035;
    tree.add(rootRim);
    return tree;
  }
  const tree = addTree(-0.72, 0.27);

  const lighthouse = new T.Group();
  const lighthouseX = 0.75;
  const lighthouseZ = -0.24;
  lighthouse.position.set(lighthouseX, terrainHeight(lighthouseX, lighthouseZ), lighthouseZ);
  island.add(lighthouse);

  const towerMat = new T.MeshStandardMaterial({ color: 0xd9dfd9, roughness: 0.62, metalness: 0.08 });
  const redMat = new T.MeshStandardMaterial({ color: 0x9d4e43, roughness: 0.78 });
  const darkWindow = new T.MeshStandardMaterial({ color: 0x243e48, roughness: 0.45, metalness: 0.15 });
  const brass = new T.MeshStandardMaterial({ color: 0xc4a36b, metalness: 0.62, roughness: 0.34 });
  const tower = new T.Mesh(new T.CylinderGeometry(0.135, 0.205, 1.35, 32), towerMat);
  tower.position.y = 0.71;
  lighthouse.add(tower);

  [0.38, 0.91].forEach(y => {
    const band = new T.Mesh(new T.CylinderGeometry(0.176 - y * 0.031, 0.176 - y * 0.031, 0.13, 32), redMat);
    band.position.y = y;
    lighthouse.add(band);
  });
  const base = new T.Mesh(new T.CylinderGeometry(0.255, 0.29, 0.18, 32), stoneMaterial());
  base.position.y = 0.11;
  lighthouse.add(base);
  function stoneMaterial() {
    return new T.MeshStandardMaterial({ color: 0x45585b, roughness: 0.98 });
  }

  const door = new T.Mesh(new T.BoxGeometry(0.13, 0.25, 0.018), darkWindow);
  door.position.set(0, 0.19, 0.193);
  lighthouse.add(door);
  const doorCap = new T.Mesh(new T.SphereGeometry(0.066, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkWindow);
  doorCap.position.set(0, 0.315, 0.194);
  lighthouse.add(doorCap);

  const balcony = new T.Mesh(new T.CylinderGeometry(0.255, 0.23, 0.09, 32), brass);
  balcony.position.y = 1.42;
  lighthouse.add(balcony);
  const lampGlassMat = new T.MeshStandardMaterial({
    color: 0xffe7ac,
    emissive: 0xffc96b,
    emissiveIntensity: 1.25,
    transparent: true,
    opacity: 0.76,
    roughness: 0.16,
    metalness: 0.12
  });
  const lampRoom = new T.Mesh(new T.CylinderGeometry(0.19, 0.19, 0.28, 24), lampGlassMat);
  lampRoom.position.y = 1.60;
  lighthouse.add(lampRoom);
  const roof = new T.Mesh(new T.ConeGeometry(0.245, 0.24, 24), redMat);
  roof.position.y = 1.86;
  lighthouse.add(roof);
  const roofTip = new T.Mesh(new T.SphereGeometry(0.045, 12, 8), brass);
  roofTip.position.y = 1.99;
  lighthouse.add(roofTip);
  const capRing = new T.Mesh(new T.CylinderGeometry(0.19, 0.22, 0.045, 24), brass);
  capRing.position.y = 1.76;
  lighthouse.add(capRing);

  const lampGlow = new T.PointLight(0xffd58a, 2.1, 5.8, 1.8);
  lampGlow.position.set(0, 1.6, 0);
  lighthouse.add(lampGlow);

  const beamPivot = new T.Group();
  beamPivot.position.set(0, 1.6, 0);
  lighthouse.add(beamPivot);
  const beamMaterial = new T.MeshBasicMaterial({
    color: 0xffc84a,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    toneMapped: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending
  });
  const beam = new T.Mesh(new T.ConeGeometry(1.15, 4.4, 36, 1, true), beamMaterial);
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 2.2;
  beamPivot.add(beam);
  const beamSpot = new T.SpotLight(0xffd997, 5.0, 8.5, Math.PI / 10, 0.72, 1.5);
  beamSpot.position.set(0, 0, 0);
  const beamTarget = new T.Object3D();
  beamTarget.position.set(3.5, 0, 0);
  beamPivot.add(beamSpot, beamTarget);
  beamSpot.target = beamTarget;

  const smallRocks = [];
  const rockMat = new T.MeshStandardMaterial({ color: 0x42545a, roughness: 0.98 });
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.24;
    const radius = 1.94 + 0.10 * Math.sin(i * 2.1);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const rock = new T.Mesh(new T.DodecahedronGeometry(0.16 + (i % 3) * 0.045, 0), rockMat);
    rock.position.set(x, terrainHeight(x, z) + 0.06, z);
    rock.scale.set(1.35, 0.86, 1.08);
    island.add(rock);
    smallRocks.push(rock);
  }

  const ringMaterial = new T.MeshBasicMaterial({
    color: 0x70b7c7,
    transparent: true,
    opacity: 0.22,
    side: T.DoubleSide,
    depthWrite: false
  });
  const waterRings = [];
  [2.58, 2.88, 3.20].forEach((radius, index) => {
    const ring = new T.Mesh(new T.RingGeometry(radius, radius + 0.012, 128), ringMaterial.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.50 + index * 0.006;
    island.add(ring);
    waterRings.push(ring);
  });

  const themeMaterials = {
    towerMat,
    redMat,
    grassMat,
    leafMats,
    rockMat,
    ringMaterial
  };
  const pointer = { x: 0, y: 0 };
  function applyTheme() {
    const night = document.body.classList.contains('dark');
    seaUniforms.uNight.value = night ? 1 : 0;
    hemi.intensity = night ? 1.38 : 1.8;
    keyLight.intensity = night ? 1.7 : 2.45;
    rimLight.intensity = night ? 1.2 : 1.55;
    lampGlow.intensity = night ? 2.8 : 1.25;
    beamMaterial.opacity = night ? 0.24 : 0.09;
    themeMaterials.towerMat.color.set(night ? 0xc5d0d0 : 0xf2f2e7);
    themeMaterials.redMat.color.set(night ? 0x99524b : 0xb95645);
    themeMaterials.grassMat.color.set(night ? 0x315d4c : 0x4b825d);
    themeMaterials.leafMats[0].color.set(night ? 0x245744 : 0x32734d);
    themeMaterials.leafMats[1].color.set(night ? 0x34765a : 0x4f9464);
    themeMaterials.leafMats[2].color.set(night ? 0x4b8965 : 0x71a56c);
    themeMaterials.rockMat.color.set(night ? 0x3c5056 : 0x65736e);
    ringMaterial.color.set(night ? 0x66b4ca : 0x4d9bad);
    waterRings.forEach((ring, i) => {
      ring.material.color.copy(ringMaterial.color);
      ring.material.opacity = (night ? 0.24 : 0.15) - i * 0.035;
    });
    canvas.style.opacity = smallScreen() ? (night ? '0.78' : '0.62') : (night ? '0.96' : '0.84');
    if (reducedMotion.matches) renderStatic();
  }
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  if (pointerFine.matches) {
    window.addEventListener('pointermove', event => {
      pointer.x = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointer.y = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    }, { passive: true });
  }

  let width = 1;
  let height = 1;
  let frame = 0;
  let lastFrame = 0;
  let visible = true;
  const clock = new T.Clock();

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const mobile = smallScreen();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = mobile ? 44 : 39;
    camera.updateProjectionMatrix();
    if (mobile) {
      island.position.set(0, -4.50, 0);
      island.scale.setScalar(0.88);
      camera.position.set(0, 5.15, 15.6);
      camera.lookAt(0, -0.38, 0);
    } else {
      island.position.set(-2.36, -1.02, 0.1);
      island.scale.setScalar(1.14);
      camera.position.set(-0.25, 4.65, 11.8);
      camera.lookAt(-1.28, 0.16, 0);
    }
    renderStatic();
  }

  function render(time) {
    seaUniforms.uTime.value = time;
    island.rotation.y = Math.sin(time * 0.12) * 0.045 + pointer.x * 0.035;
    island.position.y += 0; // Keep the island stable; only the sea and camera breathe.
    beamPivot.rotation.y = time * 0.34 + pointer.x * 0.12;
    lampGlow.intensity = (document.body.classList.contains('dark') ? 2.7 : 1.2) + Math.sin(time * 2.4) * 0.08;
    camera.position.x += ((smallScreen() ? 0 : -0.25 + pointer.x * 0.18) - camera.position.x) * 0.025;
    camera.position.y += ((smallScreen() ? 5.15 : 4.65 + pointer.y * -0.10) - camera.position.y) * 0.025;
    camera.lookAt(smallScreen() ? 0 : -1.28, smallScreen() ? -0.38 : 0.16, 0);
    renderer.render(scene, camera);
  }

  function renderStatic() {
    if (!renderer) return;
    const prev = seaUniforms.uTime.value;
    render(reducedMotion.matches ? 0 : prev);
  }

  function animate(now) {
    if (!visible || reducedMotion.matches) return;
    frame = requestAnimationFrame(animate);
    const minFrame = smallScreen() ? 1000 / 30 : 1000 / 42;
    if (now - lastFrame < minFrame) return;
    lastFrame = now;
    render(clock.getElapsedTime());
  }

  function start() {
    if (frame || !visible || reducedMotion.matches) return;
    clock.start();
    frame = requestAnimationFrame(animate);
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) start();
    else stop();
  });
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches) {
      stop();
      renderStatic();
    } else {
      clock.start();
      start();
    }
  });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => {
    stop();
    themeObserver.disconnect();
    renderer.dispose();
  }, { once: true });

  document.body.classList.add('hydroyar-island-ready');
  host.classList.add('has-island-3d');
  resize();
  if (!reducedMotion.matches) start();
})();

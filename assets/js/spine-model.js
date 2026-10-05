let THREE;

const container = document.querySelector('[data-spine-model]');
const isIPadDevice = /iPad/i.test(navigator.userAgent)
  || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const parseBinaryStl = (buffer, options = {}) => {
  const {
    center = true,
    includeTriangle = () => true,
    fixedColor = null,
    colorByComponent = false
  } = options;
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const positionValues = [];
  const normalValues = [];
  const triangleCenters = [];
  let offset = 84;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    const trianglePositions = new Float32Array(9);
    let centerZ = 0;
    offset += 12;

    for (let vertex = 0; vertex < 3; vertex += 1) {
      const target = vertex * 3;
      trianglePositions[target] = view.getFloat32(offset, true);
      trianglePositions[target + 1] = view.getFloat32(offset + 4, true);
      trianglePositions[target + 2] = view.getFloat32(offset + 8, true);
      centerZ += trianglePositions[target + 2];
      offset += 12;
    }

    offset += 2;

    centerZ /= 3;
    if (!includeTriangle(centerZ, trianglePositions)) continue;

    positionValues.push(...trianglePositions);
    normalValues.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    triangleCenters.push(centerZ);
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(positionValues);
  const normals = new Float32Array(normalValues);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingBox();

  const minZ = geometry.boundingBox.min.z;
  const maxZ = geometry.boundingBox.max.z;
  const colors = new Float32Array(triangleCenters.length * 9);
  const palette = [
    new THREE.Color(0x075f63), // L1 · deep spruce
    new THREE.Color(0x008c8a), // L2 · surgical teal
    new THREE.Color(0x20beb8), // L3 · luminous aqua
    new THREE.Color(0x77d4c8), // L4 · cool mint
    new THREE.Color(0xe77d67)  // L5 · muted coral
  ];

  let componentColorByTriangle = null;
  if (colorByComponent) {
    const componentCount = triangleCenters.length;
    const parents = new Int32Array(componentCount);
    const ranks = new Uint8Array(componentCount);
    const vertexOwners = new Map();
    for (let triangle = 0; triangle < componentCount; triangle += 1) parents[triangle] = triangle;

    const find = (triangle) => {
      let root = triangle;
      while (parents[root] !== root) root = parents[root];
      while (parents[triangle] !== triangle) {
        const next = parents[triangle];
        parents[triangle] = root;
        triangle = next;
      }
      return root;
    };

    const union = (left, right) => {
      let leftRoot = find(left);
      let rightRoot = find(right);
      if (leftRoot === rightRoot) return;
      if (ranks[leftRoot] < ranks[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
      parents[rightRoot] = leftRoot;
      if (ranks[leftRoot] === ranks[rightRoot]) ranks[leftRoot] += 1;
    };

    for (let triangle = 0; triangle < componentCount; triangle += 1) {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const offset = triangle * 9 + vertex * 3;
        const key = `${positions[offset].toFixed(3)}:${positions[offset + 1].toFixed(3)}:${positions[offset + 2].toFixed(3)}`;
        const owner = vertexOwners.get(key);
        if (owner === undefined) vertexOwners.set(key, triangle);
        else union(triangle, owner);
      }
    }

    const components = new Map();
    for (let triangle = 0; triangle < componentCount; triangle += 1) {
      const root = find(triangle);
      const component = components.get(root) || { root, zTotal: 0, triangles: 0 };
      component.zTotal += triangleCenters[triangle];
      component.triangles += 1;
      components.set(root, component);
    }

    const orderedComponents = Array.from(components.values())
      .map((component) => ({ ...component, centerZ: component.zTotal / component.triangles }))
      .sort((left, right) => right.centerZ - left.centerZ);
    const colorByRoot = new Map(
      orderedComponents.map((component, index) => [component.root, palette[Math.min(index, palette.length - 1)]])
    );
    componentColorByTriangle = Array.from({ length: componentCount }, (_, triangle) => colorByRoot.get(find(triangle)));
  }

  for (let triangle = 0; triangle < triangleCenters.length; triangle += 1) {
    const normalizedHeight = (maxZ - triangleCenters[triangle]) / (maxZ - minZ);
    const level = Math.min(4, Math.max(0, Math.floor(normalizedHeight * 5)));
    const color = fixedColor || componentColorByTriangle?.[triangle] || palette[level];

    for (let vertex = 0; vertex < 3; vertex += 1) {
      const target = triangle * 9 + vertex * 3;
      colors[target] = color.r;
      colors[target + 1] = color.g;
      colors[target + 2] = color.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (center) geometry.center();
  geometry.computeBoundingSphere();
  return geometry;
};

const initializeSpine = async () => {
  if (!container) return;

  const canvas = container.querySelector('canvas');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isIPad = isIPadDevice;

  try {
    // Keep the substantial Three.js runtime off the critical loading path.
    // It is imported only when the model approaches the viewport.
    THREE = await import('../vendor/three.module.min.js');

    const lumbarUrl = new URL('../models/bodyparts3d-lumbar-vertebrae.stl', import.meta.url);
    const sacrumUrl = new URL('../models/bodyparts3d-sacrum.stl', import.meta.url);
    const [lumbarResponse, sacrumResponse] = await Promise.all([fetch(lumbarUrl), fetch(sacrumUrl)]);
    if (!lumbarResponse.ok) throw new Error(`Unable to load lumbar model: ${lumbarResponse.status}`);
    if (!sacrumResponse.ok) throw new Error(`Unable to load sacrum model: ${sacrumResponse.status}`);

    const lumbarGeometry = parseBinaryStl(await lumbarResponse.arrayBuffer(), {
      center: false,
      colorByComponent: true
    });
    // The source sacrum contains S1-S5. Keeping triangles above the S2/S3
    // boundary adds the sacral promontory and upper two segments requested.
    const sacrumGeometry = parseBinaryStl(await sacrumResponse.arrayBuffer(), {
      center: false,
      includeTriangle: (centerZ) => centerZ >= 866,
      fixedColor: new THREE.Color(0xf2b37f) // S1–S2 · warm apricot
    });

    const rendererOptions = { canvas, alpha: true, antialias: !isIPad };
    if (!isIPad) rendererOptions.powerPreference = 'high-performance';
    const renderer = new THREE.WebGLRenderer(rendererOptions);
    renderer.setPixelRatio(isIPad ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
    camera.position.set(2.8, 0.2, 8.1);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xd8fffc, 0x062829, 1.05));
    const keyLight = new THREE.DirectionalLight(0xc7fffb, 1.65);
    keyLight.position.set(4, 5, 6);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x00b9b6, 3.2, 20);
    fillLight.position.set(-4, 0, 3);
    scene.add(fillLight);
    const rimLight = new THREE.PointLight(0xee8d72, 2.1, 18);
    rimLight.position.set(3, -4, -3);
    scene.add(rimLight);

    const material = isIPad
      ? new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: 0x063f40,
        emissiveIntensity: 0.035,
        metalness: 0.02,
        roughness: 0.4
      })
      : new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        emissive: 0x063f40,
        emissiveIntensity: 0.04,
        metalness: 0.04,
        roughness: 0.34,
        clearcoat: 0.62,
        clearcoatRoughness: 0.24
      });

    const spine = new THREE.Group();
    const anatomy = new THREE.Group();
    const lumbar = new THREE.Mesh(lumbarGeometry, material);
    const upperSacrum = new THREE.Mesh(sacrumGeometry, material);
    anatomy.add(lumbar, upperSacrum);

    const anatomyBounds = new THREE.Box3()
      .union(lumbarGeometry.boundingBox)
      .union(sacrumGeometry.boundingBox);
    const anatomyCenter = anatomyBounds.getCenter(new THREE.Vector3());
    lumbar.position.sub(anatomyCenter);
    upperSacrum.position.sub(anatomyCenter);

    anatomy.scale.setScalar(0.0194);
    anatomy.rotation.x = -Math.PI / 2;
    spine.add(anatomy);
    scene.add(spine);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    container.classList.add('is-webgl-ready');

    // The rotation communicates that this is an actual 3D reconstruction, so
    // keep it running on touch devices as well. Respect reduced-motion by
    // slowing the movement substantially instead of freezing the model.
    const rotationSpeed = reduceMotion ? 0.11 : 0.42;
    let frameId = null;
    let previousTime = 0;
    let isInViewport = true;

    const render = (time = 0) => {
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      spine.rotation.y += delta * rotationSpeed;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };

    const updateRenderLoop = () => {
      const shouldRender = isInViewport && !document.hidden;
      if (shouldRender && frameId === null) {
        previousTime = performance.now();
        frameId = requestAnimationFrame(render);
      } else if (!shouldRender && frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isInViewport = entry.isIntersecting;
      updateRenderLoop();
    }, { rootMargin: '96px 0px' });
    visibilityObserver.observe(container);
    document.addEventListener('visibilitychange', updateRenderLoop);

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      isInViewport = false;
      updateRenderLoop();
      container.classList.remove('is-webgl-ready');
    });

    updateRenderLoop();
  } catch (error) {
    container.classList.remove('is-webgl-ready');
    console.error('The lumbar spine model could not be initialized.', error);
  }
};

const scheduleSpineInitialization = () => {
  if (!container) return;

  // WebKit on iPad can terminate the page's graphics process while this model
  // is initialized. Keep the lightweight image fallback on iPad and never
  // download Three.js or the STL geometry there.
  if (isIPadDevice) return;

  let started = false;
  const start = () => {
    if (started) return;
    started = true;

    const initialize = () => initializeSpine();
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(initialize, { timeout: 1200 });
    } else {
      window.setTimeout(initialize, 80);
    }
  };

  if (!('IntersectionObserver' in window)) {
    start();
    return;
  }

  const activationObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    activationObserver.disconnect();
    start();
  }, { rootMargin: '360px 0px' });

  activationObserver.observe(container);
};

scheduleSpineInitialization();

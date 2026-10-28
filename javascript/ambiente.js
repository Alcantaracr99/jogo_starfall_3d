import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Cria o fundo espacial, iluminacao, planetas e fenda de origem das naves inimigas.
export function createEnvironment(scene, camera) {
  scene.fog = new THREE.FogExp2(0x02040c, 0.012);
  new THREE.TextureLoader().load(
    'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2400&q=85',
    texture => { texture.colorSpace = THREE.SRGBColorSpace; scene.background = texture; },
    undefined,
    () => { scene.background = new THREE.Color(0x02040c); }
  );
  scene.backgroundIntensity = .28;

  scene.add(new THREE.HemisphereLight(0x86bfff, 0x080b1d, 1.6));
  const keyLight = new THREE.PointLight(0x62e8ff, 18, 60);
  keyLight.position.set(0, 8, 4);
  scene.add(keyLight);

  const starField = new THREE.Group();
  scene.add(starField);
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(900 * 3);
  for (let index = 0; index < starPositions.length; index += 3) {
    starPositions[index] = (Math.random() - .5) * 100;
    starPositions[index + 1] = (Math.random() - .5) * 70;
    starPositions[index + 2] = -Math.random() * 150;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starField.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xb8e8ff, size: .16, transparent: true, opacity: .9 })));

  const planets = new THREE.Group();
  scene.add(planets);
  const planetStyles = [
    { color: 0x4d8dcc, emissive: 0x0b254d },
    { color: 0xd36b4f, emissive: 0x4a160e },
    { color: 0x9b6cc7, emissive: 0x2e124c },
    { color: 0x58b89d, emissive: 0x0c3b35 }
  ];
  for (let index = 0; index < 7; index++) {
    const style = planetStyles[index % planetStyles.length];
    const radius = .8 + Math.random() * 2.2;
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshStandardMaterial({ color: style.color, emissive: style.emissive, emissiveIntensity: .45, roughness: .8 })
    );
    planet.position.set((Math.random() - .5) * 38, (Math.random() - .5) * 24, -28 - Math.random() * 105);
    planets.add(planet);
    if (index % 2 === 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.45, .06 + radius * .025, 8, 32),
        new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: .5 })
      );
      ring.rotation.x = Math.PI * .35;
      ring.rotation.z = Math.PI * .12;
      planet.add(ring);
    }
  }

  const rift = new THREE.Group();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const distance = (-62 - camera.position.z) / forward.z;
  rift.position.copy(camera.position).addScaledVector(forward, distance);
  rift.quaternion.copy(camera.quaternion);
  const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfWidth = halfHeight * camera.aspect;
  const riftHalfHeight = halfHeight * .065;
  const segments = 120;
  const upperEdge = [];
  const lowerEdge = [];
  for (let index = 0; index <= segments; index++) {
    const x = -halfWidth + (halfWidth * 2 * index) / segments;
    const progress = index / segments;
    const taper = Math.sin(progress * Math.PI) ** .55;
    const warp = Math.sin(progress * Math.PI * 9) * .055 + Math.sin(progress * Math.PI * 23) * .02;
    upperEdge.push(new THREE.Vector3(x, riftHalfHeight * (taper + warp), 0));
    lowerEdge.push(new THREE.Vector3(x, -riftHalfHeight * (taper - warp), 0));
  }
  const makeTearShape = (widthScale, heightScale) => {
    const shape = new THREE.Shape();
    shape.moveTo(upperEdge[0].x * widthScale, upperEdge[0].y * heightScale);
    upperEdge.slice(1).forEach(point => shape.lineTo(point.x * widthScale, point.y * heightScale));
    lowerEdge.slice().reverse().forEach(point => shape.lineTo(point.x * widthScale, point.y * heightScale));
    shape.closePath();
    return shape;
  };
  const depthLayers = [
    { width: .82, height: .72, z: -.35, color: 0x080717, opacity: .58 },
    { width: .61, height: .5, z: -.9, color: 0x05040f, opacity: .64 },
    { width: .38, height: .28, z: -1.65, color: 0x010208, opacity: .88 }
  ];
  depthLayers.slice().reverse().forEach(layer => {
    const tunnel = new THREE.Mesh(
      new THREE.ShapeGeometry(makeTearShape(layer.width, layer.height)),
      new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, side: THREE.DoubleSide, depthWrite: false })
    );
    tunnel.position.z = layer.z;
    rift.add(tunnel);
  });
  const tearShape = makeTearShape(1, 1);
  rift.add(new THREE.Mesh(
    new THREE.ShapeGeometry(tearShape),
    new THREE.MeshBasicMaterial({ color: 0x03030a, transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false })
  ));
  const addEdge = (points, color, opacity, width) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: width, blending: THREE.AdditiveBlending, depthWrite: false }));
    rift.add(line);
  };
  addEdge(upperEdge, 0x284b72, .58, 1);
  addEdge(lowerEdge, 0x49305f, .5, 1);
  depthLayers.forEach((layer, index) => {
    const upperDepthEdge = upperEdge.map(point => new THREE.Vector3(point.x * layer.width, point.y * layer.height, layer.z));
    const lowerDepthEdge = lowerEdge.map(point => new THREE.Vector3(point.x * layer.width, point.y * layer.height, layer.z));
    const edgeColor = index % 2 ? 0x28234d : 0x34224e;
    addEdge(upperDepthEdge, edgeColor, .38 - index * .06, 1);
    addEdge(lowerDepthEdge, edgeColor, .32 - index * .05, 1);
  });
  const riftLight = new THREE.PointLight(0x342653, 8, 30);
  riftLight.position.z = 1;
  rift.add(riftLight);
  scene.add(rift);

  return { rift, riftHalfWidth: halfWidth * .88, riftHalfHeight: riftHalfHeight * .72 };
}

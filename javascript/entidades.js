import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Modelos geometricos funcionais usados pelos inimigos e pela mira.
export function createPlayerShip() {
  const ship = new THREE.Group();
  const spriteMaterial = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(4, 4, 1);
  ship.add(sprite);

  const movementFrames = {};
  let currentFrame = '';
  let verticalAnimation = '';
  let verticalFrameTime = 0;
  ship.userData.setMovement = (horizontal, vertical, delta = 1) => {
    ship.userData.movement = { horizontal, vertical };
    let frame = null;
    if (vertical !== 0) {
      const direction = vertical > 0 ? 'up' : 'down';
      if (verticalAnimation !== direction) {
        verticalAnimation = direction;
        verticalFrameTime = 0;
      }
      if (direction === 'up') {
        frame = 'up';
      } else {
        verticalFrameTime += delta;
        if (verticalFrameTime >= .15) {
          verticalFrameTime %= .15;
        }
        frame = `down${Math.floor(verticalFrameTime / .075) + 1}`;
      }
    } else if (horizontal !== 0) {
      verticalAnimation = '';
      verticalFrameTime = 0;
      frame = horizontal < 0 ? 'left' : 'right';
    } else {
      verticalAnimation = '';
      verticalFrameTime = 0;
      frame = 'neutral';
    }
    if (frame && movementFrames[frame] && currentFrame !== frame) {
      currentFrame = frame;
      spriteMaterial.map = movementFrames[frame];
      spriteMaterial.needsUpdate = true;
    }
    const roll = horizontal * -.08;
    spriteMaterial.rotation += (roll - spriteMaterial.rotation) * Math.min(1, delta * 8);
  };
  ship.userData.setMovement(0, 0);

  new THREE.TextureLoader().load(
    new URL('../img/nave-principal.jpeg', import.meta.url).href,
    sheet => {
      const frameSize = 200;
      const makeFrame = (column, row) => {
        const canvas = document.createElement('canvas');
        canvas.width = frameSize;
        canvas.height = frameSize;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Não foi possível processar a spritesheet da nave.');
        context.drawImage(sheet.image, column * frameSize, row * frameSize, frameSize, frameSize, 0, 0, frameSize, frameSize);
        const pixels = context.getImageData(0, 0, frameSize, frameSize);
        for (let index = 0; index < pixels.data.length; index += 4) {
          const brightness = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
          pixels.data[index + 3] *= THREE.MathUtils.clamp((brightness - 5) / 20, 0, 1);
        }
        context.putImageData(pixels, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      };
      const frameCoordinates = {
        neutral: [2, 1],
        left: [2, 0],
        right: [5, 0],
        up: [2, 1],
        down1: [4, 3],
        down2: [5, 4]
      };
      Object.entries(frameCoordinates).forEach(([name, [column, row]]) => {
        movementFrames[name] = makeFrame(column, row);
      });
      const { horizontal, vertical } = ship.userData.movement;
      ship.userData.setMovement(horizontal, vertical);
      sheet.dispose();
    },
    undefined,
    error => console.error('Não foi possível carregar a spritesheet da nave.', error)
  );
  return ship;
}

export function createEnemyShip(bossVariant = -1) {
  const enemy = new THREE.Group();
  const bossPalettes = [
    { armor: 0x174d77, edge: 0x31e6ff, dark: 0x10283e, glow: 0x20cfff, core: 0x83f7ff },
    { armor: 0x5b235f, edge: 0xff70e1, dark: 0x311842, glow: 0xff45c7, core: 0xffb7f0 },
    { armor: 0x67501b, edge: 0xffdf55, dark: 0x392a12, glow: 0xffae24, core: 0xfff39a },
    { armor: 0x25532f, edge: 0x7dff74, dark: 0x18331e, glow: 0x4eff68, core: 0xc1ff8f },
    { armor: 0x67301d, edge: 0xff7652, dark: 0x3c1c19, glow: 0xff433e, core: 0xffc278 }
  ];
  const palette = bossVariant >= 0 ? bossPalettes[bossVariant % bossPalettes.length] : null;
  const armor = new THREE.MeshStandardMaterial({ color: palette?.armor ?? 0x421c68, metalness: .9, roughness: .18, emissive: palette?.dark ?? 0x5e0d75, emissiveIntensity: 1.7 });
  const armorEdge = new THREE.MeshStandardMaterial({ color: palette?.edge ?? 0xff3f75, metalness: .75, roughness: .16, emissive: palette?.glow ?? 0xb90b61, emissiveIntensity: 1.6 });
  const armorDark = new THREE.MeshStandardMaterial({ color: palette?.dark ?? 0x16132f, metalness: .8, roughness: .22, emissive: palette ? palette.dark : 0x250d47, emissiveIntensity: 1.3 });
  const orange = new THREE.MeshBasicMaterial({ color: palette?.core ?? 0xffc247, transparent: true, opacity: .98, blending: THREE.AdditiveBlending });
  const red = new THREE.MeshBasicMaterial({ color: palette?.glow ?? 0xff315f, transparent: true, opacity: .95, blending: THREE.AdditiveBlending });
  const hull = new THREE.Mesh(new THREE.ConeGeometry(.84, 3.15, 8), armor);
  hull.rotation.x = Math.PI / 2; enemy.add(hull);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(.3, 1.35, 5), armorEdge);
  dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(0, .38, .15); enemy.add(dorsal);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 10), new THREE.MeshStandardMaterial({ color: palette?.core ?? 0xff7d55, emissive: palette?.glow ?? 0xff183d, emissiveIntensity: 2.8, metalness: .35, roughness: .12 }));
  core.scale.set(1, .4, 1.35); core.position.set(0, .28, -.48); enemy.add(core);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, .2); wingShape.lineTo(2.15, .26); wingShape.lineTo(1.25, -.18); wingShape.lineTo(.2, -.55); wingShape.lineTo(0, -.15);
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: .18, bevelEnabled: true, bevelSize: .045, bevelThickness: .03, bevelSegments: 2 });
  const leftWing = new THREE.Mesh(wingGeometry, armorEdge); leftWing.position.set(.15, 0, .45); enemy.add(leftWing);
  const rightWing = new THREE.Mesh(wingGeometry, armorEdge); rightWing.scale.x = -1; rightWing.position.set(-.15, 0, .45); enemy.add(rightWing);
  [-1, 1].forEach(side => {
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(.1, .15, .7, 8), armorDark);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(side * 1.1, .12, -.15); enemy.add(cannon);
    const signal = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), red);
    signal.position.set(side * 1.1, .12, -.53); enemy.add(signal);
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.62, .08, 1.1), armorDark);
  panel.position.set(0, -.38, .35); panel.rotation.x = .12; enemy.add(panel);
  const engineGlow = new THREE.PointLight(palette?.glow ?? 0xff275e, 11, 12); engineGlow.position.z = 1.55; enemy.add(engineGlow);
  [-.34, .34].forEach(x => {
    const engineRing = new THREE.Mesh(new THREE.TorusGeometry(.28, .075, 8, 18), orange);
    engineRing.rotation.x = Math.PI / 2; engineRing.position.set(x, 0, 1.62); enemy.add(engineRing);
  });
  const warningLight = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 6), orange);
  warningLight.position.set(0, .45, .65); enemy.add(warningLight);
  if (bossVariant >= 0) {
    const addWing = (geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
      const wing = new THREE.Mesh(geometry, material);
      wing.position.set(...position);
      wing.rotation.set(...rotation);
      wing.scale.set(...scale);
      enemy.add(wing);
    };
    if (bossVariant === 0) {
      [-1, 1].forEach(direction => addWing(new THREE.ConeGeometry(.65, 2.1, 5), armorEdge, [direction * 1.65, .2, .2], [0, 0, direction * -.55]));
    } else if (bossVariant === 1) {
      [-1, 1].forEach(direction => addWing(new THREE.OctahedronGeometry(.9, 0), armorEdge, [direction * 2.15, 0, .1], [0, 0, Math.PI / 4]));
      addWing(new THREE.TorusGeometry(1.15, .1, 8, 24), orange, [0, .1, -.25], [Math.PI / 2, 0, 0], [1.7, 1, 1]);
    } else if (bossVariant === 2) {
      [-1, 1].forEach(direction => addWing(new THREE.BoxGeometry(1.35, .3, 2.1), armorEdge, [direction * 2, -.15, .3], [0, direction * .3, direction * -.2]));
      addWing(new THREE.OctahedronGeometry(.7, 1), orange, [0, .35, -.7]);
    } else if (bossVariant === 3) {
      [-1, 1].forEach(direction => {
        addWing(new THREE.ConeGeometry(.38, 2.8, 4), armorEdge, [direction * 1.55, .15, .15], [0, 0, direction * -.8]);
        addWing(new THREE.TorusGeometry(.42, .09, 8, 18), orange, [direction * .6, .1, .25], [Math.PI / 2, 0, 0]);
      });
    } else {
      [-1, 1].forEach(direction => {
        addWing(new THREE.DodecahedronGeometry(.72, 0), armorEdge, [direction * 2, .1, .1]);
        addWing(new THREE.ConeGeometry(.36, 1.7, 5), armorDark, [direction * 1.15, .45, -.35], [0, 0, direction * -.35]);
      });
      addWing(new THREE.TorusGeometry(1.1, .12, 8, 24), armorEdge, [0, 0, .55], [Math.PI / 2, 0, 0], [1.5, 1, 1]);
    }
  }
  return enemy;
}

export function createAimTarget() {
  const target = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x61f5ff, transparent: true, opacity: .9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.95, .045, 8, 32), material);
  ring.rotation.x = Math.PI / 2; target.add(ring);
  const marks = new THREE.Group();
  const markGeometry = new THREE.BoxGeometry(.55, .045, .045);
  [-1, 1].forEach(side => {
    const mark = new THREE.Mesh(markGeometry, material); mark.position.x = side * 2.25; marks.add(mark);
    const vertical = new THREE.Mesh(markGeometry, material); vertical.rotation.y = Math.PI / 2; vertical.position.z = side * 2.25; marks.add(vertical);
  });
  target.add(marks); target.userData.material = material;
  return target;
}

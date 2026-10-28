import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Modelos geometricos funcionais usados pelo jogador, inimigos e mira.
export function createPlayerShip() {
  const ship = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xd9f5ff, metalness: .95, roughness: .14, emissive: 0x176785, emissiveIntensity: 1.1 });
  const shadow = new THREE.MeshStandardMaterial({ color: 0x102244, metalness: .85, roughness: .2, emissive: 0x071b4b, emissiveIntensity: 1.1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x2d82ff, metalness: .7, roughness: .18, emissive: 0x124cff, emissiveIntensity: 1.4 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x73f8ff, transparent: true, opacity: .96, blending: THREE.AdditiveBlending });
  const magenta = new THREE.MeshBasicMaterial({ color: 0xff4fc3, transparent: true, opacity: .9, blending: THREE.AdditiveBlending });
  const body = new THREE.Mesh(new THREE.ConeGeometry(.78, 4.5, 8), silver);
  body.rotation.x = -Math.PI / 2; body.position.z = -.25; ship.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.45, 1.8, 8), silver);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -2.45; ship.add(nose);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(.2, .24, 3.25), accent);
  spine.position.set(0, .18, -.3); ship.add(spine);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, .18); wingShape.lineTo(2.65, .1); wingShape.lineTo(1.35, -.28); wingShape.lineTo(.48, -.58); wingShape.lineTo(0, -.2);
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: .2, bevelEnabled: true, bevelSize: .05, bevelThickness: .035, bevelSegments: 2 });
  const leftWing = new THREE.Mesh(wingGeometry, shadow); leftWing.position.set(.25, -.05, .45); ship.add(leftWing);
  const rightWing = new THREE.Mesh(wingGeometry, shadow); rightWing.scale.x = -1; rightWing.position.set(-.25, -.05, .45); ship.add(rightWing);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.14, .2, 3.15), cyan);
  blade.position.set(1.2, .06, .02); blade.rotation.y = -.2; ship.add(blade);
  const otherBlade = blade.clone(); otherBlade.position.x = -1.05; otherBlade.rotation.y = .18; ship.add(otherBlade);
  const wingTip = new THREE.Mesh(new THREE.BoxGeometry(.18, .12, .7), magenta);
  wingTip.position.set(2.05, .06, .38); wingTip.rotation.y = -.2; ship.add(wingTip);
  const otherWingTip = wingTip.clone(); otherWingTip.position.x = -2.05; otherWingTip.rotation.y = .2; ship.add(otherWingTip);
  const cockpitMaterial = new THREE.MeshStandardMaterial({ color: 0xb2ffff, emissive: 0x19d9ff, emissiveIntensity: 2.8, metalness: .55, roughness: .1 });
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.5, 24, 14), cockpitMaterial);
  cockpit.scale.set(1, .42, 1.6); cockpit.position.set(0, .4, -.72); ship.add(cockpit);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(.5, .045, 8, 24), magenta);
  canopyFrame.rotation.x = Math.PI / 2; canopyFrame.position.set(0, .4, -.72); canopyFrame.scale.z = 1.35; ship.add(canopyFrame);
  [-.3, .3].forEach(x => {
    const thruster = new THREE.Mesh(new THREE.TorusGeometry(.28, .08, 8, 18), cyan);
    thruster.rotation.x = Math.PI / 2; thruster.position.set(x, 0, 1.92); ship.add(thruster);
  });
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(.2, .34, .5, 12), magenta);
  engine.rotation.x = Math.PI / 2; engine.position.z = 2.02; ship.add(engine);
  const glow = new THREE.PointLight(0x25dfff, 12, 13); glow.position.z = 1.7; ship.add(glow);
  const sideLight = new THREE.PointLight(0xff4fc3, 3, 5); sideLight.position.set(1.2, .1, .2); ship.add(sideLight);
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

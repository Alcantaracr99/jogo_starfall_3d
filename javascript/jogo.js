import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { criarAmbiente } from './ambiente.js';
import { criarMira } from './entidades.js';
import { criarNaveInimiga, atualizarVistaInimigo } from './inimigos_sprites.js';
import { criarNaveJogador, atualizarVistaNaveJogador, gerarExplosaoNave, atualizarExplosoesNave } from './nave_principal.js';

// ---------------------------------------------------------------------------
// Inicializacao da cena e estado persistente da campanha.
// ---------------------------------------------------------------------------
    const canvas = document.querySelector('#game');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 220);
    camera.position.set(0, 4, 16);
    camera.lookAt(0, 0, -20);
    const { rift, riftHalfWidth, riftHalfHeight } = criarAmbiente(scene, camera);
    // Entidades ativas e parametros fixos de gameplay.
    const ship = criarNaveJogador(); ship.scale.setScalar(.65); ship.position.set(0, 0, 7); ship.visible = false; scene.add(ship);
    const target = criarMira(); ship.add(target); target.position.z = -10.5; target.scale.setScalar(.36);
    const keys = {}; const enemies = []; const shots = []; const enemyShots = []; const missiles = []; const effects = [];
    const levelTargets = [50, 70, 90, 110, 130, 150, 170, 190, 210, 230];
    const laserKillRequirement = 50, missileKillRequirement = 15;
    const smallEnemyMinSpeed = 8, smallEnemyMaxSpeed = 15;
    const enemyBaseSpeed = (smallEnemyMinSpeed + smallEnemyMaxSpeed) / 2;
    const bossScale = 2;
    const enemyShotHitRadius = 1.6;
    const bossShotHitRadius = 1.2;
    const bossDifficulty = [
      { health: 30, speedMultiplier: 3.75, shotInterval: 1000, spawnInterval: 2100 },
      { health: 40, speedMultiplier: 4.5, shotInterval: 900, spawnInterval: 1900 },
      { health: 50, speedMultiplier: 5.25, shotInterval: 800, spawnInterval: 1700 },
      { health: 60, speedMultiplier: 6, shotInterval: 700, spawnInterval: 1500 },
      { health: 70, speedMultiplier: 6.75, shotInterval: 600, spawnInterval: 1300 }
    ];
    const savedCampaign = JSON.parse(localStorage.getItem('starfall-campaign') || 'null');
    if (savedCampaign !== null && (typeof savedCampaign !== 'object' || Array.isArray(savedCampaign) || !Number.isInteger(savedCampaign.unlockedLevel) || savedCampaign.unlockedLevel < 1 || savedCampaign.unlockedLevel > levelTargets.length)) {
      throw new Error('O progresso salvo da campanha est\u00e1 inv\u00e1lido.');
    }
    const levelStars = savedCampaign ? savedCampaign.levelStars : JSON.parse(localStorage.getItem('starfall-level-stars') || '{}');
    if (!levelStars || typeof levelStars !== 'object' || Array.isArray(levelStars) || Object.entries(levelStars).some(([level, stars]) => !Number.isInteger(Number(level)) || Number(level) < 1 || Number(level) > levelTargets.length || !Number.isInteger(stars) || stars < 0 || stars > 3)) {
      throw new Error('O registro de estrelas das miss\u00f5es est\u00e1 inv\u00e1lido.');
    }
    let score = 0, lives = 3, hitsTaken = 0, missionShotHits = 0, directImpacts = 0, laserCharge = 0, missileCharge = 0, levelKills = 0, currentLevel = 1, unlockedLevel = savedCampaign ? savedCampaign.unlockedLevel : 1, running = false, paused = false, lastSpawn = 0, lastShot = 0, laser = null, boss = null, damageBlink = null;
    let transitionTimer = null;
    const clock = new THREE.Clock();
    const scoreElement = document.querySelector('#score');
    const objectiveCount = document.querySelector('#objective-count');
    const livesElement = document.querySelector('#lives');
    const message = document.querySelector('#message');
    const messageText = message.querySelector('p');
    const startButton = document.querySelector('#start');
    const lossActions = document.querySelector('#loss-actions');
    const saveCampaignButton = document.querySelector('#save-campaign');
    const returnMissionsButton = document.querySelector('#return-missions');
    const closeGameButton = document.querySelector('#close-game');
    const pauseMenu = document.querySelector('#pause-menu');
    const resumeGameButton = document.querySelector('#resume-game');
    const mainMenuButton = document.querySelector('#main-menu');
    const exitGameButton = document.querySelector('#exit-game');
    const gameHud = document.querySelector('#game-hud');
    const controls = document.querySelector('#controls');
    const special = document.querySelector('#special');
    const sceneTransition = document.querySelector('#scene-transition');
    const levelMap = document.querySelector('#level-map');
    const bossHud = document.querySelector('#boss-hud');
    const bossFill = document.querySelector('#boss-fill');
    const specialCount = document.querySelector('#special-count');
    const specialFill = document.querySelector('#special-fill');
    const missileSpecial = document.querySelector('#missile-special');
    const missileCount = document.querySelector('#missile-count');
    const missileFill = document.querySelector('#missile-fill');
    const aim = document.querySelector('#aim');
    let shotSequence = 0;
    // ---- Interface e audio -------------------------------------------------
    // Sons ficam na pasta snd, relativa a este modulo.
    const shotSound = new Audio(new URL('../snd/tiro.mp3', import.meta.url));
    const actionMusic = new Audio(new URL('../snd/musica-acao.mp3', import.meta.url));
    const explosionSounds = Array.from({ length: 8 }, () => {
      const audio = new Audio(new URL('../snd/explosao.mp3', import.meta.url));
      audio.preload = 'auto';
      audio.volume = .45;
      return audio;
    });
    let explosionSequence = 0;
    shotSound.volume = .3;
    actionMusic.loop = true;
    actionMusic.volume = .24;
    const aimPosition = new THREE.Vector3();
      const screenCorner = new THREE.Vector3();
      const screenRay = new THREE.Vector3();
      const screenBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

      // ---- Limites de tela e movimentacao de chefes -------------------------
      function keepObjectOnScreen(position, paddingX, paddingY) {
        const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        screenBounds.minX = Infinity; screenBounds.maxX = -Infinity;
        screenBounds.minY = Infinity; screenBounds.maxY = -Infinity;
        corners.forEach(([x, y]) => {
          screenCorner.set(x, y, .5).unproject(camera);
          screenRay.copy(screenCorner).sub(camera.position);
          const distance = (position.z - camera.position.z) / screenRay.z;
          const point = camera.position.clone().addScaledVector(screenRay, distance);
          screenBounds.minX = Math.min(screenBounds.minX, point.x);
          screenBounds.maxX = Math.max(screenBounds.maxX, point.x);
          screenBounds.minY = Math.min(screenBounds.minY, point.y);
          screenBounds.maxY = Math.max(screenBounds.maxY, point.y);
        });
        position.x = THREE.MathUtils.clamp(position.x, screenBounds.minX + paddingX, screenBounds.maxX - paddingX);
        position.y = THREE.MathUtils.clamp(position.y, screenBounds.minY + paddingY, screenBounds.maxY - paddingY);
      }

      function chooseBossDestination(mesh) {
        const boundsProbe = new THREE.Vector3(0, 0, mesh.position.z);
        keepObjectOnScreen(boundsProbe, 0, 0);
        const bounds = { ...screenBounds };
        const box = new THREE.Box3().setFromObject(mesh);
        const halfWidth = (box.max.x - box.min.x) / 2;
        const halfHeight = (box.max.y - box.min.y) / 2;
        const shotCorridorX = 1.8;
        const shotCorridorY = 1.35;
        let minX = Math.max(bounds.minX + halfWidth, ship.position.x - shotCorridorX);
        let maxX = Math.min(bounds.maxX - halfWidth, ship.position.x + shotCorridorX);
        let minY = Math.max(bounds.minY + halfHeight, ship.position.y - shotCorridorY);
        let maxY = Math.min(bounds.maxY - halfHeight, ship.position.y + shotCorridorY);
        if (minX > maxX) minX = maxX = THREE.MathUtils.clamp(ship.position.x, bounds.minX + halfWidth, bounds.maxX - halfWidth);
        if (minY > maxY) minY = maxY = THREE.MathUtils.clamp(ship.position.y, bounds.minY + halfHeight, bounds.maxY - halfHeight);
        return new THREE.Vector3(THREE.MathUtils.randFloat(minX, maxX), THREE.MathUtils.randFloat(minY, maxY), mesh.position.z);
      }

    // HUD, audio e controles de combate.
    // ---- HUD, audio e disparos ---------------------------------------------
    function updateHud() {
      scoreElement.textContent = String(score).padStart(6, '0');
      objectiveCount.textContent = boss ? 'CHEFE' : `${Math.min(levelKills, levelTargets[currentLevel - 1])}/${levelTargets[currentLevel - 1]}`;
      livesElement.textContent = '\u2665 '.repeat(Math.max(0, lives)).trim();
      specialCount.textContent = `${Math.min(laserKillRequirement, laserCharge)}/${laserKillRequirement}`;
      specialFill.style.width = `${Math.min(100, laserCharge / laserKillRequirement * 100)}%`;
      special.classList.toggle('ready', laserCharge >= laserKillRequirement);
      missileCount.textContent = `${Math.min(missileKillRequirement, missileCharge)}/${missileKillRequirement}`;
      missileFill.style.width = `${Math.min(100, missileCharge / missileKillRequirement * 100)}%`;
      missileSpecial.classList.toggle('ready', missileCharge >= missileKillRequirement);
    }
    function playSound(audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    function playExplosionSound() {
      const sound = explosionSounds[explosionSequence++ % explosionSounds.length];
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
    function startMusic() {
      if (actionMusic.paused) actionMusic.play().catch(() => {});
    }
    function makeEnergyShot(color, enemy = false) {
      const mesh = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .96, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.Mesh(new THREE.SphereGeometry(enemy ? .18 : .22, 12, 8), material);
      const streak = new THREE.Mesh(new THREE.CylinderGeometry(enemy ? .045 : .06, enemy ? .09 : .12, enemy ? .9 : 1.35, 10), material);
      streak.rotation.x = Math.PI / 2;
      streak.position.z = enemy ? .45 : .68;
      const flare = new THREE.Mesh(new THREE.TorusGeometry(enemy ? .24 : .32, .025, 6, 16), material);
      flare.rotation.x = Math.PI / 2;
      flare.position.z = enemy ? .15 : .35;
      mesh.add(core, streak, flare);
      return mesh;
    }
    function fire() {
      const now = performance.now(); if (!running || paused || now - lastShot < 120) return; lastShot = now;
      const colors = [0x61f5ff, 0xff4f9a, 0xfff36b, 0x9b6cff];
      const mesh = makeEnergyShot(colors[shotSequence++ % colors.length]);
      mesh.position.copy(ship.position); mesh.position.z -= 1.9; scene.add(mesh);
      target.getWorldPosition(aimPosition);
      const direction = aimPosition.clone().sub(mesh.position).normalize();
      shots.push({ mesh, speed: 46, direction });
      playSound(shotSound);
    }
    function enemyFire(enemy) {
      const mesh = makeEnergyShot(0xff596f, true);
      mesh.position.copy(enemy.mesh.position); mesh.position.z += 1.2; scene.add(mesh);
      enemyShots.push({ mesh, speed: 20 });
      playSound(shotSound);
    }
    function makeGuidedMissile() {
      const mesh = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b35, emissive: 0xb91f24, emissiveIntensity: 1.8, metalness: .55, roughness: .22 });
      const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xfff36b, transparent: true, opacity: .95, blending: THREE.AdditiveBlending });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.11, .18, .72, 8), bodyMaterial);
      body.rotation.x = Math.PI / 2;
      mesh.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(.18, .34, 8), bodyMaterial);
      nose.rotation.x = -Math.PI / 2;
      nose.position.z = -.52;
      mesh.add(nose);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.12, .38, 8), flameMaterial);
      flame.rotation.x = Math.PI / 2;
      flame.position.z = .52;
      mesh.add(flame);
      return mesh;
    }
    function fireMissileBarrage() {
      if (!running || paused || missileCharge < missileKillRequirement || missiles.length || (!enemies.length && !boss)) return;
      missileCharge = 0;
      const targets = enemies.slice().sort((first, second) => first.mesh.position.z - second.mesh.position.z);
      if (boss) targets.push(boss);
      for (let index = 0; index < 6; index++) {
        const mesh = makeGuidedMissile();
        mesh.position.copy(ship.position);
        mesh.position.x += (index - 2.5) * .18;
        mesh.position.z -= 1.7;
        scene.add(mesh);
        missiles.push({ mesh, target: targets[index % targets.length], direction: new THREE.Vector3(0, 0, -1), speed: 23 + index * .8, life: 4 });
      }
      playSound(shotSound);
      updateHud();
    }
    function fireLaser() {
      if (!running || paused || laserCharge < laserKillRequirement || laser) return;
      laserCharge = 0;
      const mesh = new THREE.Group();
      const colors = [0x61f5ff, 0xff4f9a, 0xfff36b, 0x9b6cff];
      mesh.position.copy(ship.position);
      for (let index = 0; index < 12; index++) {
        const material = new THREE.MeshBasicMaterial({
          color: colors[index % colors.length],
          transparent: true,
          opacity: .92,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const segment = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 3.05, 12), material);
        const angle = index * Math.PI / 3;
        segment.position.set(Math.cos(angle) * .16, Math.sin(angle) * .16, -1.5 - index * 3);
        segment.rotation.x = Math.PI / 2;
        mesh.add(segment);
      }
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(.1, .1, 36, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      core.rotation.x = Math.PI / 2;
      core.position.z = -18;
      mesh.add(core);
      const muzzle = new THREE.Mesh(
        new THREE.TorusGeometry(.42, .055, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff36b, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.z = -.5;
      mesh.add(muzzle);
      scene.add(mesh);
      laser = { mesh, life: .42 };
      for (let index = enemies.length - 1; index >= 0; index--) {
        const enemy = enemies[index];
        const inHorizon = enemy.mesh.position.z < ship.position.z && enemy.mesh.position.z > -65;
        if (inHorizon) {
          explode(enemy.mesh.position, 0xfff36b);
          scene.remove(enemy.mesh);
          enemies.splice(index, 1);
          score += 10;
          registerObjectiveKill();
        }
      }
      updateHud();
    }
    // ---- Fluxo de abertura, mapa, niveis e chefes ---------------------------
    function renderMap() {
      levelMap.innerHTML = levelTargets.map((target, index) => {
        const level = index + 1;
        const locked = level > unlockedLevel;
        const completed = level < unlockedLevel;
        const bossLabel = level % 2 === 0 ? ' + CHEFE' : '';
        const stars = levelStars[level] || 0;
        const starIcons = Array.from({ length: 3 }, (_, starIndex) => `<span class="${starIndex < stars ? 'earned' : ''}">${starIndex < stars ? '\u2605' : '\u2606'}</span>`).join('');
        return `<div class="mission-entry"><div class="mission-stars" role="img" aria-label="${stars} de 3 estrelas">${starIcons}</div><button class="level-button ${locked ? '' : 'unlocked'} ${completed ? 'completed' : ''}" data-level="${level}" ${locked ? 'disabled' : ''}>NÍVEL ${level}<br><small>${target} ALVOS${bossLabel}</small></button></div>`;
      }).join('');
      levelMap.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => startLevel(Number(button.dataset.level))));
    }
    function showMap(title = 'MAPA DE MISSÕES', text = 'Escolha uma rota para continuar a campanha.', delay = 280) {
      if (transitionTimer) clearTimeout(transitionTimer);
      lossActions.classList.add('hidden');
      pauseMenu.classList.add('hidden');
      sceneTransition.classList.add('active');
      message.classList.add('screen-fade');
      transitionTimer = setTimeout(() => {
        running = false;
        ship.visible = false;
        gameHud.classList.add('hidden');
        special.classList.add('hidden');
        aim.classList.add('hidden');
        missileSpecial.classList.add('hidden');
        controls.classList.remove('hidden');
        bossHud.classList.add('hidden');
        message.querySelector('h1').textContent = title;
        message.querySelector('h1').classList.toggle('loss', title === 'VOC\u00ca PERDEU!');
        message.querySelector('p').textContent = text;
        startButton.classList.add('hidden');
        levelMap.classList.remove('hidden');
        message.classList.remove('hidden');
        renderMap();
        requestAnimationFrame(() => { sceneTransition.classList.remove('active'); message.classList.remove('screen-fade'); });
      }, delay);
    }
    function clearBattlefield(keepEffects = false) {
      enemies.splice(0).forEach(item => scene.remove(item.mesh));
      shots.splice(0).forEach(item => scene.remove(item.mesh));
      enemyShots.splice(0).forEach(item => scene.remove(item.mesh));
      missiles.splice(0).forEach(item => scene.remove(item.mesh));
      if (!keepEffects) effects.splice(0).forEach(item => scene.remove(item.mesh));
      if (laser) { scene.remove(laser.mesh); laser = null; }
      if (boss) { scene.remove(boss.mesh); boss = null; }
    }
    function startLevel(level) {
      if (transitionTimer) clearTimeout(transitionTimer);
      sceneTransition.classList.add('active');
      message.classList.add('screen-fade');
      transitionTimer = setTimeout(() => {
        clearBattlefield();
        currentLevel = level; levelKills = 0; missileCharge = 0; score = level === 1 ? 0 : score; lives = 3; hitsTaken = 0; missionShotHits = 0; directImpacts = 0; damageBlink = null;
        clearKeys(); running = true; paused = false; startMusic(); ship.position.set(0, 0, 7); ship.visible = true; lastSpawn = performance.now();
        levelMap.classList.add('hidden'); startButton.classList.add('hidden'); message.classList.add('hidden'); gameHud.classList.remove('hidden'); special.classList.remove('hidden'); missileSpecial.classList.remove('hidden'); aim.classList.remove('hidden'); controls.classList.add('hidden'); bossHud.classList.add('hidden'); updateHud();
        pauseMenu.classList.add('hidden');
        lossActions.classList.add('hidden');
        requestAnimationFrame(() => { sceneTransition.classList.remove('active'); message.classList.remove('screen-fade'); });
      }, 280);
    }
    function completeLevel() {
      running = false;
      clearBattlefield(true);
      bossHud.classList.add('hidden');
      const earnedStars = lives === 1 ? 1 : missionShotHits === 0 ? 3 : lives === 2 && missionShotHits === 2 ? 2 : 1;
      levelStars[currentLevel] = Math.max(levelStars[currentLevel] || 0, earnedStars);
      unlockedLevel = Math.max(unlockedLevel, Math.min(10, currentLevel + 1));
      saveCampaign(false);
      const finished = currentLevel === 10;
      showMap(finished ? 'CAMPANHA CONCLU\u00cdDA' : `N\u00cdVEL ${currentLevel} CONCLU\u00cdDO`, finished ? 'Voc\u00ea dominou toda a rota estelar.' : `PR\u00d3XIMO N\u00cdVEL: ${currentLevel + 1}. Prepare-se para a pr\u00f3xima miss\u00e3o.`, currentLevel % 2 === 0 ? 2500 : 280);
    }
    function getRiftSpawnPosition(depth) {
      return rift.localToWorld(new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(riftHalfWidth),
        THREE.MathUtils.randFloatSpread(riftHalfHeight),
        depth
      ));
    }
    function startBoss() {
      if (boss) return;
      const bossIndex = currentLevel / 2 - 1;
      const difficulty = bossDifficulty[bossIndex];
      const mesh = criarNaveInimiga(bossIndex);
      mesh.scale.setScalar(bossScale);
      mesh.position.copy(getRiftSpawnPosition(14));
      scene.add(mesh);
      boss = {
        mesh,
        health: difficulty.health,
        maxHealth: difficulty.health,
        moveSpeed: enemyBaseSpeed * difficulty.speedMultiplier,
        shotInterval: difficulty.shotInterval,
        spawnInterval: difficulty.spawnInterval,
        moveTarget: null,
        nextMove: performance.now() + 300,
        nextShot: performance.now() + difficulty.shotInterval,
        nextSpawn: performance.now() + difficulty.spawnInterval
      };
      bossHud.classList.remove('hidden');
      bossFill.style.width = '100%';
      updateHud();
    }
    function registerObjectiveKill() {
      if (!running || boss || levelKills >= levelTargets[currentLevel - 1]) return;
      levelKills++;
      if (levelKills >= levelTargets[currentLevel - 1]) {
        if (currentLevel % 2 === 0) startBoss();
        else completeLevel();
      }
      updateHud();
    }
    function registerKill() {
      if (!running) return;
      laserCharge = Math.min(laserKillRequirement, laserCharge + 1);
      missileCharge = Math.min(missileKillRequirement, missileCharge + 1);
      registerObjectiveKill();
    }
    // ---- Efeitos visuais, inimigos e dano ao jogador ------------------------
    function explode(position, color = 0xff6a53, duration = .55) {
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a1, transparent: true }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .06, 8, 20), new THREE.MeshBasicMaterial({ color, transparent: true }));
      ring.rotation.x = Math.PI / 2;
      mesh.add(core, ring);
      for (let index = 0; index < 8; index++) {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
        const angle = index * Math.PI / 4;
        spark.position.set(Math.cos(angle) * .65, Math.sin(angle) * .65, (index % 2 ? .2 : -.2));
        mesh.add(spark);
      }
      mesh.position.copy(position); scene.add(mesh); effects.push({ mesh, life: duration, max: duration });
      playExplosionSound();
    }
    function updateEffects(delta) {
      effects.forEach((effect, index) => {
        effect.life -= delta;
        const scale = 1 + (1 - effect.life / effect.max) * 5;
        effect.mesh.scale.setScalar(scale);
        effect.mesh.traverse(child => { if (child.material) child.material.opacity = Math.max(0, effect.life / effect.max); });
        if (effect.life <= 0) { scene.remove(effect.mesh); effects.splice(index, 1); }
      });
    }
    function spawnEnemy() {
      const mesh = criarNaveInimiga();
      mesh.position.copy(getRiftSpawnPosition(7));
      scene.add(mesh);
      const routeAngle = Math.random() * Math.PI * 2;
      const routeDistance = 2.2 + Math.random() * .8;
      enemies.push({
        mesh,
        speed: smallEnemyMinSpeed + Math.random() * (smallEnemyMaxSpeed - smallEnemyMinSpeed),
        driftX: (Math.random() - .5) * 3.2,
        driftY: (Math.random() - .5) * 2.6,
        routeOffsetX: Math.cos(routeAngle) * routeDistance,
        routeOffsetY: Math.sin(routeAngle) * routeDistance,
        nextDrift: performance.now() + 350 + Math.random() * 500,
        nextShot: performance.now() + 900 + Math.random() * 1500
      });
    }
    function startDamageBlink(loseLifeAfter = false) {
      damageBlink = { toggles: 6, timer: 0, loseLifeAfter };
      ship.visible = true;
    }
    function loseLife(missionLost = false) {
      if (!running || lives <= 0) return;
      damageBlink = null;
      const finalLife = lives === 1;
      lives = Math.max(0, lives - 1);
      hitsTaken = 0;
      updateHud();
      const terminalExplosion = missionLost || finalLife;
      explode(ship.position, terminalExplosion ? 0xff315f : 0x55eaff, terminalExplosion ? 2 : .55);
      gerarExplosaoNave(scene, ship.position, terminalExplosion);
      ship.visible = false;
      if (terminalExplosion) {
        endGame();
        return;
      }
      setTimeout(() => {
        if (running && lives > 0) { ship.visible = true; ship.position.set(0, 0, 7); }
      }, 550);
    }
    function registerDirectImpact() {
      if (!running || !ship.visible || damageBlink) return;
      directImpacts++;
      loseLife(directImpacts >= 3);
    }
    function endGame() {
      if (!running) return;
      running = false;
      paused = false;
      clearKeys();
      pauseMenu.classList.add('hidden');
      ship.visible = false;
      gameHud.classList.add('hidden');
      special.classList.add('hidden');
      missileSpecial.classList.add('hidden');
      aim.classList.add('hidden');
      controls.classList.add('hidden');
      const title = message.querySelector('h1');
      title.textContent = 'VOC\u00ca PERDEU!';
      title.classList.add('loss');
      message.querySelector('p').textContent = `Pontua\u00e7\u00e3o final: ${score}`;
      startButton.classList.add('hidden');
      lossActions.classList.add('hidden');
      levelMap.classList.add('hidden');
      message.classList.remove('hidden');
      transitionTimer = setTimeout(() => {
        transitionTimer = null;
        messageText.textContent = `Pontua\u00e7\u00e3o final: ${score}. Voc\u00ea pode salvar seu progresso ou voltar \u00e0s miss\u00f5es.`;
        lossActions.classList.remove('hidden');
      }, 2000);
    }
    // ---- Persistencia e controles de estado --------------------------------
    function saveCampaign(showStatus = true) {
      try {
        localStorage.setItem('starfall-campaign', JSON.stringify({ unlockedLevel, levelStars }));
        if (showStatus) messageText.textContent = 'Campanha salva neste dispositivo.';
        return true;
      } catch (error) {
        console.error('N\u00e3o foi poss\u00edvel salvar a campanha.', error);
        if (showStatus) messageText.textContent = 'N\u00e3o foi poss\u00edvel salvar a campanha neste navegador.';
        return false;
      }
    }
    // Entrada do jogador, redimensionamento e loop principal.
    startButton.addEventListener('click', () => showMap());
    function clearKeys() {
      Object.keys(keys).forEach(key => { keys[key] = false; });
    }
    function setPaused(value) {
      if (!running || paused === value) return;
      paused = value;
      clearKeys();
      pauseMenu.classList.toggle('hidden', !paused);
      if (paused) actionMusic.pause();
      else startMusic();
    }
    function returnToMainMenu() {
      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = null;
      running = false;
      paused = false;
      clearKeys();
      clearBattlefield();
      ship.visible = false;
      actionMusic.pause();
      gameHud.classList.add('hidden');
      special.classList.add('hidden');
      missileSpecial.classList.add('hidden');
      aim.classList.add('hidden');
      controls.classList.add('hidden');
      bossHud.classList.add('hidden');
      pauseMenu.classList.add('hidden');
      levelMap.classList.add('hidden');
      lossActions.classList.add('hidden');
      message.querySelector('h1').textContent = 'STARFALL';
      message.querySelector('h1').classList.remove('loss');
      message.querySelector('p').textContent = 'Uma nova dimensão para a sua missão.';
      startButton.textContent = 'Abrir mapa';
      startButton.classList.remove('hidden');
      message.classList.remove('hidden', 'screen-fade');
      sceneTransition.classList.remove('active');
    }
    function exitGame() {
      actionMusic.pause();
      window.close();
    }
    resumeGameButton.addEventListener('click', () => setPaused(false));
    mainMenuButton.addEventListener('click', returnToMainMenu);
    exitGameButton.addEventListener('click', exitGame);
    saveCampaignButton.addEventListener('click', () => saveCampaign());
    returnMissionsButton.addEventListener('click', () => showMap('MAPA DE MISSÕES', 'Escolha uma rota para continuar a campanha.'));
    closeGameButton.addEventListener('click', exitGame);
    addEventListener('keydown', event => {
      if (event.code === 'Enter' && running) {
        event.preventDefault();
        if (!event.repeat) setPaused(!paused);
        return;
      }
      if (!running || paused) return;
      keys[event.key.toLowerCase()] = true;
      if (event.code === 'Space') { keys.space = true; event.preventDefault(); fire(); }
      if (event.code === 'KeyX') fireLaser();
      if (event.key.toLowerCase() === 'c') fireMissileBarrage();
    });
    addEventListener('pointerdown', startMusic, { once: true });
    addEventListener('keydown', startMusic, { once: true });
    addEventListener('keyup', event => { keys[event.key.toLowerCase()] = false; if (event.code === 'Space') keys.space = false; });
    addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

    // ---- Game loop -----------------------------------------------------------
    // A ordem abaixo e intencional: entrada, movimento, colisoes, efeitos e HUD.
    function animate() {
      requestAnimationFrame(animate); const delta = Math.min(clock.getDelta(), .05); const now = performance.now();
      rift.rotation.z = Math.sin(now * .00035) * .025;
      if (running && !paused) {
        if (keys.space) fire();
        const horizontal = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
        const vertical = (keys.arrowup || keys.w ? 1 : 0) - (keys.arrowdown || keys.s ? 1 : 0);
        if (damageBlink) {
          damageBlink.timer -= delta;
          if (damageBlink.timer <= 0) {
            ship.visible = !ship.visible;
            damageBlink.toggles--;
            damageBlink.timer = .1;
            if (damageBlink.toggles <= 0) {
              const loseLifeAfterBlink = damageBlink.loseLifeAfter;
              ship.visible = true;
              damageBlink = null;
              if (loseLifeAfterBlink) loseLife();
            }
          }
        }
        ship.position.x += horizontal * delta * 14;
        ship.position.y += vertical * delta * 11;
        keepObjectOnScreen(ship.position, 1.2, .7);
        ship.rotation.z += (horizontal * -.08 - ship.rotation.z) * delta * 8;
        atualizarVistaNaveJogador(ship, camera, delta);
        target.rotation.z -= delta * 1.6;
        target.getWorldPosition(aimPosition);
        aimPosition.project(camera);
        aim.style.left = `${(aimPosition.x * .5 + .5) * innerWidth}px`;
        aim.style.top = `${(-aimPosition.y * .5 + .5) * innerHeight}px`;
        const alignedEnemy = enemies.some(enemy => {
          const dx = Math.abs(enemy.mesh.position.x - ship.position.x);
          const dy = Math.abs(enemy.mesh.position.y - ship.position.y);
          const forwardDistance = ship.position.z - enemy.mesh.position.z;
          return forwardDistance > 0 && forwardDistance < 22 && dx < 1.45 && dy < 1.45;
        });
        aim.classList.toggle('alert', alignedEnemy);
        target.userData.material.color.set(alignedEnemy ? 0xff315f : 0x61f5ff);
        target.userData.material.opacity = alignedEnemy ? .98 : .72;
        if (!boss && levelKills < levelTargets[currentLevel - 1] && now - lastSpawn > Math.max(360, 850 - score * 2)) { spawnEnemy(); lastSpawn = now; }
        for (let index = shots.length - 1; index >= 0; index--) {
          const shot = shots[index];
          shot.mesh.position.addScaledVector(shot.direction, shot.speed * delta);
          if (shot.mesh.position.z < -65) { scene.remove(shot.mesh); shots.splice(index, 1); }
        }
        for (let missileIndex = missiles.length - 1; missileIndex >= 0; missileIndex--) {
          const missile = missiles[missileIndex];
          missile.life -= delta;
          const targetIsActive = missile.target && missile.target.mesh.parent;
          if (!targetIsActive) {
            const nextTarget = enemies.slice().sort((first, second) => first.mesh.position.distanceTo(missile.mesh.position) - second.mesh.position.distanceTo(missile.mesh.position))[0] || boss;
            missile.target = nextTarget;
          }
          if (missile.target && missile.target.mesh.parent) {
            const desiredDirection = missile.target.mesh.position.clone().sub(missile.mesh.position).normalize();
            missile.direction.lerp(desiredDirection, Math.min(1, delta * 7)).normalize();
            missile.mesh.lookAt(missile.mesh.position.clone().add(missile.direction));
          }
          missile.mesh.position.addScaledVector(missile.direction, missile.speed * delta);
          const targetDistance = missile.target && missile.target.mesh.parent ? missile.mesh.position.distanceTo(missile.target.mesh.position) : Infinity;
          if (targetDistance < (missile.target === boss ? 3.2 * boss.mesh.scale.x : 1.35)) {
            if (missile.target === boss && boss) {
              boss.health = Math.max(0, boss.health - 4);
              bossFill.style.width = `${Math.max(0, boss.health / boss.maxHealth * 100)}%`;
              explode(boss.mesh.position, 0xfff36b);
              if (boss.health <= 0) { score += 100; explode(boss.mesh.position, 0xff477e, 2.5); completeLevel(); }
            } else {
              const enemyIndex = enemies.indexOf(missile.target);
              if (enemyIndex >= 0) {
                explode(missile.target.mesh.position, 0xffb347);
                scene.remove(missile.target.mesh);
                enemies.splice(enemyIndex, 1);
                score += 10;
                registerObjectiveKill();
                updateHud();
              }
            }
            scene.remove(missile.mesh);
            if (!running) break;
            missiles.splice(missileIndex, 1);
          } else if (missile.life <= 0 || missile.mesh.position.z < -65) {
            scene.remove(missile.mesh);
            missiles.splice(missileIndex, 1);
          }
        }
        for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
          const enemy = enemies[enemyIndex];
          let enemyRemoved = false;
          enemy.mesh.position.z += enemy.speed * delta;
          if (now > enemy.nextDrift) {
            enemy.driftX = THREE.MathUtils.clamp(enemy.driftX + (Math.random() - .5) * 2.4, -2.8, 2.8);
            enemy.driftY = THREE.MathUtils.clamp(enemy.driftY + (Math.random() - .5) * 2, -2.2, 2.2);
            enemy.nextDrift = now + 300 + Math.random() * 700;
          }
          const routeTargetX = ship.position.x + enemy.routeOffsetX;
          const routeTargetY = ship.position.y + enemy.routeOffsetY;
          const approachX = (routeTargetX - enemy.mesh.position.x) * .34;
          const approachY = (routeTargetY - enemy.mesh.position.y) * .34;
          enemy.mesh.position.x += (approachX + enemy.driftX) * delta;
          enemy.mesh.position.y += (approachY + enemy.driftY) * delta;
          keepObjectOnScreen(enemy.mesh.position, 1.7, .9);
          atualizarVistaInimigo(enemy.mesh, camera);
          if (now > enemy.nextShot && enemy.mesh.position.z < ship.position.z - 4) { enemyFire(enemy); enemy.nextShot = now + 1000 + Math.random() * 1800; }
          if (enemy.mesh.position.distanceTo(ship.position) < 1.8 && ship.visible && !damageBlink) {
            scene.remove(enemy.mesh);
            enemies.splice(enemyIndex, 1);
            registerDirectImpact();
            enemyRemoved = true;
          }
          if (enemyRemoved) {
            if (!running) break;
            continue;
          }
          for (let shotIndex = shots.length - 1; shotIndex >= 0; shotIndex--) {
            const shot = shots[shotIndex];
            if (enemy.mesh.position.distanceTo(shot.mesh.position) < enemyShotHitRadius) {
              explode(enemy.mesh.position);
              scene.remove(enemy.mesh);
              scene.remove(shot.mesh);
              enemies.splice(enemyIndex, 1);
              shots.splice(shotIndex, 1);
              score += 10;
              registerKill();
              updateHud();
              enemyRemoved = true;
              break;
            }
          }
          if (!running) break;
          if (enemyRemoved) continue;
          if (enemy.mesh.position.z > 14) { scene.remove(enemy.mesh); enemies.splice(enemyIndex, 1); }
        }
        if (boss) {
          if (!boss.moveTarget && now > boss.nextMove) {
            boss.moveTarget = chooseBossDestination(boss.mesh);
          }
          if (boss.moveTarget) {
            const deltaX = boss.moveTarget.x - boss.mesh.position.x;
            const deltaY = boss.moveTarget.y - boss.mesh.position.y;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance < .25) {
              boss.moveTarget = null;
              boss.nextMove = now + 180 + Math.random() * 600;
            } else {
              const step = Math.min(distance, boss.moveSpeed * delta);
              boss.mesh.position.x += deltaX / distance * step;
              boss.mesh.position.y += deltaY / distance * step;
            }
          }
          keepObjectOnScreen(boss.mesh.position, 1, .8);
          atualizarVistaInimigo(boss.mesh, camera);
          if (ship.visible && !damageBlink && boss.mesh.position.distanceTo(ship.position) < 2.2 * boss.mesh.scale.x) registerDirectImpact();
          if (now > boss.nextShot) { enemyFire(boss); boss.nextShot = now + boss.shotInterval; }
          if (now > boss.nextSpawn) { spawnEnemy(); boss.nextSpawn = now + boss.spawnInterval; }
          for (let shotIndex = shots.length - 1; shotIndex >= 0; shotIndex--) {
            const shot = shots[shotIndex];
            if (boss && boss.mesh.position.distanceTo(shot.mesh.position) < bossShotHitRadius * boss.mesh.scale.x) {
              boss.health--; scene.remove(shot.mesh); shots.splice(shotIndex, 1); explode(boss.mesh.position, 0xfff36b);
              bossFill.style.width = `${Math.max(0, boss.health / boss.maxHealth * 100)}%`;
              if (boss.health <= 0) { score += 100; explode(boss.mesh.position, 0xff477e, 2.5); completeLevel(); }
            }
            if (!running) break;
          }
        }
        for (let shotIndex = enemyShots.length - 1; shotIndex >= 0; shotIndex--) {
          const shot = enemyShots[shotIndex];
          shot.mesh.position.z += shot.speed * delta;
          if (ship.visible && !damageBlink && shot.mesh.position.distanceTo(ship.position) < 1.15) {
            scene.remove(shot.mesh);
            enemyShots.splice(shotIndex, 1);
            hitsTaken++;
            missionShotHits++;
            startDamageBlink(hitsTaken >= 3);
            explode(ship.position, 0xff315f);
          } else if (shot.mesh.position.z > 14) {
            scene.remove(shot.mesh); enemyShots.splice(shotIndex, 1);
          }
        }
        if (laser) {
          laser.life -= delta;
          const opacity = Math.max(0, laser.life / .42);
          laser.mesh.children.forEach(segment => { segment.material.opacity = opacity; });
          if (laser.life <= 0) { scene.remove(laser.mesh); laser = null; }
        }
      }
      updateEffects(delta);
      atualizarExplosoesNave(delta);
      renderer.render(scene, camera);
    }
    startMusic();
    updateHud(); requestAnimationFrame(animate);
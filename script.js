const canvas = document.getElementById('starCanvas')
const ctx = canvas.getContext('2d')

const settings = {
  numStars: 2000,
  fieldSize: 8000,
  projectionScale: 300,
  baseSpeed: 0.1,
  maxThrustSpeed: 8,
  starSize: 1,
  starTrailAlpha: 0.4,
  turnRateSensitivity: 0.05,
  trailLength: 3,

  starColors: ['#ffffff', '#ffffaa', '#aaaaff', '#ffaaaa', '#aaffaa'],
  thrustBar: { width: 24, height: 120, margin: 24 },
}

let width, height, centerX, centerY
const stars = []
let thrust = 0, targetThrust = 0
let shipX = 0, shipY = 0, shipZ = 0
const shipOrientation = new THREE.Quaternion()
let roll = 0
let yawRate = 0, pitchRate = 0
let targetYawRate = 0, targetPitchRate = 0, targetRoll = 0
let mouseX = 0, mouseY = 0
let dynamicTurnSensitivity = 0
const turnSpeed = 0.08
const maxTurnAngle = Math.PI / 6

// Three.js setup
let scene, camera, renderer, spaceship
let threeCanvas
let lasers = []

function initThreeJS() {
  // Create Three.js canvas
  threeCanvas = document.createElement('canvas')
  threeCanvas.style.position = 'fixed'
  threeCanvas.style.top = '0'
  threeCanvas.style.left = '0'
  threeCanvas.style.pointerEvents = 'none'
  threeCanvas.style.zIndex = '5'
  document.body.appendChild(threeCanvas)

  // Scene setup
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 50000)
  renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true })
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000, 0)

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(0.5, 2.5, 2)
  scene.add(directionalLight)

  // Create 3D spaceship
  createSpaceship()

  // Position camera
  camera.position.z = 5
  camera.position.y = 1.5
}

function createSpaceship() {
  // Pyramid with longitudinal axis on Z, centered on the tail's centroid.
  const geometry = new THREE.BufferGeometry()

  // Define original vertices to calculate centroid
  const orig_baseC = [0, 0, 0]
  const orig_apex = [0, 0, -4]
  const orig_baseA = [-0.7, -0.5, 0.5]
  const orig_baseB = [0.7, -0.5, 0.5]

  // Calculate centroid of the base triangle
  const centroid = [
    (orig_baseA[0] + orig_baseB[0] + orig_baseC[0]) / 3,
    (orig_baseA[1] + orig_baseB[1] + orig_baseC[1]) / 3,
    (orig_baseA[2] + orig_baseB[2] + orig_baseC[2]) / 3,
  ]

  // Define final vertices relative to the centroid
  const apex = [orig_apex[0] - centroid[0], orig_apex[1] - centroid[1], orig_apex[2] - centroid[2]]
  const baseA = [orig_baseA[0] - centroid[0], orig_baseA[1] - centroid[1], orig_baseA[2] - centroid[2]]
  const baseB = [orig_baseB[0] - centroid[0], orig_baseB[1] - centroid[1], orig_baseB[2] - centroid[2]]
  const baseC = [orig_baseC[0] - centroid[0], orig_baseC[1] - centroid[1], orig_baseC[2] - centroid[2]]

  const vertices = new Float32Array([
    // Face 1 (bottom)
    ...apex, ...baseA, ...baseB,
    // Face 2 (left)
    ...apex, ...baseC, ...baseA,
    // Face 3 (right)
    ...apex, ...baseB, ...baseC,
    // Base face (back)
    ...baseA, ...baseB, ...baseC,
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshPhongMaterial({
    color: 0x888888,
    shininess: 50,
    transparent: false,
    opacity: 1.0,
    side: THREE.DoubleSide
  })
  spaceship = new THREE.Mesh(geometry, material)

  scene.add(spaceship)
  addThrusterGlow([baseA, baseB, baseC])
}

function addThrusterGlow(baseVerts) {
  // Compute centroid of base
  const [a, b, c] = baseVerts
  const cx = (a[0] + b[0] + c[0]) / 3
  const cy = (a[1] + b[1] + c[1]) / 3
  const cz = (a[2] + b[2] + c[2]) / 3
  const thrusterGeometry = new THREE.SphereGeometry(0.15, 32, 16)
  const thrusterMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.8
  })
  const mainThruster = new THREE.Mesh(thrusterGeometry, thrusterMaterial)
  mainThruster.position.set(cx, cy, cz)
  spaceship.add(mainThruster)
}

function updateSpaceship() {
  if (spaceship) {
    // Apply visual tilt based on turn rate, and roll
    spaceship.rotation.z = -roll
    // spaceship.rotation.y = yawRate * -1
    spaceship.rotation.x = pitchRate * 5

    // Scale thruster glows based on thrust
    spaceship.children.forEach(child => {
      if (child.material && child.material.color.getHex() === 0xff4400) {
        child.material.opacity = 0.4 + thrust * 0.6
        child.scale.setScalar(0.8 + thrust * 0.6)
      }
    })
  }
}

function renderThreeJS() {
  if (renderer) {
    renderer.render(scene, camera)
  }
}

function resizeCanvas() {
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = width
  canvas.height = height
  centerX = width / 2
  centerY = height / 2

  // Update Three.js
  if (camera) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  if (renderer) {
    renderer.setSize(width, height)
  }
}

function createStar() {
  return {
    x: (Math.random() - 0.5) * settings.fieldSize * 4,
    y: (Math.random() - 0.5) * settings.fieldSize * 4,
    z: (Math.random() - 0.5) * settings.fieldSize * 4,
    color: settings.starColors[Math.floor(Math.random() * settings.starColors.length)],
    trail: [],
    size: 1 + Math.pow(Math.random(), 10) * 40,
  }
}

function initStars() {
  stars.length = 0
  for (let i = 0; i < settings.numStars; i++) {
    stars.push(createStar())
  }
}

function updateStars() {
  const maxDistSq = Math.pow(settings.fieldSize * 2, 2)

  for (let i = stars.length - 1; i >= 0; i--) {
    const dx = stars[i].x - shipX
    const dy = stars[i].y - shipY
    const dz = stars[i].z - shipZ

    const distSq = dx * dx + dy * dy + dz * dz

    // Recycle if too far away
    if (distSq > maxDistSq) {
      // Generate a random direction vector (on a unit sphere)
      const theta = Math.random() * 2 * Math.PI
      const phi = Math.acos(2 * Math.random() - 1)
      const randDirX = Math.sin(phi) * Math.cos(theta)
      const randDirY = Math.sin(phi) * Math.sin(theta)
      const randDirZ = Math.cos(phi)

      const spawn_distance = settings.fieldSize * 2 // Place on the edge of the field

      // New star position on a sphere around the ship
      stars[i].x = shipX + randDirX * spawn_distance
      stars[i].y = shipY + randDirY * spawn_distance
      stars[i].z = shipZ + randDirZ * spawn_distance

      stars[i].color = settings.starColors[Math.floor(Math.random() * settings.starColors.length)]
      stars[i].trail = []
      stars[i].size = 1 + Math.pow(Math.random(), 3) * 4
    }
  }
}

function worldToCamera(worldX, worldY, worldZ) {
  return { x: worldX - shipX, y: worldY - shipY, z: worldZ - shipZ }
}

const VIEW_BOUNDS = 500

function prepareStar(star) {
  const cam = worldToCamera(star.x, star.y, star.z)

  // Create a quaternion for the ship's roll
  const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll)

  // Get the ship's main orientation and combine it with the roll
  const inverseOrientation = shipOrientation.clone().invert()
  const finalInverseRotation = new THREE.Quaternion().multiplyQuaternions(rollQuat, inverseOrientation)

  // Apply the final rotation to the star's position
  const starVec = new THREE.Vector3(cam.x, cam.y, cam.z)
  starVec.applyQuaternion(finalInverseRotation)

  if (starVec.z <= 1) {
    star.trail = []
    return null
  }

  const screenX = (starVec.x / starVec.z) * settings.projectionScale + centerX
  const screenY = (starVec.y / starVec.z) * settings.projectionScale + centerY

  star.trail.push({ x: screenX, y: screenY })
  if (star.trail.length > settings.trailLength) {
    star.trail.shift()
  }

  if (screenX < -VIEW_BOUNDS || screenX > width + VIEW_BOUNDS || screenY < -VIEW_BOUNDS || screenY > height + VIEW_BOUNDS) {
    star.trail = []
    return null
  }

  const distance = Math.sqrt(starVec.x * starVec.x + starVec.y * starVec.y + starVec.z * starVec.z)
  const size = Math.max(1, Math.round(star.size * settings.starSize * (1000 / distance)))
  const opacity = Math.max(0.1, Math.min(1, 2000 / distance))

  return { star, size, opacity }
}

function renderStar(drawable) {
  const { star, opacity, size } = drawable
  const points = star.trail

  if (points.length === 0) return

  const color = star.color + Math.floor(opacity * 200).toString(16).padStart(2, '0')

  // Draw a single dot if the trail is just one point long
  if (points.length === 1) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(points[0].x, points[0].y, size, 0, 2 * Math.PI)
    ctx.fill()
    return
  }

  // Draw a curve for trails with 2 or more points
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
  }

  // For the last segment, draw a line to the final point to ensure it's included
  if (points.length > 1) {
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
  }
  ctx.stroke()
}

function animate() {
  const dynamicTrailAlpha = settings.starTrailAlpha * (1 - thrust * 0.6)
  ctx.fillStyle = `rgba(0, 0, 0, ${dynamicTrailAlpha})`
  ctx.fillRect(0, 0, width, height)
  thrust += (targetThrust - thrust) * 0.05
  const speed = settings.baseSpeed + thrust * settings.maxThrustSpeed

  // Calculate dynamic turn sensitivity based on thrust state
  dynamicTurnSensitivity = settings.turnRateSensitivity * (1 + targetThrust * 2)

  // Calculate target turn rates based on current mouse position
  const offsetX = (mouseX - centerX) / centerX
  const offsetY = (mouseY - centerY) / centerY

  targetYawRate = offsetX * dynamicTurnSensitivity
  targetPitchRate = -offsetY * dynamicTurnSensitivity
  targetRoll = offsetX * maxTurnAngle * 1.5  // Mouse left/right = roll (banking)

  // Smoothly update roll and turn rates
  const actualTurnSpeed = turnSpeed + thrust * 0.04
  roll += (targetRoll - roll) * actualTurnSpeed
  yawRate += (targetYawRate - yawRate) * actualTurnSpeed
  pitchRate += (targetPitchRate - pitchRate) * actualTurnSpeed

  // Update orientation with quaternions to prevent gimbal lock
  const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRate)
  const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchRate)
  shipOrientation.multiply(yawQuat).multiply(pitchQuat).normalize()

  // Move ship forward in its facing direction
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shipOrientation)

  shipX += forward.x * speed * 100
  shipY += forward.y * speed * 100
  shipZ += forward.z * speed * 100

  // Update star field
  updateStars()

  // Draw stars
  const drawableStars = []
  for (const star of stars) {
    const drawable = prepareStar(star)
    if (drawable) {
      drawableStars.push(drawable)
    }
  }

  drawableStars.sort((a, b) => a.size - b.size)

  let currentSize = -1
  for (const drawable of drawableStars) {
    if (drawable.size !== currentSize) {
      currentSize = drawable.size
      ctx.lineWidth = currentSize * 2
    }
    renderStar(drawable)
  }

  // Update and render 3D spaceship
  updateSpaceship()
  for (const laser of lasers) {
    renderFireball(laser)
  }
  updateLasers()
  renderThreeJS()

  drawThrustWidget()

  requestAnimationFrame(animate)
}

function drawThrustWidget() {
  const { width: barWidth, height: barHeight, margin } = settings.thrustBar
  const x = width - barWidth - margin
  const y = margin
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.fillStyle = '#222'
  ctx.fillRect(x, y, barWidth, barHeight)
  ctx.fillStyle = '#0ff'
  ctx.fillRect(x, y + barHeight * (1 - thrust), barWidth, barHeight * thrust)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, barWidth, barHeight)
  ctx.font = 'bold 14px monospace'
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.fillText('THRUST', x + barWidth / 2, y + barHeight + 18)
  ctx.restore()
}

resizeCanvas()
initThreeJS()
initStars()

window.addEventListener('resize', resizeCanvas)
window.addEventListener('mousemove', function (event) {
  mouseX = event.clientX
  mouseY = event.clientY
})
// Mouse events for desktop thrust
window.addEventListener('mousedown', function (event) {
  targetThrust = 1
})
window.addEventListener('mouseup', function (event) {
  targetThrust = 0
  targetYawRate = 0
  targetPitchRate = 0
})
window.addEventListener('contextmenu', function (event) {
  event.preventDefault() // Prevent context menu
})
window.addEventListener('mouseleave', function () {
  targetThrust = 0
  targetYawRate = 0
  targetPitchRate = 0
  targetRoll = 0
})
// Touch navigation for mobile
canvas.addEventListener('touchstart', function (event) {
  if (event.touches.length > 0) {
    const touch = event.touches[0]
    mouseX = touch.clientX
    mouseY = touch.clientY
    targetThrust = 1
    event.preventDefault()
  }
}, { passive: false })
canvas.addEventListener('touchmove', function (event) {
  if (event.touches.length > 0) {
    const touch = event.touches[0]
    mouseX = touch.clientX
    mouseY = touch.clientY
    event.preventDefault()
  }
}, { passive: false })
canvas.addEventListener('touchend', function (event) {
  targetThrust = 0
  targetYawRate = 0
  targetPitchRate = 0
  event.preventDefault()
}, { passive: false })
canvas.addEventListener('touchcancel', function (event) {
  targetThrust = 0
  targetYawRate = 0
  targetPitchRate = 0
  targetRoll = 0
  event.preventDefault()
}, { passive: false })
window.addEventListener('keydown', function (event) {
  if (event.key === 'z' || event.key === ' ') {
    shootLaser()
  }
})

function shootLaser() {
  // Get the ship's orientation to calculate forward direction
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shipOrientation)

  // Start position slightly in front of the ship
  const startPosition = {
    x: shipX + forward.x * 50,
    y: shipY + forward.y * 50,
    z: shipZ + forward.z * 50,
  }

  // Velocity in the direction the ship is facing
  const velocity = {
    x: forward.x * 30,
    y: forward.y * 30,
    z: forward.z * 30,
  }

  // Add to tracking array
  lasers.push({
    x: startPosition.x,
    y: startPosition.y,
    z: startPosition.z,
    velocity: velocity,
    life: 120,
    maxLife: 120,
  })
}

function renderFireball(laser) {
  const cam = worldToCamera(laser.x, laser.y, laser.z)

  const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll)
  const inverseOrientation = shipOrientation.clone().invert()
  const finalInverseRotation = new THREE.Quaternion().multiplyQuaternions(rollQuat, inverseOrientation)

  const laserVec = new THREE.Vector3(cam.x, cam.y, cam.z)
  laserVec.applyQuaternion(finalInverseRotation)

  if (laserVec.z <= 0) return

  const screenX = (laserVec.x / laserVec.z) * settings.projectionScale + centerX
  const screenY = (laserVec.y / laserVec.z) * settings.projectionScale + centerY + 70

  if (screenX < 0 || screenX > width || screenY < 0 || screenY > height) return

  const distance = Math.sqrt(laserVec.x * laserVec.x + laserVec.y * laserVec.y + laserVec.z * laserVec.z)
  const size = Math.max(1, 2000 / distance)
  const opacity = Math.max(0.1, Math.min(1, 2000 / distance)) * (laser.life / laser.maxLife)

  ctx.fillStyle = `rgba(255, 100, 0, ${opacity})`
  ctx.beginPath()
  ctx.arc(screenX, screenY, size, 0, 2 * Math.PI)
  ctx.fill()

  ctx.fillStyle = `rgba(255, 255, 0, ${opacity * 0.8})`
  ctx.beginPath()
  ctx.arc(screenX, screenY, size * 0.6, 0, 2 * Math.PI)
  ctx.fill()
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

function createMobileShootButton() {
  if (!isMobile()) return
  if (document.querySelector('.mobile-shoot-btn')) return
  const shootBtn = document.createElement('button')
  shootBtn.innerText = 'SHOOT'
  shootBtn.className = 'mobile-shoot-btn'
  shootBtn.style.cssText = `
    position: fixed;
    right: 6vw;
    bottom: 4vh;
    width: 64px;
    height: 64px;
    font-size: 16px;
    font-weight: bold;
    background: #ff4400;
    color: #fff;
    border: none;
    border-radius: 50%;
    box-shadow: 0 2px 8px #0008;
    cursor: pointer;
    z-index: 100;
    opacity: 0.92;
    transition: background 0.2s;
  `
  shootBtn.ontouchstart = shootBtn.onclick = function (e) {
    shootLaser()
    e.preventDefault()
  }
  document.body.appendChild(shootBtn)
}

function createControls() {
  const controls = document.getElementById('controls')
  controls.innerHTML = ''

  // Add collapse button
  const collapseBtn = document.createElement('button')
  collapseBtn.innerHTML = '▲'
  collapseBtn.style.cssText = `
    position: absolute;
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    border: 1px solid #555;
    color: #fff;
    padding: 2px 8px;
    cursor: pointer;
    border-radius: 0 0 4px 4px;
    font-size: 12px;
    z-index: 2;
  `

  let isCollapsed = false

  function toggleCollapse() {
    isCollapsed = !isCollapsed
    const sliders = controls.querySelectorAll('label')
    sliders.forEach(slider => {
      slider.style.display = isCollapsed ? 'none' : 'block'
    })
    collapseBtn.innerHTML = isCollapsed ? '▼' : '▲'
  }

  collapseBtn.onclick = toggleCollapse

  controls.appendChild(collapseBtn)

  function autoRange(value, step = 1, minDefault = 0.001) {
    let min = value / 10
    let max = value * 10
    if (value === 0) {
      min = minDefault
      max = minDefault * 100
    }
    if (Math.abs(min) < minDefault) min = minDefault
    if (Math.abs(max) < minDefault) max = minDefault * 10
    if (min > value) min = value - step * 10
    if (max < value) max = value + step * 10
    if (min === max) max = min + step * 10
    return [min, max]
  }

  function slider(label, key, step, unit = '', oninput) {
    const value = settings[key]
    const [min, max] = autoRange(value, step)
    const id = 'slider-' + key
    const labelEl = document.createElement('label')
    labelEl.htmlFor = id
    labelEl.innerText = label + ': '
    const input = document.createElement('input')
    input.type = 'range'
    input.id = id
    input.min = min
    input.max = max
    input.step = step
    input.value = value
    input.style.marginRight = '8px'
    const number = document.createElement('input')
    number.type = 'number'
    number.min = min
    number.max = max
    number.step = step
    number.value = value
    number.style.marginLeft = '8px'
    number.style.width = '60px'
    input.oninput = number.oninput = e => {
      settings[key] = parseFloat(e.target.value)
      input.value = number.value = settings[key]
      if (oninput) oninput(settings[key])
    }
    input.onchange = number.onchange = e => {
      settings[key] = parseFloat(e.target.value)
      input.value = number.value = settings[key]
      if (oninput) oninput(settings[key])
    }
    labelEl.appendChild(input)
    labelEl.appendChild(number)
    if (unit) {
      const unitEl = document.createElement('span')
      unitEl.innerText = ' ' + unit
      labelEl.appendChild(unitEl)
    }
    controls.appendChild(labelEl)
  }

  slider('Stars', 'numStars', 100, '', () => initStars())
  slider('Field Size', 'fieldSize', 10, '', () => initStars())
  slider('Projection', 'projectionScale', 1)
  slider('Base Speed', 'baseSpeed', 0.001)
  slider('Max Thrust', 'maxThrustSpeed', 0.001)
  slider('Star Size', 'starSize', 0.1)
  slider('Trail Alpha', 'starTrailAlpha', 0.01)
  slider('Turn Rate', 'turnRateSensitivity', 0.001)
  slider('Trail Length', 'trailLength', 1)

  // Start collapsed on mobile
  if (isMobile()) {
    isCollapsed = false
    requestAnimationFrame(() => toggleCollapse())
  }
}

createControls()
createMobileShootButton()
animate()

// Update lasers
function updateLasers() {
  for (let i = lasers.length - 1; i >= 0; i--) {
    const laser = lasers[i]
    laser.life -= 1

    if (laser.life <= 0) {
      lasers.splice(i, 1)
    } else {
      laser.x += laser.velocity.x
      laser.y += laser.velocity.y
      laser.z += laser.velocity.z
    }
  }
}

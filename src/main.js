import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { blackHoleFragmentShader, fullscreenVertexShader } from './shaders/blackHole.js';
import { LensShader } from './shaders/lens.js';
import './style.css';

const canvas = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const errorPanel = document.querySelector('#error');

if (!canvas || !window.WebGL2RenderingContext) {
  throw new Error('This visualization requires a WebGL 2 capable browser.');
}

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (error) {
  errorPanel.hidden = false;
  errorPanel.textContent = `WEBGL INITIALIZATION FAILED — ${error.message}`;
  throw error;
}

renderer.setClearColor(0x02030a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const renderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const viewerCamera = new THREE.PerspectiveCamera(43, 1, 0.1, 200);
viewerCamera.position.set(0.2, 11.2, 37.5);
viewerCamera.lookAt(0, 0, 0);

const uniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uCameraPosition: { value: new THREE.Vector3() },
  uCameraForward: { value: new THREE.Vector3() },
  uCameraRight: { value: new THREE.Vector3() },
  uCameraUp: { value: new THREE.Vector3() },
  uVerticalFov: { value: THREE.MathUtils.degToRad(viewerCamera.fov) },
  uDiskNormal: { value: new THREE.Vector3(0, 0.990268, -0.139173) },
  uDiskBrightness: { value: 1.2 },
  uStepBudget: { value: 340 },
};

const blackHoleMaterial = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: fullscreenVertexShader,
  fragmentShader: blackHoleFragmentShader,
  glslVersion: THREE.GLSL3,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
const fullscreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blackHoleMaterial);
fullscreenQuad.frustumCulled = false;
scene.add(fullscreenQuad);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
  stencilBuffer: false,
}));
composer.addPass(new RenderPass(scene, renderCamera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.56, 0.52);
composer.addPass(bloomPass);

const lensPass = new ShaderPass(LensShader);
lensPass.uniforms.uResolution.value = new THREE.Vector2(1, 1);
composer.addPass(lensPass);
composer.addPass(new OutputPass());

const controls = new OrbitControls(viewerCamera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.42;
controls.zoomSpeed = 0.62;
controls.minDistance = 13;
controls.maxDistance = 52;
controls.enablePan = false;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.24;
controls.update();

const clock = new THREE.Clock();
const basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
let resolutionScale = 1;
let targetStepBudget = 340;
let interacting = false;
let frameAccumulator = 0;
let frameSamples = 0;
let telemetryElapsed = 0;
let adaptationElapsed = 0;
let hasRendered = false;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const drawingBufferSize = new THREE.Vector2();

function applyRenderSize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = basePixelRatio * resolutionScale;

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  renderer.getDrawingBufferSize(drawingBufferSize);

  uniforms.uResolution.value.copy(drawingBufferSize);
  lensPass.uniforms.uResolution.value.copy(drawingBufferSize);
  viewerCamera.aspect = width / height;
  viewerCamera.updateProjectionMatrix();
}

function updateCameraUniforms() {
  viewerCamera.updateMatrixWorld();
  const elements = viewerCamera.matrixWorld.elements;
  right.set(elements[0], elements[1], elements[2]).normalize();
  up.set(elements[4], elements[5], elements[6]).normalize();
  forward.set(-elements[8], -elements[9], -elements[10]).normalize();

  uniforms.uCameraPosition.value.copy(viewerCamera.position);
  uniforms.uCameraForward.value.copy(forward);
  uniforms.uCameraRight.value.copy(right);
  uniforms.uCameraUp.value.copy(up);
}

function setResolutionScale(nextScale) {
  const clamped = THREE.MathUtils.clamp(nextScale, 0.58, 1);
  if (Math.abs(clamped - resolutionScale) < 0.025) return;
  resolutionScale = clamped;
  applyRenderSize();
}

controls.addEventListener('start', () => {
  interacting = true;
  uniforms.uStepBudget.value = Math.min(targetStepBudget, 180);
});
controls.addEventListener('end', () => {
  interacting = false;
  uniforms.uStepBudget.value = targetStepBudget;
});

window.addEventListener('resize', applyRenderSize, { passive: true });
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  errorPanel.hidden = false;
  errorPanel.textContent = 'GPU CONTEXT LOST — RELOAD TO REINITIALIZE THE INTEGRATOR';
});

function bindRange(id, outputId, onInput, format) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${outputId}`);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    output.value = format(value);
    onInput(value);
  });
}

bindRange('tilt', 'tilt-value', (degrees) => {
  const radians = THREE.MathUtils.degToRad(degrees);
  uniforms.uDiskNormal.value.set(0, Math.cos(radians), Math.sin(radians)).normalize();
}, (value) => `${value}°`);

bindRange('luminosity', 'luminosity-value', (value) => {
  uniforms.uDiskBrightness.value = value;
}, (value) => value.toFixed(2));

bindRange('bloom', 'bloom-value', (value) => {
  bloomPass.strength = value;
}, (value) => value.toFixed(2));

const qualitySelect = document.querySelector('#quality');
qualitySelect.addEventListener('change', () => {
  targetStepBudget = Number(qualitySelect.value);
  uniforms.uStepBudget.value = interacting ? Math.min(targetStepBudget, 180) : targetStepBudget;
});

const autoRotateButton = document.querySelector('#autorotate');
autoRotateButton.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  autoRotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
  autoRotateButton.querySelector('.mode-button__state').textContent = controls.autoRotate ? 'ON' : 'OFF';
});

const panel = document.querySelector('.controls');
const panelToggle = document.querySelector('#panel-toggle');
panelToggle.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('is-collapsed');
  panelToggle.textContent = collapsed ? '+' : '−';
  panelToggle.setAttribute('aria-expanded', String(!collapsed));
});

function render() {
  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;
  controls.update();
  updateCameraUniforms();

  uniforms.uTime.value = elapsed;
  lensPass.uniforms.uTime.value = elapsed;
  composer.render(delta);

  frameAccumulator += delta;
  frameSamples += 1;
  telemetryElapsed += delta;
  adaptationElapsed += delta;

  if (telemetryElapsed >= 0.6) {
    const averageDelta = frameAccumulator / Math.max(frameSamples, 1);
    document.querySelector('#fps').textContent = `${Math.round(1 / Math.max(averageDelta, 0.001))} FPS · ${Math.round(resolutionScale * 100)}%`;
    frameAccumulator = 0;
    frameSamples = 0;
    telemetryElapsed = 0;
  }

  if (adaptationElapsed >= 2.2 && !interacting) {
    const averageDelta = frameAccumulator / Math.max(frameSamples, 1);
    if (frameSamples > 12 && averageDelta > 1 / 45) setResolutionScale(resolutionScale - 0.08);
    else if (frameSamples > 12 && averageDelta < 1 / 62) setResolutionScale(resolutionScale + 0.04);
    adaptationElapsed = 0;
  }

  if (!hasRendered) {
    hasRendered = true;
    requestAnimationFrame(() => loading.classList.add('is-hidden'));
  }
}

applyRenderSize();
updateCameraUniforms();
renderer.setAnimationLoop(render);

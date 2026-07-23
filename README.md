# Gargantua

A real-time Schwarzschild black-hole renderer built with Three.js and a GPU fragment shader. The scene traces null geodesics through curved spacetime and procedurally shades the lensed accretion disk, photon sphere, and background stars.

## Requirements

- Node.js 18 or newer
- A modern browser with WebGL 2 support
- A GPU capable of running a high-step fragment shader in real time

## Run locally

Clone the repository, install dependencies, and start the Vite development server:

```powershell
git clone https://github.com/alexsalnikov/space-sol5.6.git
cd space-sol5.6
npm install
npm run dev
```

Open the local URL printed by Vite. By default, it is:

```text
http://localhost:5173/
```

To expose the development server on your local network:

```powershell
npm run dev -- --host
```

## Production preview

Build the optimized site and serve the build locally:

```powershell
npm run build
npm run preview
```

Open the preview URL printed by Vite, usually `http://localhost:4173/`.

## Controls

- **Disk inclination** — Tilt the accretion disk relative to the viewer.
- **Disk luminosity** — Adjust the disk emission intensity.
- **Bloom** — Control the glow around bright disk regions.
- **Integrator** — Select the ray-integration budget:
  - **Performance · 220** — Lowest GPU cost.
  - **Balanced · 340** — Default quality/performance setting.
  - **Precision · 520** — Highest detail and GPU cost.
- **Orbital drift** — Toggle automatic camera rotation.
- **Mouse drag** — Orbit the camera manually.
- **Mouse wheel** — Zoom in or out.
- **Panel toggle** — Collapse or expand the observatory controls.

The renderer adapts its internal resolution when the frame rate changes. During camera interaction it temporarily lowers the integration budget to keep the controls responsive.

## Project structure

```text
index.html                 Application shell and controls
src/main.js                Three.js setup, camera, controls, and render loop
src/shaders/blackHole.js   Geodesic integration and black-hole shading
src/shaders/lens.js        Lens-style post-processing shader
src/style.css              Interface styling
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |

## Troubleshooting

### WebGL initialization failed

Use a current Chrome, Edge, Firefox, or Safari release with hardware acceleration enabled. The renderer requires WebGL 2; browser extensions or remote-desktop sessions can disable it.

### Rendering is slow

Choose **Performance · 220**, close other GPU-intensive applications, or use a browser window with a smaller viewport. **Precision · 520** is intended for faster desktop GPUs.

### The page does not load after changing files

Stop the server with `Ctrl+C`, restart it with `npm run dev`, and refresh the browser. If dependencies are missing, run `npm install` again.

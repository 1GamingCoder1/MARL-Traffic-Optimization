# MARL Traffic Optimization

A SUMO-based multi-agent reinforcement-learning traffic signal simulation with a FastAPI/WebSocket backend and a React + Three.js visualization.

## Active architecture

- **SUMO** runs the microscopic traffic simulation and remains the source of truth for vehicle positions and traffic-light phases.
- **TraCI** exposes traffic and signal state to Python.
- **Independent DQN agents** control the four intersections (`I1`–`I4`).
- **FastAPI + WebSocket** streams live telemetry to the browser.
- **React + Three.js** renders the simulation and the performance analytics page.

The legacy Streamlit dashboard under `app/` is retained as-is and is not part of the active UI workflow.

## Run the application

### 1. Backend

Use the Python environment and SUMO installation configured for this project. From the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python backend\main.py
```

The backend starts the realistic SUMO configuration and exposes:

- `http://127.0.0.1:8000/` — backend status
- `http://127.0.0.1:8000/api/analytics` — saved training history and live agent statistics
- `ws://127.0.0.1:8000/ws/simulation` — live SUMO telemetry and controls

The backend expects trained model files at either:

```text
models/realistic/marl_I1_final.pth
models/realistic/marl_I2_final.pth
models/realistic/marl_I3_final.pth
models/realistic/marl_I4_final.pth
```

or the corresponding files directly under `models/`. When these files are absent, the backend currently warns and uses initialized DQN networks; those runs must not be described as trained-agent evaluations.

### 2. Frontend

Open a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

## Visualization and performance notes

The live interface uses free mouse controls: left-drag to rotate, right-drag to pan, and the mouse wheel to zoom. The camera preset panel has been removed. Daylight, sunset, and night lighting can be changed from the top toolbar.

Vehicle telemetry continues to arrive over WebSocket at the backend's live rate. React's dashboard state is published at 10 Hz, while Three.js vehicle transforms consume the freshest packets directly and interpolate independently. Ordinary one-step SUMO movements are no longer treated as teleports; only large discontinuities snap, and interpolation speed follows the simulation playback multiplier. Vehicle meshes (including wheels) do not cast individual dynamic shadows, traffic-signal glow uses emissive materials instead of many point lights, static infrastructure is memoized, and the renderer uses a capped pixel ratio and smaller shadow map. The backend uses TraCI subscriptions for repeated vehicle fields and caches each intersection's incoming edges. These changes reduce rendering and data-collection overhead without changing SUMO's vehicle movement or DQN action selection.

The backend subscribes to vehicle variables through TraCI where supported, instead of issuing many individual TraCI requests for every field on every vehicle on every tick. It still has a compatibility fallback for newly inserted vehicles and older TraCI installations. The browser renders at most 120 detailed vehicles; the active vehicle KPI reports the total number in SUMO.

## Performance analytics

Choose **ANALYTICS** in the simulation toolbar to open the second page. It contains:

- live queue and accumulated-waiting trend charts for agents `I1`–`I4`;
- average queue, waiting, reward and monitored-vehicle comparisons;
- a per-intersection agent scorecard with switch-decision rate and sample count;
- training curves for average queue, episode reward, average waiting and average speed loaded from `results/realistic_marl_training_metrics.csv`, when present;
- a warning when one or more trained checkpoint files were not loaded.

Live agent averages and trend points are collected by the backend from SUMO/TraCI measurements only while MARL control is active; fixed-time intervals are excluded from the agent scorecard. The waiting metric is the per-step sum of accumulated waiting time for vehicles observed on each agent's incoming roads, averaged over samples. The deployment reward uses the same queue-plus-waiting-change objective as `RealisticTrafficEnv.step()` in training. Switch counts represent DQN switch decisions, not necessarily signal changes accepted by SUMO's minimum-green guard. The analytics page does not insert placeholder experiment values. Live statistics reset when the backend starts a new simulation session or the SUMO episode is reset. Training history is read from the CSV written by `training/train_realistic_marl.py`.

**Interpretation:** `I1`–`I4` are the four independent intersection agents. The live scorecard compares their observed operating metrics; it is not a controlled MARL-versus-fixed-time benchmark. Use a separate matched evaluation with the same network, demand and random seed before reporting formal controller-level performance improvements.

## Notes

- `models/`, `results/`, `.venv/`, `frontend/node_modules/` and frontend build output are ignored by Git.
- SUMO and its Python TraCI tools must be installed and available to the Python environment.
- The browser's WebSocket/API URLs currently target `127.0.0.1`, which is appropriate for a local demo.

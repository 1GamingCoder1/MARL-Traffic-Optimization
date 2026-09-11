import sys
from pathlib import Path

# ============================================================
# PROJECT ROOT
# ============================================================

PROJECT_ROOT = (
    Path(__file__).resolve().parent.parent
)

if str(PROJECT_ROOT) not in sys.path:

    sys.path.insert(
        0,
        str(PROJECT_ROOT)
    )


# ============================================================
# IMPORTS
# ============================================================

import os
import time

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import traci

from environment.traffic_env import (
    MultiTrafficEnv
)

from agents.dqn_agent import (
    DQNAgent
)

from app.components.simulation_view import (
    get_network_figure
)


# ============================================================
# CONFIGURATION
# ============================================================

SUMO_CFG = str(
    PROJECT_ROOT
    / "simulation"
    / "simulation.sumocfg"
)

TLS_IDS = [
    "I1",
    "I2",
    "I3",
    "I4",
]

MODEL_PATHS = {

    tls_id: str(
        PROJECT_ROOT
        / "models"
        / f"marl_{tls_id}_final.pth"
    )

    for tls_id in TLS_IDS
}


# ============================================================
# PAGE CONFIG
# ============================================================

st.set_page_config(
    page_title=(
        "MARL Traffic Optimization System"
    ),
    page_icon="🚦",
    layout="wide",
)


# ============================================================
# CSS
# ============================================================

st.markdown(
    """
<style>

.stApp {
    background-color: #020617;
    color: #e2e8f0;
}

[data-testid="stSidebar"] {
    background-color: #0f172a;
}

.main-title {
    font-size: 30px;
    font-weight: 700;
    color: #f8fafc;
}

.subtitle {
    color: #94a3b8;
    font-size: 14px;
    margin-bottom: 20px;
}

.agent-card {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
}

</style>
""",
    unsafe_allow_html=True,
)


# ============================================================
# SESSION STATE
# ============================================================

defaults = {

    "running": False,

    "env": None,

    "agents": {},

    "states": {},

    "simulation_time": 0,

    "total_reward": 0.0,

    "throughput": 0,

    "metrics": [],

    "events": [],

    "network_data": [],

}

for key, value in defaults.items():

    if key not in st.session_state:

        st.session_state[key] = value


# ============================================================
# EVENTS
# ============================================================

def add_event(message):

    timestamp = time.strftime(
        "%H:%M:%S"
    )

    st.session_state.events.insert(
        0,
        f"{timestamp} — {message}"
    )

    st.session_state.events = (
        st.session_state.events[:10]
    )


# ============================================================
# NETWORK DATA
# ============================================================

def get_network_data():

    network_data = []

    if not traci.isLoaded():

        return network_data

    try:

        edge_ids = (
            traci.edge.getIDList()
        )

        for edge_id in edge_ids:

            # ------------------------------------------------
            # Ignore SUMO internal junction edges
            # ------------------------------------------------

            if edge_id.startswith(":"):

                continue

            try:

                shape = (
                    traci.edge.getShape(
                        edge_id
                    )
                )

                if len(shape) < 2:

                    continue

                network_data.append(
                    {
                        "id": edge_id,
                        "shape": shape,
                    }
                )

            except Exception:

                continue

    except Exception:

        pass

    return network_data


# ============================================================
# VEHICLE DATA
# ============================================================

def get_vehicle_data():

    vehicles = []

    if not traci.isLoaded():

        return vehicles

    try:

        vehicle_ids = (
            traci.vehicle.getIDList()
        )

        for vehicle_id in vehicle_ids:

            try:

                x, y = (
                    traci.vehicle
                    .getPosition(
                        vehicle_id
                    )
                )

                speed = (
                    traci.vehicle
                    .getSpeed(
                        vehicle_id
                    )
                )

                angle = (
                    traci.vehicle
                    .getAngle(
                        vehicle_id
                    )
                )

                vehicles.append(
                    {
                        "id": vehicle_id,
                        "x": float(x),
                        "y": float(y),
                        "speed": float(speed),
                        "angle": float(angle),
                    }
                )

            except Exception:

                continue

    except Exception:

        pass

    return vehicles


# ============================================================
# SIGNAL DATA
# ============================================================

def get_signal_data():

    signals = {}

    if not traci.isLoaded():

        return signals

    for tls_id in TLS_IDS:

        try:

            signals[tls_id] = (
                traci.trafficlight
                .getRedYellowGreenState(
                    tls_id
                )
            )

        except Exception:

            signals[tls_id] = None

    return signals


# ============================================================
# START
# ============================================================

def start_simulation():

    if st.session_state.running:

        return

    try:

        if traci.isLoaded():

            try:

                traci.close()

            except Exception:

                pass

        # ----------------------------------------------------
        # Environment
        # ----------------------------------------------------

        env = MultiTrafficEnv(
            SUMO_CFG,
            TLS_IDS,
            min_green=10,
            use_gui=False,
        )

        states = env.reset()

        # ----------------------------------------------------
        # Load MARL models
        # ----------------------------------------------------

        agents = {}

        for tls_id in TLS_IDS:

            model_path = (
                MODEL_PATHS[tls_id]
            )

            if not os.path.exists(
                model_path
            ):

                raise FileNotFoundError(
                    f"Model not found:\n"
                    f"{model_path}"
                )

            agent = DQNAgent(
                state_size=5,
                action_size=2,
            )

            agent.load(
                model_path
            )

            agent.epsilon = 0.0

            agents[tls_id] = agent

        # ----------------------------------------------------
        # Store
        # ----------------------------------------------------

        st.session_state.env = env

        st.session_state.states = states

        st.session_state.agents = agents

        st.session_state.running = True

        st.session_state.simulation_time = 1

        st.session_state.total_reward = 0.0

        st.session_state.throughput = 0

        st.session_state.metrics = []

        # ----------------------------------------------------
        # Load roads ONCE
        # ----------------------------------------------------

        st.session_state.network_data = (
            get_network_data()
        )

        add_event(
            "SUMO simulation started"
        )

        add_event(
            "Four MARL agents loaded"
        )

        add_event(
            f"{len(st.session_state.network_data)} "
            "road edges loaded"
        )

    except Exception as e:

        st.session_state.running = False

        st.session_state.env = None

        st.error(
            f"Simulation start failed:\n\n{e}"
        )

        add_event(
            f"Start error: {e}"
        )


# ============================================================
# STOP
# ============================================================

def stop_simulation():

    try:

        if st.session_state.env is not None:

            st.session_state.env.close()

        elif traci.isLoaded():

            traci.close()

    except Exception:

        pass

    st.session_state.running = False

    st.session_state.env = None

    st.session_state.agents = {}

    st.session_state.states = {}

    st.session_state.network_data = []

    add_event(
        "Simulation stopped"
    )


# ============================================================
# ADVANCE ONE SIMULATION STEP
# ============================================================

def advance_simulation():

    if not st.session_state.running:

        return

    if st.session_state.env is None:

        return

    if not traci.isLoaded():

        st.session_state.running = False

        return

    try:

        actions = {}

        # ----------------------------------------------------
        # DQN ACTIONS
        # ----------------------------------------------------

        for tls_id in TLS_IDS:

            state = (
                st.session_state
                .states
                .get(
                    tls_id,
                    [0, 0, 0, 0, 0],
                )
            )

            action = (
                st.session_state
                .agents[tls_id]
                .select_action(
                    state
                )
            )

            actions[tls_id] = action

        # ----------------------------------------------------
        # SUMO STEP
        # ----------------------------------------------------

        (
            next_states,
            rewards,
            done,
            info,
        ) = (
            st.session_state
            .env
            .step(
                actions
            )
        )

        st.session_state.states = (
            next_states
        )

        # ----------------------------------------------------
        # REWARD
        # ----------------------------------------------------

        if isinstance(
            rewards,
            dict
        ):

            reward = sum(
                rewards.values()
            )

        else:

            reward = float(
                rewards
            )

        st.session_state.total_reward += (
            reward
        )

        # ----------------------------------------------------
        # TIME
        # ----------------------------------------------------

        try:

            current_time = (
                traci.simulation
                .getTime()
            )

            st.session_state.simulation_time = (
                int(current_time)
            )

        except Exception:

            st.session_state.simulation_time += 1

        # ----------------------------------------------------
        # THROUGHPUT
        # ----------------------------------------------------

        try:

            arrived = (
                traci.simulation
                .getArrivedNumber()
            )

            st.session_state.throughput += (
                arrived
            )

        except Exception:

            pass

        # ----------------------------------------------------
        # VEHICLES
        # ----------------------------------------------------

        vehicle_data = (
            get_vehicle_data()
        )

        vehicle_count = len(
            vehicle_data
        )

        # ----------------------------------------------------
        # SPEED
        # ----------------------------------------------------

        if vehicle_count > 0:

            average_speed = (
                sum(
                    v["speed"]
                    for v in vehicle_data
                )
                / vehicle_count
            )

        else:

            average_speed = 0.0

        # ----------------------------------------------------
        # QUEUE
        # ----------------------------------------------------

        queue = sum(
            1
            for v in vehicle_data
            if v["speed"] < 0.5
        )

        # ----------------------------------------------------
        # METRICS
        # ----------------------------------------------------

        st.session_state.metrics.append(
            {
                "time": (
                    st.session_state
                    .simulation_time
                ),
                "queue": queue,
                "speed": average_speed,
                "vehicles": vehicle_count,
                "throughput": (
                    st.session_state
                    .throughput
                ),
                "reward": (
                    st.session_state
                    .total_reward
                ),
            }
        )

        st.session_state.metrics = (
            st.session_state.metrics[-60:]
        )

        # ----------------------------------------------------
        # DONE
        # ----------------------------------------------------

        if done:

            add_event(
                "Simulation completed"
            )

            stop_simulation()

    except Exception as e:

        st.session_state.running = False

        add_event(
            f"Simulation error: {e}"
        )


# ============================================================
# LIVE SIMULATION
# ============================================================

@st.fragment(
    run_every="1s"
)
def live_simulation():

    # --------------------------------------------------------
    # Advance SUMO
    # --------------------------------------------------------

    if st.session_state.running:

        advance_simulation()

    # --------------------------------------------------------
    # Get current data
    # --------------------------------------------------------

    vehicle_data = (
        get_vehicle_data()
    )

    signal_data = (
        get_signal_data()
    )

    vehicle_count = len(
        vehicle_data
    )

    if vehicle_count:

        average_speed = (
            sum(
                v["speed"]
                for v in vehicle_data
            )
            / vehicle_count
        )

    else:

        average_speed = 0.0

    queue = sum(
        1
        for v in vehicle_data
        if v["speed"] < 0.5
    )

    # ========================================================
    # STATUS
    # ========================================================

    if st.session_state.running:

        st.success(
            "● Simulation Running"
        )

    else:

        st.error(
            "● Simulation Stopped"
        )

    # ========================================================
    # KPI
    # ========================================================

    c1, c2, c3, c4 = st.columns(4)

    with c1:

        st.metric(
            "Queue Length",
            queue,
            "vehicles",
        )

    with c2:

        st.metric(
            "Average Speed",
            f"{average_speed:.2f}",
            "m/s",
        )

    with c3:

        st.metric(
            "Vehicles",
            vehicle_count,
        )

    with c4:

        st.metric(
            "Throughput",
            st.session_state.throughput,
            "arrived",
        )

    st.markdown("")

    # ========================================================
    # MAIN
    # ========================================================

    left, right = st.columns(
        [2.3, 1]
    )

    with left:

        st.markdown(
            "### Live Traffic Simulation"
        )

        fig = get_network_figure(
            st.session_state.network_data,
            vehicle_data,
            signal_data,
        )

        st.plotly_chart(
            fig,
            use_container_width=True,
            config={
                "displayModeBar": False,
                "scrollZoom": False,
            },
        )

        st.caption(
            f"SUMO Time: "
            f"{st.session_state.simulation_time} s"
            f"   |   "
            f"Vehicles: {vehicle_count}"
        )

    # ========================================================
    # INTERSECTION STATUS
    # ========================================================

    with right:

        st.markdown(
            "### Intersection Status"
        )

        for tls_id in TLS_IDS:

            signal = signal_data.get(
                tls_id
            )

            if signal is None:

                status = "⚪ UNKNOWN"

            elif "G" in signal.upper():

                status = "🟢 GREEN"

            elif "Y" in signal.upper():

                status = "🟡 YELLOW"

            else:

                status = "🔴 RED"

            state = (
                st.session_state
                .states
                .get(
                    tls_id,
                    [0, 0, 0, 0, 0],
                )
            )

            local_queue = sum(
                state[:4]
            )

            st.markdown(
                f"""
<div class="agent-card">

<div style="
font-size:18px;
font-weight:700;
color:#f8fafc;
">
{tls_id}
</div>

<div style="
margin-top:7px;
color:#cbd5e1;
">
Signal: {status}
</div>

<div style="
margin-top:5px;
color:#94a3b8;
">
Phase: {state[4]:.0f}
</div>

<div style="
margin-top:5px;
color:#94a3b8;
">
Local Queue: {local_queue:.0f}
</div>

</div>
""",
                unsafe_allow_html=True,
            )

    # ========================================================
    # METRICS
    # ========================================================

    if st.session_state.metrics:

        st.markdown(
            "### Real-Time Metrics"
        )

        df = pd.DataFrame(
            st.session_state.metrics
        )

        fig = go.Figure()

        fig.add_trace(
            go.Scatter(
                x=df["time"],
                y=df["queue"],
                mode="lines",
                name="Queue",
            )
        )

        fig.add_trace(
            go.Scatter(
                x=df["time"],
                y=df["speed"],
                mode="lines",
                name="Speed",
            )
        )

        fig.update_layout(
            height=280,
            paper_bgcolor="#020617",
            plot_bgcolor="#0f172a",
            font=dict(
                color="#cbd5e1"
            ),
            margin=dict(
                l=10,
                r=10,
                t=10,
                b=10,
            ),
        )

        st.plotly_chart(
            fig,
            use_container_width=True,
            config={
                "displayModeBar": False
            },
        )


# ============================================================
# SIDEBAR
# ============================================================

with st.sidebar:

    st.markdown(
        "## 🚦 MARL Traffic"
    )

    page = st.radio(
        "Navigation",
        [
            "Dashboard",
            "Simulation",
            "Agents",
            "Analytics",
            "Training",
            "Reports",
        ],
    )

    st.markdown("---")

    if st.session_state.running:

        st.success(
            "● Simulation Running"
        )

    else:

        st.error(
            "● Simulation Stopped"
        )

    st.markdown("---")

    if st.button(
        "▶ Start Simulation",
        use_container_width=True,
    ):

        start_simulation()

        st.rerun()

    if st.button(
        "■ Stop Simulation",
        use_container_width=True,
    ):

        stop_simulation()

        st.rerun()

    st.markdown("---")

    st.caption(
        "Environment"
    )

    st.write(
        "SUMO + TraCI"
    )

    st.caption(
        "Algorithm"
    )

    st.write(
        "Independent DQN"
    )

    st.caption(
        "Agents"
    )

    st.write(
        "I1 • I2 • I3 • I4"
    )

    st.caption(
        "Minimum Green"
    )

    st.write(
        "10 seconds"
    )


# ============================================================
# HEADER
# ============================================================

st.markdown(
    '<div class="main-title">'
    'MARL Traffic Optimization System'
    '</div>',
    unsafe_allow_html=True,
)

st.markdown(
    '<div class="subtitle">'
    'Multi-Agent Reinforcement Learning '
    'for Traffic Signal Control'
    '</div>',
    unsafe_allow_html=True,
)


# ============================================================
# PAGES
# ============================================================

if page == "Dashboard":

    live_simulation()


elif page == "Simulation":

    st.markdown(
        "### Simulation"
    )

    live_simulation()


elif page == "Agents":

    st.markdown(
        "### MARL Agents"
    )

    cols = st.columns(2)

    for index, tls_id in enumerate(
        TLS_IDS
    ):

        with cols[index % 2]:

            model_path = (
                MODEL_PATHS[tls_id]
            )

            exists = os.path.exists(
                model_path
            )

            device = "Not loaded"
            epsilon = 0.0

            if tls_id in st.session_state.agents:

                device = str(
                    st.session_state
                    .agents[tls_id]
                    .device
                )

                epsilon = (
                    st.session_state
                    .agents[tls_id]
                    .epsilon
                )

            phase = "N/A"

            if traci.isLoaded():

                try:

                    phase = (
                        traci.trafficlight
                        .getPhase(
                            tls_id
                        )
                    )

                except Exception:

                    pass

            st.markdown(
                f"""
<div class="agent-card">

<div style="
font-size:18px;
font-weight:700;
color:#f8fafc;
">
🤖 Agent {tls_id}
</div>

<div style="
margin-top:8px;
color:#94a3b8;
">
Model:
{"Loaded" if exists else "Missing"}
</div>

<div style="
margin-top:6px;
color:#94a3b8;
">
Algorithm: Independent DQN
</div>

<div style="
margin-top:6px;
color:#94a3b8;
">
Device: {device}
</div>

<div style="
margin-top:6px;
color:#94a3b8;
">
Epsilon: {epsilon:.4f}
</div>

<div style="
margin-top:6px;
color:#94a3b8;
">
Current Phase: {phase}
</div>

</div>
""",
                unsafe_allow_html=True,
            )


elif page == "Analytics":

    st.markdown(
        "### Performance Analytics"
    )

    comparison = pd.DataFrame(
        {
            "Metric": [
                "Average Queue Length",
                "Average Waiting Time",
                "Average Speed",
            ],
            "Fixed-Time": [
                15.48,
                252.66,
                8.50,
            ],
            "MARL": [
                8.81,
                37.74,
                8.94,
            ],
        }
    )

    st.dataframe(
        comparison,
        use_container_width=True,
        hide_index=True,
    )

    c1, c2, c3 = st.columns(3)

    with c1:

        st.metric(
            "Queue Reduction",
            "43.09%",
        )

    with c2:

        st.metric(
            "Waiting Reduction",
            "85.07%",
        )

    with c3:

        st.metric(
            "Speed Improvement",
            "5.18%",
        )


elif page == "Training":

    st.markdown(
        "### MARL Training Progress"
    )

    training_file = (
        PROJECT_ROOT
        / "results"
        / "marl_training_metrics.csv"
    )

    if training_file.exists():

        df = pd.read_csv(
            training_file
        )

        st.dataframe(
            df.tail(15),
            use_container_width=True,
            hide_index=True,
        )

        if (
            "episode" in df.columns
            and "reward" in df.columns
        ):

            fig = go.Figure()

            fig.add_trace(
                go.Scatter(
                    x=df["episode"],
                    y=df["reward"],
                    mode="lines+markers",
                    name="Reward",
                )
            )

            fig.update_layout(
                height=350,
                paper_bgcolor="#020617",
                plot_bgcolor="#0f172a",
                font=dict(
                    color="#cbd5e1"
                ),
            )

            st.plotly_chart(
                fig,
                use_container_width=True,
            )

    else:

        st.warning(
            "Training metrics not found."
        )


elif page == "Reports":

    st.markdown(
        "### Final Evaluation"
    )

    results = pd.DataFrame(
        {
            "Metric": [
                "Average Queue Length",
                "Average Waiting Time",
                "Average Speed",
                "Average Vehicles",
            ],
            "Fixed-Time": [
                15.48,
                252.66,
                8.50,
                61.63,
            ],
            "MARL": [
                8.81,
                37.74,
                8.94,
                59.05,
            ],
        }
    )

    st.dataframe(
        results,
        use_container_width=True,
        hide_index=True,
    )

    st.markdown("---")

    st.markdown(
        """
### Conclusion

The Independent DQN multi-agent reinforcement learning
system improved traffic signal control performance compared
with the fixed-time baseline under the evaluated traffic
scenario.

The MARL approach reduced queue length and waiting time while
improving average vehicle speed.
"""
    )
import sys
import os

# ============================================================
# PROJECT ROOT
# ============================================================

PROJECT_ROOT = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        ".."
    )
)

sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# IMPORTS
# ============================================================

from environment.realistic_traffic_env import RealisticTrafficEnv
from agents.dqn_agent import DQNAgent


# ============================================================
# CONFIGURATION
# ============================================================

SUMO_CFG = os.path.join(
    PROJECT_ROOT,
    "simulation",
    "realistic_config",
    "realistic.sumocfg"
)

TLS_IDS = [
    "I1",
    "I2",
    "I3",
    "I4"
]

STATE_SIZE = 5
ACTION_SIZE = 2

MIN_GREEN = 10


# ============================================================
# MODEL DIRECTORY
# ============================================================

MODEL_DIR = os.path.join(
    PROJECT_ROOT,
    "models"
)


# ============================================================
# CREATE ENVIRONMENT
# ============================================================

env = RealisticTrafficEnv(
    sumo_cfg=SUMO_CFG,
    tls_ids=TLS_IDS,
    use_gui=True,
    min_green=MIN_GREEN
)


# ============================================================
# CREATE AGENTS
# ============================================================

agents = {}

for tls_id in TLS_IDS:

    print(
        f"Creating agent for {tls_id}..."
    )

    agents[tls_id] = DQNAgent(
        state_size=STATE_SIZE,
        action_size=ACTION_SIZE,
        learning_rate=0.0005,
        gamma=0.99,
        epsilon=0.0
    )


# ============================================================
# LOAD TRAINED MODELS
# ============================================================

print()
print("=" * 60)
print("LOADING TRAINED MARL MODELS")
print("=" * 60)

for tls_id in TLS_IDS:

    model_path = os.path.join(
        MODEL_DIR,
        f"marl_{tls_id}_final.pth"
    )

    if not os.path.exists(model_path):

        raise FileNotFoundError(
            f"Model not found: {model_path}"
        )

    agents[tls_id].load(
        model_path
    )

    agents[tls_id].epsilon = 0.0

    print(
        f"{tls_id}: {model_path}"
    )


# ============================================================
# RUN SIMULATION
# ============================================================

try:

    states = env.reset()

    print()
    print("=" * 60)
    print("REALISTIC MARL DEMO")
    print("=" * 60)


    for step in range(1000):

        actions = {}


        # ----------------------------------------------------
        # EACH TRAINED AGENT SELECTS AN ACTION
        # ----------------------------------------------------

        for tls_id in TLS_IDS:

            actions[tls_id] = agents[
                tls_id
            ].select_action(
                states[tls_id]
            )


        # ----------------------------------------------------
        # STEP SUMO
        # ----------------------------------------------------

        next_states, rewards, done, info = env.step(
            actions
        )


        # ----------------------------------------------------
        # PRINT STATUS EVERY 20 STEPS
        # ----------------------------------------------------

        if step % 20 == 0:

            print()
            print(
                f"Simulation Step: {step}"
            )

            for tls_id in TLS_IDS:

                action = (
                    "HOLD"
                    if actions[tls_id] == 0
                    else "SWITCH"
                )

                print(
                    f"{tls_id}"
                    f" | Action: {action}"
                    f" | Queue: {info[tls_id]['queue']:.0f}"
                    f" | Waiting: {info[tls_id]['waiting']:.0f}"
                    f" | Vehicles: {info[tls_id]['vehicles']}"
                )


        states = next_states


        if done:

            print(
                "\nSimulation finished."
            )

            break


finally:

    env.close()


print()
print("=" * 60)
print("REALISTIC MARL DEMO FINISHED")
print("=" * 60)

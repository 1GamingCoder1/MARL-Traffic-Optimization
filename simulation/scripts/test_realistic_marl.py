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

STATE_SIZE = 3
ACTION_SIZE = 2

MIN_GREEN = 10


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
# CREATE FOUR DQN AGENTS
# ============================================================

agents = {}

for tls_id in TLS_IDS:

    agents[tls_id] = DQNAgent(
        state_size=STATE_SIZE,
        action_size=ACTION_SIZE,

        learning_rate=0.0005,

        gamma=0.99,

        epsilon=0.0
    )


# ============================================================
# RUN MARL
# ============================================================

try:

    states = env.reset()

    print("\n")
    print("=" * 60)
    print("REALISTIC MARL TEST")
    print("=" * 60)

    print("\nInitial states:")

    for tls_id in TLS_IDS:

        print(
            tls_id,
            "->",
            states[tls_id]
        )


    for step in range(300):

        actions = {}


        # ----------------------------------------------------
        # EACH INTERSECTION HAS ITS OWN DQN AGENT
        # ----------------------------------------------------

        for tls_id in TLS_IDS:

            state = states[tls_id]

            action = agents[tls_id].select_action(
                state
            )

            actions[tls_id] = action


        # ----------------------------------------------------
        # STEP SUMO
        # ----------------------------------------------------

        next_states, rewards, done, info = env.step(
            actions
        )


        # ----------------------------------------------------
        # DISPLAY EVERY 10 STEPS
        # ----------------------------------------------------

        if step % 10 == 0:

            print(
                f"\nStep {step}"
            )

            for tls_id in TLS_IDS:

                action_name = (
                    "HOLD"
                    if actions[tls_id] == 0
                    else "SWITCH"
                )

                print(
                    tls_id,
                    "| Action:",
                    action_name,
                    "| Queue:",
                    round(
                        info[tls_id]["queue"],
                        2
                    ),
                    "| Waiting:",
                    round(
                        info[tls_id]["waiting"],
                        2
                    ),
                    "| Vehicles:",
                    info[tls_id]["vehicles"],
                    "| Reward:",
                    round(
                        rewards[tls_id],
                        2
                    )
                )


        states = next_states


        if done:

            print(
                "\nSUMO simulation finished."
            )

            break


finally:

    env.close()


print("\n")
print("=" * 60)
print("REALISTIC MARL TEST COMPLETED")
print("=" * 60)
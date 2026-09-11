import sys
import time
from pathlib import Path

# ============================================================
# PROJECT ROOT
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ============================================================
# IMPORTS
# ============================================================

import traci

from environment.traffic_env import MultiTrafficEnv
from agents.dqn_agent import DQNAgent


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

MIN_GREEN = 10


# ============================================================
# CREATE MARL AGENTS
# ============================================================

def create_agents():

    agents = {}

    print()
    print("=" * 60)
    print("LOADING TRAINED MARL AGENTS")
    print("=" * 60)

    for tls_id in TLS_IDS:

        model_path = MODEL_PATHS[tls_id]

        print(
            f"Loading Agent {tls_id}..."
        )

        agent = DQNAgent(
            state_size=5,
            action_size=2,
        )

        agent.load(
            model_path
        )

        # ----------------------------------------------------
        # Evaluation mode
        # No random exploration
        # ----------------------------------------------------

        agent.epsilon = 0.0

        agents[tls_id] = agent

        print(
            f"Agent {tls_id} loaded successfully"
        )

    print("=" * 60)
    print()

    return agents


# ============================================================
# PRINT TRAFFIC INFORMATION
# ============================================================

def print_status(
    simulation_time,
    states,
    actions,
):

    try:

        vehicle_count = len(
            traci.vehicle.getIDList()
        )

        total_queue = 0

        print(
            f"\rTime: {simulation_time:4.0f}s"
            f" | Vehicles: {vehicle_count:3d}",
            end="",
        )

        for tls_id in TLS_IDS:

            state = states.get(
                tls_id,
                [0, 0, 0, 0, 0],
            )

            local_queue = sum(
                state[:4]
            )

            total_queue += local_queue

        print(
            f" | Total Queue: {total_queue:3.0f}",
            end="",
        )

    except Exception:

        pass


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("=" * 60)
    print("MARL TRAFFIC OPTIMIZATION")
    print("SUMO-GUI DEMONSTRATION")
    print("=" * 60)
    print()

    print(
        "SUMO configuration:"
    )

    print(
        SUMO_CFG
    )

    print()

    # ========================================================
    # LOAD AGENTS
    # ========================================================

    agents = create_agents()

    # ========================================================
    # CREATE ENVIRONMENT
    # ========================================================

    print(
        "Starting SUMO-GUI..."
    )

    env = None

    try:

        env = MultiTrafficEnv(
            SUMO_CFG,
            TLS_IDS,
            min_green=MIN_GREEN,
            use_gui=True,
        )

        # ====================================================
        # RESET
        # ====================================================

        states = env.reset()

        print()
        print(
            "SUMO-GUI started successfully."
        )

        print()
        print(
            "The trained MARL agents are now"
        )

        print(
            "controlling intersections I1, I2, I3 and I4."
        )

        print()
        print(
            "Close SUMO-GUI or press Ctrl+C to stop."
        )

        print()
        print("=" * 60)
        print()

        # ====================================================
        # SIMULATION LOOP
        # ====================================================

        while True:

            # ------------------------------------------------
            # Check TraCI
            # ------------------------------------------------

            if not traci.isLoaded():

                print()
                print(
                    "SUMO connection closed."
                )

                break

            # ------------------------------------------------
            # Select actions
            # ------------------------------------------------

            actions = {}

            for tls_id in TLS_IDS:

                state = states.get(
                    tls_id,
                    [0, 0, 0, 0, 0],
                )

                action = (
                    agents[tls_id]
                    .select_action(
                        state
                    )
                )

                actions[tls_id] = action

            # ------------------------------------------------
            # Environment step
            # ------------------------------------------------

            (
                next_states,
                rewards,
                done,
                info,
            ) = env.step(
                actions
            )

            states = next_states

            # ------------------------------------------------
            # Simulation time
            # ------------------------------------------------

            try:

                simulation_time = (
                    traci.simulation
                    .getTime()
                )

            except Exception:

                simulation_time = 0

            # ------------------------------------------------
            # Display status
            # ------------------------------------------------

            print_status(
                simulation_time,
                states,
                actions,
            )

            # ------------------------------------------------
            # Check completion
            # ------------------------------------------------

            if done:

                print()
                print()
                print(
                    "Simulation completed."
                )

                break

            # ------------------------------------------------
            # Small delay for GUI
            # ------------------------------------------------

            time.sleep(0.05)

    except KeyboardInterrupt:

        print()
        print()
        print(
            "Simulation interrupted by user."
        )

    except Exception as e:

        print()
        print()
        print(
            "ERROR:"
        )

        print(e)

    finally:

        # ====================================================
        # CLOSE ENVIRONMENT
        # ====================================================

        try:

            if env is not None:

                env.close()

            elif traci.isLoaded():

                traci.close()

        except Exception:

            pass

        print()
        print(
            "SUMO connection closed."
        )

        print(
            "MARL demonstration finished."
        )

        print()


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()
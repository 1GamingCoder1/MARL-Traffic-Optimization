import sys
import os

# Add project root to Python path
PROJECT_ROOT = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        ".."
    )
)

sys.path.insert(0, PROJECT_ROOT)


from environment.realistic_traffic_env import RealisticTrafficEnv


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


env = RealisticTrafficEnv(
    sumo_cfg=SUMO_CFG,
    tls_ids=TLS_IDS,
    use_gui=True,
    min_green=10
)


try:

    states = env.reset()

    print("\nInitial states:")

    for tls_id, state in states.items():

        print(
            tls_id,
            "->",
            state
        )


    for step in range(100):

        actions = {}

        for tls_id in TLS_IDS:

            # 0 = HOLD
            # 1 = SWITCH

            actions[tls_id] = 0


        next_states, rewards, done, info = env.step(
            actions
        )


        if step % 10 == 0:

            print(
                f"\nStep {step}"
            )

            for tls_id in TLS_IDS:

                print(
                    tls_id,
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
                    info[tls_id]["vehicles"]
                )


        if done:

            print("\nSimulation finished.")

            break


finally:

    env.close()
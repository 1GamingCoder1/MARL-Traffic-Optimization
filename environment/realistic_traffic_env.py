import os
import sys
import traci
import numpy as np


class RealisticTrafficEnv:

    def __init__(
        self,
        sumo_cfg,
        tls_ids=None,
        use_gui=False,
        min_green=10
    ):

        self.sumo_cfg = os.path.abspath(sumo_cfg)

        self.tls_ids = tls_ids or [
            "I1",
            "I2",
            "I3",
            "I4"
        ]

        self.use_gui = use_gui
        self.min_green = min_green

        self.num_agents = len(self.tls_ids)

        # Two actions:
        # 0 = keep current phase
        # 1 = switch phase
        self.action_size = 2

        # State:
        # queue
        # waiting time
        # phase
        self.state_size = 5

        self.phase_start_time = {
            tls: 0.0 for tls in self.tls_ids
        }

        self.previous_waiting = {
            tls: 0.0 for tls in self.tls_ids
        }

        self.previous_phase = {
            tls: 0 for tls in self.tls_ids
        }

        self.started = False


    # ============================================================
    # START SUMO
    # ============================================================

    def start(self):

        if self.started:
            return

        sumo_binary = "sumo-gui" if self.use_gui else "sumo"

        sumo_cmd = [
            sumo_binary,
            "-c",
            self.sumo_cfg,

            "--start",

            "--quit-on-end",

            "--no-step-log",

            "--duration-log.statistics"
        ]

        print("\nStarting SUMO...")
        print("Mode:", "GUI" if self.use_gui else "CLI")

        traci.start(sumo_cmd)

        self.started = True

        current_time = traci.simulation.getTime()

        for tls in self.tls_ids:

            try:
                self.previous_phase[tls] = (
                    traci.trafficlight.getPhase(tls)
                )
            except Exception:
                self.previous_phase[tls] = 0

            self.phase_start_time[tls] = current_time

        print("SUMO connected successfully.")


    # ============================================================
    # GET VEHICLES AROUND INTERSECTION
    # ============================================================

    def _get_tls_edges(self, tls_id):

        controlled_links = traci.trafficlight.getControlledLinks(
            tls_id
        )

        edges = set()

        for group in controlled_links:

            if not group:
                continue

            for link in group:

                if not link:
                    continue

                incoming_lane = link[0]

                try:
                    edge = traci.lane.getEdgeID(
                        incoming_lane
                    )

                    if not edge.startswith(":"):
                        edges.add(edge)

                except Exception:
                    pass

        return list(edges)


    # ============================================================
    # QUEUE
    # ============================================================

    def get_queue(self, tls_id):

        edges = self._get_tls_edges(tls_id)

        queue = 0

        for edge in edges:

            try:

                lanes = traci.edge.getLaneNumber(edge)

                for lane_index in range(lanes):

                    lane_id = f"{edge}_{lane_index}"

                    halting = traci.lane.getLastStepHaltingNumber(
                        lane_id
                    )

                    queue += halting

            except Exception:
                continue

        return float(queue)


    # ============================================================
    # WAITING TIME
    # ============================================================

    def get_waiting_time(self, tls_id):

        edges = self._get_tls_edges(tls_id)

        waiting = 0.0

        counted = set()

        for edge in edges:

            try:

                vehicle_ids = traci.edge.getLastStepVehicleIDs(
                    edge
                )

            except Exception:

                continue

            for vehicle_id in vehicle_ids:

                if vehicle_id in counted:
                    continue

                counted.add(vehicle_id)

                try:

                    waiting += traci.vehicle.getAccumulatedWaitingTime(
                        vehicle_id
                    )

                except Exception:
                    pass

        return float(waiting)


    # ============================================================
    # VEHICLE COUNT
    # ============================================================

    def get_vehicle_count(self, tls_id):

        edges = self._get_tls_edges(tls_id)

        vehicles = set()

        for edge in edges:

            try:

                ids = traci.edge.getLastStepVehicleIDs(
                    edge
                )

                vehicles.update(ids)

            except Exception:
                pass

        return len(vehicles)


    # ============================================================
    # STATE
    # ============================================================

    def get_state(self, tls_id):

        queue = self.get_queue(tls_id)

        waiting = self.get_waiting_time(tls_id)

        vehicle_count = self.get_vehicle_count(tls_id)

        try:
            phase = traci.trafficlight.getPhase(tls_id)
        except Exception:
            phase = 0

        current_time = traci.simulation.getTime()

        phase_time = (
            current_time -
            self.phase_start_time[tls_id]
        )

    # --------------------------------------------------------
    # NORMALIZATION
    # --------------------------------------------------------

        queue_norm = min(
            queue / 100.0,
            1.0
        )

        waiting_norm = min(
            waiting / 1000.0,
            1.0
        )

        vehicle_norm = min(
            vehicle_count / 100.0,
            1.0
        )

        phase_norm = min(
            phase / 10.0,
            1.0
        )

        phase_time_norm = min(
            phase_time / 60.0,
            1.0
        )

        state = np.array(
            [
                queue_norm,
                waiting_norm,
                vehicle_norm,
                phase_norm,
                phase_time_norm
            ],
            dtype=np.float32
        )

        return state
        


    # ============================================================
    # SWITCH TRAFFIC LIGHT
    # ============================================================

    def switch_phase(self, tls_id):

        current_time = traci.simulation.getTime()

        elapsed = (
            current_time -
            self.phase_start_time[tls_id]
        )

        if elapsed < self.min_green:

            return False

        try:

            current_phase = traci.trafficlight.getPhase(
                tls_id
            )

            program = traci.trafficlight.getAllProgramLogics(
                tls_id
            )

            if not program:
                return False

            logic = program[0]

            num_phases = len(logic.phases)

            next_phase = (
                current_phase + 1
            ) % num_phases

            traci.trafficlight.setPhase(
                tls_id,
                next_phase
            )

            self.phase_start_time[tls_id] = current_time

            self.previous_phase[tls_id] = next_phase

            return True

        except Exception as e:

            print(
                f"Could not switch {tls_id}: {e}"
            )

            return False


    # ============================================================
    # STEP
    # ============================================================

    def step(self, actions):

        if not self.started:
            self.start()

        rewards = {}

        info = {}

        # --------------------------------------------------------
        # APPLY ACTIONS
        # --------------------------------------------------------

        for tls_id in self.tls_ids:

            action = actions.get(
                tls_id,
                0
            )

            switched = False

            if action == 1:

                switched = self.switch_phase(
                    tls_id
                )

            # ----------------------------------------------------
            # WAITING BEFORE SIMULATION STEP
            # ----------------------------------------------------

            previous_waiting = (
                self.previous_waiting[tls_id]
            )

            # ----------------------------------------------------
            # Store action information
            # ----------------------------------------------------

            info[tls_id] = {
                "action": action,
                "switched": switched
            }


        # --------------------------------------------------------
        # ADVANCE SUMO
        # --------------------------------------------------------

        try:

            traci.simulationStep()

        except traci.exceptions.FatalTraCIError:

            return {}, {}, True, {}


        # --------------------------------------------------------
        # CALCULATE REWARDS
        # --------------------------------------------------------

        for tls_id in self.tls_ids:

            queue = self.get_queue(
                tls_id
            )

            waiting = self.get_waiting_time(
                tls_id
            )

            vehicle_count = self.get_vehicle_count(
                tls_id
            )

            previous_waiting = (
                self.previous_waiting[tls_id]
            )

            waiting_change = (
                waiting - previous_waiting
            )

            # Reward:
            #
            # Lower queue is better.
            # Increasing waiting time is penalized.

            reward = -(
                queue
                +
                0.05 * waiting_change
            )

            rewards[tls_id] = float(
                reward
            )

            info[tls_id].update(
                {
                    "queue": queue,
                    "waiting": waiting,
                    "waiting_change": waiting_change,
                    "vehicles": vehicle_count
                }
            )

            self.previous_waiting[tls_id] = waiting


        # --------------------------------------------------------
        # NEXT STATES
        # --------------------------------------------------------

        next_states = {}

        for tls_id in self.tls_ids:

            next_states[tls_id] = self.get_state(
                tls_id
            )


        # --------------------------------------------------------
        # DONE
        # --------------------------------------------------------

        try:

            min_expected = (
                traci.simulation.getMinExpectedNumber()
            )

            done = (
                min_expected <= 0
            )

        except Exception:

            done = False


        return (
            next_states,
            rewards,
            done,
            info
        )


    # ============================================================
    # RESET
    # ============================================================

    def reset(self):

        if self.started:

            try:
                traci.close()
            except Exception:
                pass

            self.started = False

        self.previous_waiting = {
            tls: 0.0
            for tls in self.tls_ids
        }

        self.phase_start_time = {
            tls: 0.0
            for tls in self.tls_ids
        }

        self.previous_phase = {
            tls: 0
            for tls in self.tls_ids
        }

        self.start()

        states = {}

        for tls_id in self.tls_ids:

            states[tls_id] = self.get_state(
                tls_id
            )

        return states


    # ============================================================
    # CLOSE
    # ============================================================

    def close(self):

        if self.started:

            try:
                traci.close()

            except Exception:
                pass

            self.started = False

            print("SUMO closed.")
import math
import plotly.graph_objects as go


# ============================================================
# INTERSECTION POSITIONS
# ============================================================

INTERSECTIONS = {
    "I1": (0, 100),
    "I2": (200, 100),
    "I3": (0, -100),
    "I4": (200, -100),
}


# ============================================================
# SIGNAL COLOR
# ============================================================

def get_signal_color(signal):

    if not signal:
        return "#64748b"

    signal = signal.upper()

    if "G" in signal:
        return "#22c55e"

    if "Y" in signal:
        return "#f59e0b"

    return "#ef4444"


# ============================================================
# CREATE NETWORK
# ============================================================

def get_network_figure(
    network_data,
    vehicle_data,
    signal_data,
):

    fig = go.Figure()

    # ========================================================
    # ROADS
    # ========================================================

    for road in network_data:

        shape = road.get(
            "shape",
            []
        )

        if len(shape) < 2:
            continue

        x = [
            point[0]
            for point in shape
        ]

        y = [
            point[1]
            for point in shape
        ]

        # ----------------------------------------------------
        # Road surface
        # ----------------------------------------------------

        fig.add_trace(
            go.Scatter(
                x=x,
                y=y,
                mode="lines",
                line=dict(
                    color="#263244",
                    width=18,
                ),
                hoverinfo="skip",
                showlegend=False,
            )
        )

        # ----------------------------------------------------
        # Lane center marking
        # ----------------------------------------------------

        fig.add_trace(
            go.Scatter(
                x=x,
                y=y,
                mode="lines",
                line=dict(
                    color="#64748b",
                    width=1,
                    dash="dash",
                ),
                hoverinfo="skip",
                showlegend=False,
            )
        )

    # ========================================================
    # INTERSECTIONS
    # ========================================================

    for tls_id, (x, y) in INTERSECTIONS.items():

        signal = None

        if signal_data:

            signal = signal_data.get(
                tls_id
            )

        signal_color = (
            get_signal_color(signal)
        )

        # ----------------------------------------------------
        # Junction
        # ----------------------------------------------------

        fig.add_trace(
            go.Scatter(
                x=[x],
                y=[y],
                mode="markers",
                marker=dict(
                    size=44,
                    color="#0f172a",
                    line=dict(
                        color=signal_color,
                        width=5,
                    ),
                ),
                hoverinfo="skip",
                showlegend=False,
            )
        )

        # ----------------------------------------------------
        # Label
        # ----------------------------------------------------

        fig.add_annotation(
            x=x,
            y=y,
            text=f"<b>{tls_id}</b>",
            showarrow=False,
            font=dict(
                size=12,
                color="#f8fafc",
            ),
        )

    # ========================================================
    # VEHICLES
    # ========================================================

    if vehicle_data:

        car_x = []
        car_y = []
        car_ids = []
        car_speed = []
        car_colors = []

        heading_x = []
        heading_y = []

        for vehicle in vehicle_data:

            x = vehicle.get("x")
            y = vehicle.get("y")

            if x is None or y is None:
                continue

            speed = float(
                vehicle.get(
                    "speed",
                    0,
                )
            )

            angle = float(
                vehicle.get(
                    "angle",
                    0,
                )
            )

            vehicle_id = vehicle.get(
                "id",
                "Vehicle",
            )

            car_x.append(x)
            car_y.append(y)

            car_ids.append(
                vehicle_id
            )

            car_speed.append(
                speed
            )

            # ------------------------------------------------
            # Vehicle color
            # ------------------------------------------------

            if speed < 0.5:

                car_colors.append(
                    "#ef4444"
                )

            elif speed < 6:

                car_colors.append(
                    "#f59e0b"
                )

            else:

                car_colors.append(
                    "#22c55e"
                )

            # ------------------------------------------------
            # Direction line
            #
            # SUMO angle:
            # 0   = north
            # 90  = east
            # 180 = south
            # 270 = west
            # ------------------------------------------------

            radians = math.radians(
                90 - angle
            )

            line_length = 7

            end_x = (
                x
                + math.cos(radians)
                * line_length
            )

            end_y = (
                y
                + math.sin(radians)
                * line_length
            )

            heading_x.extend(
                [
                    x,
                    end_x,
                    None,
                ]
            )

            heading_y.extend(
                [
                    y,
                    end_y,
                    None,
                ]
            )

        # ----------------------------------------------------
        # Cars
        # ----------------------------------------------------

        if car_x:

            fig.add_trace(
                go.Scattergl(
                    x=car_x,
                    y=car_y,
                    mode="markers",
                    marker=dict(
                        size=9,
                        symbol="square",
                        color=car_colors,
                        line=dict(
                            color="#020617",
                            width=1,
                        ),
                    ),
                    text=car_ids,
                    customdata=car_speed,
                    hovertemplate=(
                        "<b>%{text}</b><br>"
                        "Speed: %{customdata:.1f} m/s"
                        "<extra></extra>"
                    ),
                    showlegend=False,
                )
            )

        # ----------------------------------------------------
        # Vehicle direction
        # ----------------------------------------------------

        if heading_x:

            fig.add_trace(
                go.Scattergl(
                    x=heading_x,
                    y=heading_y,
                    mode="lines",
                    line=dict(
                        color="#e2e8f0",
                        width=1.5,
                    ),
                    hoverinfo="skip",
                    showlegend=False,
                )
            )

    # ========================================================
    # LEGEND
    # ========================================================

    fig.add_trace(
        go.Scatter(
            x=[None],
            y=[None],
            mode="markers",
            marker=dict(
                size=9,
                symbol="square",
                color="#22c55e",
            ),
            name="Moving",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=[None],
            y=[None],
            mode="markers",
            marker=dict(
                size=9,
                symbol="square",
                color="#f59e0b",
            ),
            name="Slow",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=[None],
            y=[None],
            mode="markers",
            marker=dict(
                size=9,
                symbol="square",
                color="#ef4444",
            ),
            name="Stopped",
        )
    )

    # ========================================================
    # LAYOUT
    # ========================================================

    fig.update_layout(
        height=520,

        margin=dict(
            l=5,
            r=5,
            t=5,
            b=5,
        ),

        paper_bgcolor="#0f172a",

        plot_bgcolor="#020617",

        xaxis=dict(
            range=[
                -230,
                430,
            ],
            showgrid=False,
            zeroline=False,
            showticklabels=False,
            fixedrange=True,
        ),

        yaxis=dict(
            range=[
                -330,
                330,
            ],
            showgrid=False,
            zeroline=False,
            showticklabels=False,
            fixedrange=True,
            scaleanchor="x",
            scaleratio=1,
        ),

        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=0.01,
            xanchor="right",
            x=0.99,
            bgcolor="rgba(15,23,42,0.9)",
            font=dict(
                color="#cbd5e1",
                size=10,
            ),
        ),

        hovermode="closest",

        showlegend=True,
    )

    return fig
import React, { useEffect, useMemo, useState } from "react";
import "./AnalyticsPage.css";

const AGENT_COLORS = ["#52d6a2", "#65a8ff", "#c18bff", "#ffbd69"];
const AGENT_IDS = ["I1", "I2", "I3", "I4"];

function number(value, digits = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function LineChart({ title, subtitle, series, unit = "", height = 220 }) {
  const width = 760;
  const pad = { left: 48, right: 18, top: 18, bottom: 32 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const allValues = series.flatMap((item) => item.values.map((point) => point.value)).filter(Number.isFinite);
  const maxValue = Math.max(1, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = Math.max(1, maxValue - minValue);
  const longest = Math.max(1, ...series.map((item) => item.values.length));
  const x = (index) => pad.left + (longest <= 1 ? 0 : (index / (longest - 1)) * chartWidth);
  const y = (value) => pad.top + ((maxValue - value) / range) * chartHeight;

  return (
    <section className="analytics-card analytics-chart-card">
      <div className="analytics-card-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="chart-unit">{unit}</span>
      </div>
      {allValues.length === 0 ? (
        <div className="analytics-empty">Run the live simulation to collect trend data.</div>
      ) : (
        <>
          <svg className="analytics-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
            {[0, 1, 2, 3].map((step) => {
              const value = minValue + (range * step) / 3;
              const yy = y(value);
              return (
                <g key={step}>
                  <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-gridline" />
                  <text x={pad.left - 9} y={yy + 4} textAnchor="end" className="chart-axis-label">{number(value, 0)}</text>
                </g>
              );
            })}
            {series.map((item) => {
              const points = item.values.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
              return (
                <g key={item.name}>
                  <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  {item.values.length > 0 && (
                    <circle
                      cx={x(item.values.length - 1)}
                      cy={y(item.values[item.values.length - 1].value)}
                      r="4"
                      fill={item.color}
                      stroke="#111821"
                      strokeWidth="2"
                    />
                  )}
                </g>
              );
            })}
            <text x={pad.left} y={height - 9} className="chart-axis-label">Start</text>
            <text x={width - pad.right} y={height - 9} textAnchor="end" className="chart-axis-label">Latest</text>
          </svg>
          <div className="analytics-legend">
            {series.map((item) => (
              <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MetricBars({ title, metric, rows, suffix = "", lowerIsBetter = true, showBest = true }) {
  const values = rows.map((row) => Number(row[metric] || 0));
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const best = rows.length ? rows.reduce((winner, row) => {
    const current = Number(row[metric] || 0);
    const winning = Number(winner[metric] || 0);
    return (lowerIsBetter ? current < winning : current > winning) ? row : winner;
  }, rows[0]) : null;

  return (
    <section className="analytics-card analytics-bars-card">
      <div className="analytics-card-heading"><div><h3>{title}</h3><p>Live average by intersection agent</p></div></div>
      {rows.length === 0 ? <div className="analytics-empty">Waiting for agent samples.</div> : rows.map((row, index) => {
        const value = Number(row[metric] || 0);
        return (
          <div className="metric-bar-row" key={row.id}>
            <div className="metric-bar-label"><strong>{row.id}</strong><span>{number(value, 2)}{suffix}</span></div>
            <div className="metric-bar-track"><div className="metric-bar-fill" style={{ width: `${Math.max(2, Math.abs(value) / max * 100)}%`, background: AGENT_COLORS[index % AGENT_COLORS.length] }} /></div>
            {showBest && best?.id === row.id && <small className="best-agent-tag">BEST</small>}
          </div>
        );
      })}
    </section>
  );
}

export default function AnalyticsPage({ liveData, connected, onBack }) {
  const [trainingHistory, setTrainingHistory] = useState([]);
  const [liveAnalytics, setLiveAnalytics] = useState({ agents: [], history: [], modelStatus: null, allModelsLoaded: false });
  const [historyStatus, setHistoryStatus] = useState("loading");
  const rawAgents = liveAnalytics.agents.length
    ? liveAnalytics.agents
    : (Array.isArray(liveData?.agentComparison) ? liveData.agentComparison : []);
  const agents = rawAgents.filter((agent) => Number(agent.samples || 0) > 0);
  const history = liveAnalytics.history;
  const sampleCount = agents.reduce((total, agent) => total + Number(agent.samples || 0), 0);
  const totalQueue = agents.length ? agents.reduce((sum, item) => sum + Number(item.avgQueue || 0), 0) : 0;
  const totalWaiting = agents.length ? agents.reduce((sum, item) => sum + Number(item.avgWaiting || 0), 0) : 0;
  const bestQueueAgent = agents.length ? [...agents].sort((a, b) => Number(a.avgQueue || 0) - Number(b.avgQueue || 0))[0] : null;
  const bestRewardAgent = agents.length ? [...agents].sort((a, b) => Number(b.avgReward || 0) - Number(a.avgReward || 0))[0] : null;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function loadAnalytics() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("http://127.0.0.1:8000/api/analytics");
        if (!response.ok) throw new Error(`Analytics API returned ${response.status}`);
        const payload = await response.json();
        if (!cancelled) {
          setTrainingHistory(Array.isArray(payload.trainingHistory) ? payload.trainingHistory : []);
          setLiveAnalytics({
            agents: Array.isArray(payload.liveAgentComparison) ? payload.liveAgentComparison : [],
            history: Array.isArray(payload.liveAgentHistory) ? payload.liveAgentHistory : [],
            modelStatus: payload.agentModelStatus || null,
            allModelsLoaded: Boolean(payload.allAgentModelsLoaded),
          });
          setHistoryStatus(payload.trainingHistoryAvailable ? "ready" : "empty");
        }
      } catch (error) {
        if (!cancelled) setHistoryStatus("offline");
      } finally {
        inFlight = false;
      }
    }
    loadAnalytics();
    const refreshId = setInterval(loadAnalytics, 3000);
    return () => {
      cancelled = true;
      clearInterval(refreshId);
    };
  }, []);


  const queueSeries = useMemo(() => AGENT_IDS.map((id, index) => ({
    name: id,
    color: AGENT_COLORS[index],
    values: history.flatMap((sample) => {
      const agent = sample.agents?.find((entry) => entry.id === id);
      return agent ? [{ time: sample.time, value: Number(agent.queue || 0) }] : [];
    }),
  })), [history]);

  const waitingSeries = useMemo(() => AGENT_IDS.map((id, index) => ({
    name: id,
    color: AGENT_COLORS[index],
    values: history.flatMap((sample) => {
      const agent = sample.agents?.find((entry) => entry.id === id);
      return agent ? [{ time: sample.time, value: Number(agent.waiting || 0) }] : [];
    }),
  })), [history]);

  const trainingQueueSeries = useMemo(() => [{
    name: "Average queue",
    color: "#52d6a2",
    values: trainingHistory.map((row) => ({ time: row.episode, value: Number(row.average_queue) })),
  }], [trainingHistory]);

  const trainingRewardSeries = useMemo(() => [{
    name: "Episode reward",
    color: "#c18bff",
    values: trainingHistory.map((row) => ({ time: row.episode, value: Number(row.reward) })),
  }], [trainingHistory]);

  const trainingWaitingSeries = useMemo(() => [{
    name: "Average waiting",
    color: "#65a8ff",
    values: trainingHistory.map((row) => ({ time: row.episode, value: Number(row.average_waiting) })),
  }], [trainingHistory]);

  const trainingSpeedSeries = useMemo(() => [{
    name: "Average speed",
    color: "#ffbd69",
    values: trainingHistory.map((row) => ({ time: row.episode, value: Number(row.average_speed) })),
  }], [trainingHistory]);

  return (
    <main className="analytics-page">
      <header className="analytics-topbar">
        <div className="analytics-brand">
          <div className="analytics-brand-mark">M</div>
          <div><span>TRAFFIC INTELLIGENCE</span><strong>Performance Analytics</strong></div>
        </div>
        <div className="analytics-top-actions">
          <span className={`analytics-connection ${connected ? "online" : "offline"}`}><i />{connected ? "LIVE DATA CONNECTED" : "BACKEND OFFLINE"}</span>
          <button className="analytics-back-button" onClick={onBack}>← Back to simulation</button>
        </div>
      </header>

      <div className="analytics-content">
        <div className="analytics-page-title">
          <div><div className="analytics-eyebrow">MULTI-AGENT PERFORMANCE REVIEW</div><h1>Agent performance comparison</h1><p>Measured traffic metrics from the active SUMO episode, grouped by controlled intersection.</p></div>
          <div className="analytics-time-pill">{liveData?.simulationTime != null ? `SIM TIME ${number(liveData.simulationTime, 0)} s` : "AWAITING SIMULATION"}</div>
        </div>

        <section className="analytics-summary-grid">
          <div className="analytics-summary-card"><span>AGENT SAMPLE COUNT</span><strong>{sampleCount.toLocaleString()}</strong><small>Four intersection controllers</small></div>
          <div className="analytics-summary-card"><span>MEAN QUEUE / AGENT</span><strong>{agents.length ? number(totalQueue / agents.length, 2) : "—"}</strong><small>Vehicles stopped or queued</small></div>
          <div className="analytics-summary-card"><span>MEAN ACCUMULATED WAITING</span><strong>{agents.length ? `${number(totalWaiting / agents.length, 1)} s` : "—"}</strong><small>Across each agent's monitored incoming roads</small></div>
          <div className="analytics-summary-card"><span>LOWEST QUEUE AGENT</span><strong>{bestQueueAgent?.id || "—"}</strong><small>{bestQueueAgent ? `${number(bestQueueAgent.avgQueue, 2)} average vehicles` : "Awaiting samples"}</small></div>
        </section>

        {liveAnalytics.modelStatus && !liveAnalytics.allModelsLoaded && <div className="analytics-note">One or more trained DQN checkpoint files were not loaded. The backend is using initialized networks for those intersections; do not interpret their results as trained-agent performance. Check the backend terminal and place the four trained `marl_I1_final.pth` through `marl_I4_final.pth` files under `models/` or `models/realistic/`.</div>}
        {liveData?.controlMode === "FIXED" && <div className="analytics-note">The simulation is currently in fixed-time mode. The agent scorecard only records samples collected while Independent DQN MARL control is active, so fixed-time observations are excluded from agent averages.</div>}

        <div className="analytics-section-heading"><div><h2>Live agent trends</h2><p>Samples are captured from SUMO while Independent DQN MARL control is active.</p></div><span>{history.length} timeline points</span></div>
        <div className="analytics-chart-grid">
          <LineChart title="Queue length by agent" subtitle="Lower values indicate less congestion." series={queueSeries} unit="vehicles" />
          <LineChart title="Accumulated waiting by agent" subtitle="Compare waiting burden at each controlled junction." series={waitingSeries} unit="seconds" />
        </div>

        <div className="analytics-section-heading"><div><h2>Agent comparison</h2><p>Average values are calculated from samples recorded in this live episode.</p></div><span>{agents.length} agents</span></div>
        <div className="analytics-chart-grid">
          <MetricBars title="Average queue" metric="avgQueue" rows={agents} suffix=" veh" />
          <MetricBars title="Average waiting time" metric="avgWaiting" rows={agents} suffix=" s" />
          <MetricBars title="Average reward" metric="avgReward" rows={agents} lowerIsBetter={false} />
          <MetricBars title="Average vehicles monitored" metric="avgVehicles" rows={agents} suffix=" veh" lowerIsBetter={false} showBest={false} />
        </div>

        <section className="analytics-card analytics-table-card">
          <div className="analytics-card-heading"><div><h3>Intersection agent scorecard</h3><p>One row per Independent DQN agent. Waiting is the mean per-step sum of accumulated waiting across vehicles on that agent's incoming roads. Switch decisions are the agent's requested actions, not a count of signal changes accepted by SUMO.</p></div></div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead><tr><th>Agent</th><th>Avg. queue ↓</th><th>Mean accumulated wait</th><th>Avg. vehicles</th><th>Avg. reward ↑</th><th>Switch decisions</th><th>Samples</th></tr></thead>
              <tbody>
                {agents.length ? agents.map((agent, index) => (
                  <tr key={agent.id}>
                    <td><span className="agent-table-name"><i style={{ background: AGENT_COLORS[index % AGENT_COLORS.length] }} />{agent.id}</span></td>
                    <td>{number(agent.avgQueue, 2)}</td><td>{number(agent.avgWaiting, 2)} s</td><td>{number(agent.avgVehicles, 2)}</td><td>{number(agent.avgReward, 2)}</td><td>{agent.switches ?? 0} <small>({number(agent.switchRate, 1)}%)</small></td><td>{agent.samples ?? 0}</td>
                  </tr>
                )) : <tr><td colSpan="7" className="analytics-no-data">Start the simulation and let it run to populate this table with measured agent statistics.</td></tr>}
              </tbody>
            </table>
          </div>
          {bestRewardAgent && <div className="analytics-insight">Highest average reward so far: <strong>{bestRewardAgent.id}</strong>. Lowest average queue so far: <strong>{bestQueueAgent?.id}</strong>. These are descriptive live-run statistics, not a controlled MARL-versus-fixed-time experiment.</div>}
        </section>

        <div className="analytics-section-heading"><div><h2>Training history</h2><p>Loaded from results/realistic_marl_training_metrics.csv when that file is available.</p></div><span>{historyStatus === "ready" ? `${trainingHistory.length} episodes` : historyStatus === "loading" ? "Loading" : historyStatus === "offline" ? "API unavailable" : "No saved history"}</span></div>
        <div className="analytics-chart-grid">
          <LineChart title="Training average queue" subtitle="Episode-level training history." series={trainingQueueSeries} unit="vehicles" />
          <LineChart title="Training episode reward" subtitle="Reward progression saved by the training script." series={trainingRewardSeries} unit="reward" />
          <LineChart title="Training average waiting" subtitle="Average accumulated waiting across the training episode." series={trainingWaitingSeries} unit="seconds" />
          <LineChart title="Training average speed" subtitle="Average vehicle speed recorded during training." series={trainingSpeedSeries} unit="m/s" />
        </div>
        {historyStatus === "empty" && <div className="analytics-note">No training-history CSV was found. Run the realistic MARL training script to create it; this page does not invent demonstration values.</div>}
        <footer className="analytics-footer">Data source: SUMO / TraCI live telemetry and saved realistic MARL training metrics. Agent statistics reset when a new backend simulation session starts.</footer>
      </div>
    </main>
  );
}

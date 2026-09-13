import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const URGENT_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours — matches the MVI gap writeup.
// Note: your OVS table said 72h in one place and the overview said 48h —
// pick whichever matches your pilot and change the constant above.

function elapsed(ms) {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function ticketNumber(id) {
  return "CX-" + id.slice(-5).toUpperCase();
}

function waLink(job) {
  const countryCode = "27"; // South Africa default — see OWNER_WHATSAPP_COUNTRY_CODE in README
  const digits = (job.customerPhone || "").replace(/\D/g, "");
  if (!digits) return null;
  const localNumber = digits.startsWith("0") ? digits.slice(1) : digits;
  const phone = digits.startsWith(countryCode) ? digits : countryCode + localNumber;
  const message = `Hi ${job.customerName}, your ${job.deviceModel} is ready for collection at CellXpress (UWC Student Centre). Amount due: R${job.fee}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function Ticket({ job, onAdvance }) {
  const isUrgent = job.status === "in_progress" && Date.now() - job.createdAt > URGENT_AFTER_MS;
  const wa = waLink(job);

  return (
    <div className={`ticket${isUrgent ? " urgent" : ""}`}>
      <div className="ticket-head">
        <span>{ticketNumber(job.id)}</span>
        <span>{elapsed(job.createdAt)} open</span>
      </div>
      <div className="ticket-tear" />
      <div className="ticket-body">
        <p className="name">{job.customerName}</p>
        <p className="device">{job.deviceModel}</p>
        {job.faultDescription && <p className="fault">{job.faultDescription}</p>}
        {isUrgent && <span className="badge red">URGENT — over 48h</span>}
      </div>
      <div className="ticket-foot">
        <span className="fee">R{job.fee}</span>
        {job.status === "in_progress" && (
          <button className="btn" onClick={() => onAdvance(job.id, "ready_for_pickup")}>
            Mark ready
          </button>
        )}
        {job.status === "ready_for_pickup" && (
          <button className="btn" onClick={() => onAdvance(job.id, "completed")}>
            Mark completed
          </button>
        )}
        {job.status === "completed" && <span className="badge green">Collected</span>}
      </div>
      {job.status === "ready_for_pickup" && wa && (
        <div style={{ padding: "0 14px 14px" }}>
          <a className="wa-link" href={wa} target="_blank" rel="noreferrer">
            Send WhatsApp collection reminder →
          </a>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load jobs");
      setJobs(data.jobs);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // simple polling refresh
    return () => clearInterval(interval);
  }, [load]);

  const advance = async (id, status) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
    await fetch(`/api/jobs/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const inProgress = jobs.filter((j) => j.status === "in_progress");
  const ready = jobs.filter((j) => j.status === "ready_for_pickup");
  const completed = jobs.filter((j) => j.status === "completed");

  return (
    <div className="page">
      <div className="masthead">
        <div>
          <h1>CellXpress</h1>
          <div className="sub">UWC Student Centre — job board</div>
        </div>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/intake">+ New job</Link>
        </nav>
      </div>

      {error && <p className="status-line error">{error}</p>}

      <div className="columns">
        <div>
          <div className="column-heading">
            <span>In progress</span>
            <span>{inProgress.length}</span>
          </div>
          {inProgress.length === 0 && <p className="empty">No jobs in progress.</p>}
          {inProgress.map((j) => (
            <Ticket key={j.id} job={j} onAdvance={advance} />
          ))}
        </div>
        <div>
          <div className="column-heading">
            <span>Ready for pickup</span>
            <span>{ready.length}</span>
          </div>
          {ready.length === 0 && <p className="empty">Nothing ready yet.</p>}
          {ready.map((j) => (
            <Ticket key={j.id} job={j} onAdvance={advance} />
          ))}
        </div>
        <div>
          <div className="column-heading">
            <span>Completed</span>
            <span>{completed.length}</span>
          </div>
          {completed.length === 0 && <p className="empty">No collections yet.</p>}
          {completed.slice(0, 10).map((j) => (
            <Ticket key={j.id} job={j} onAdvance={advance} />
          ))}
        </div>
      </div>
    </div>
  );
}

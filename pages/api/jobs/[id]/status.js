import { getDb } from "../../../../lib/firebaseAdmin";

const VALID_STATUSES = ["in_progress", "ready_for_pickup", "completed"];

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` });
  }

  try {
    const db = getDb();
    const update = { status };
    if (status === "ready_for_pickup") update.readyAt = new Date();
    if (status === "completed") update.completedAt = new Date();

    await db.collection("jobs").doc(id).update(update);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Could not update job." });
  }
}

import { getDb } from "../../../lib/firebaseAdmin";

export default async function handler(req, res) {
  const db = getDb();

  if (req.method === "GET") {
    try {
      const snapshot = await db
        .collection("jobs")
        .orderBy("createdAt", "desc")
        .get();

      const jobs = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() ?? null,
          completedAt: data.completedAt?.toMillis?.() ?? null,
        };
      });

      return res.status(200).json({ jobs });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message || "Could not load jobs." });
    }
  }

  if (req.method === "POST") {
    try {
      const { customerName, deviceModel, fee, faultDescription, customerPhone } =
        req.body;

      if (!customerName || !deviceModel) {
        return res
          .status(400)
          .json({ error: "customerName and deviceModel are required." });
      }

      const docRef = await db.collection("jobs").add({
        customerName,
        deviceModel,
        fee: Number(fee) || 0,
        faultDescription: faultDescription || "",
        customerPhone: customerPhone || "",
        status: "in_progress", // in_progress -> ready_for_pickup -> completed
        createdAt: new Date(),
        completedAt: null,
      });

      return res.status(201).json({ id: docRef.id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message || "Could not create job." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

import { extractJobDetails } from "../../lib/gemini";

export const config = {
  api: {
    bodyParser: { sizeLimit: "15mb" }, // photo + short voice note
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, imageMimeType, audioBase64, audioMimeType } = req.body;

    if (!imageBase64 && !audioBase64) {
      return res.status(400).json({ error: "Provide at least a photo or a voice note." });
    }

    const extracted = await extractJobDetails({
      imageBase64,
      imageMimeType,
      audioBase64,
      audioMimeType,
    });

    return res.status(200).json(extracted);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Extraction failed." });
  }
}

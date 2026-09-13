// Calls the Google AI Studio (Gemini) API directly via fetch — no SDK needed.
// Docs: https://ai.google.dev/gemini-api/docs

const MODEL = "gemini-3.6-flash";

const EXTRACTION_PROMPT = `You are the intake agent for CellXpress, an
electronics repair shop. You are given a photo of a customer's device and a
voice note (audio) in which the owner states the customer's name, the device
model, and the repair fee.

Listen to the audio and look at the photo, then return ONLY a JSON object
(no markdown fences, no commentary) with exactly this shape:

{
  "customerName": string,
  "deviceModel": string,
  "fee": number,
  "faultDescription": string,
  "confidence": {
    "customerName": number,
    "deviceModel": number,
    "fee": number
  }
}

Rules:
- "fee" is a number in South African Rand, digits only (e.g. 450), no
  currency symbol or text.
- "faultDescription" is a short (max ~12 words) summary of the fault, from
  the audio and/or what's visible in the photo (e.g. cracked screen).
- Each "confidence" value is your own confidence (0.0 to 1.0) that you
  extracted that specific field correctly. Be honest and conservative —
  if the audio is unclear or the name is not stated plainly, score it low
  rather than guessing.
- If a field genuinely cannot be determined, use an empty string ("") or 0,
  and set its confidence to 0.
- Do not invent information that is not present in the audio or image.`;

export async function extractJobDetails({ imageBase64, imageMimeType, audioBase64, audioMimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local (see README.md section 2).");
  }

  const parts = [{ text: EXTRACTION_PROMPT }];

  if (imageBase64) {
    parts.push({
      inlineData: { mimeType: imageMimeType || "image/jpeg", data: imageBase64 },
    });
  }
  if (audioBase64) {
    parts.push({
      inlineData: { mimeType: audioMimeType || "audio/webm", data: audioBase64 },
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no extractable content. Try re-recording the voice note.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Gemini response wasn't valid JSON: " + text.slice(0, 300));
  }

  return parsed;
}

// The confidence threshold below which the owner must confirm/edit a field
// before the job is logged. Mirrors the "AI misinterpretation of user input"
// row in the answer sheet's ethical considerations table.
export const CONFIDENCE_THRESHOLD = 0.6;

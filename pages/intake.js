import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

const CONFIDENCE_THRESHOLD = 0.6;

// Vercel's serverless functions enforce a hard ~4.5MB request body limit that
// can't be raised from app code, so a raw phone photo (often 3-8MB) plus a
// voice note can blow past it once base64-encoded (~33% larger again).
// We resize + recompress the photo client-side before sending anything.
function compressImage(file, maxDimension = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Could not compress photo."));
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// If the server (or the platform in front of it) returns a non-JSON error
// page - e.g. Vercel's own 413/500 for an oversized request - res.json()
// throws a confusing "Unexpected token" error. This gives a readable message
// instead, and still parses normally for well-formed JSON responses.
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      throw new Error(
        "That photo/voice note is too large for the server to accept. Try a shorter recording or a smaller photo."
      );
    }
    throw new Error(
      `Server returned an unexpected response (status ${res.status}). Check the Vercel function logs for details.`
    );
  }
}

function ConfidenceBadge({ score }) {
  if (score === undefined || score === null) return null;
  const pct = Math.round(score * 100);
  const level = score >= CONFIDENCE_THRESHOLD ? "green" : "red";
  return <span className={`badge ${level}`}>{pct}% confident</span>;
}

export default function Intake() {
  const router = useRouter();
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [fields, setFields] = useState({
    customerName: "",
    deviceModel: "",
    fee: "",
    faultDescription: "",
    customerPhone: "",
  });
  const [confidence, setConfidence] = useState({});

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // 32kbps is plenty for a short spoken voice note and keeps the file
    // small enough to stay well under Vercel's serverless request body limit.
    const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const runExtraction = async () => {
    if (!photoFile && !audioBlob) {
      setExtractError("Add a photo and/or record a voice note first.");
      return;
    }
    setExtracting(true);
    setExtractError("");
    try {
      const payload = {};
      if (photoFile) {
        payload.imageBase64 = await compressImage(photoFile);
        payload.imageMimeType = "image/jpeg"; // compressImage always re-encodes to JPEG
      }
      if (audioBlob) {
        payload.audioBase64 = await blobToBase64(audioBlob);
        payload.audioMimeType = "audio/webm";
      }

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Extraction failed.");

      setFields((prev) => ({
        ...prev,
        customerName: data.customerName || "",
        deviceModel: data.deviceModel || "",
        fee: data.fee || "",
        faultDescription: data.faultDescription || "",
      }));
      setConfidence(data.confidence || {});
    } catch (err) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (name, value) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const submitJob = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Could not save job.");
      router.push("/");
    } catch (err) {
      setExtractError(err.message);
      setSubmitting(false);
    }
  };

  const hasLowConfidence = Object.values(confidence).some((v) => v < CONFIDENCE_THRESHOLD);

  return (
    <div className="page">
      <div className="masthead">
        <div>
          <h1>New job</h1>
          <div className="sub">photo + voice note → structured ticket</div>
        </div>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/intake">+ New job</Link>
        </nav>
      </div>

      <div className="form">
        <div className="field">
          <label>Photo of device</label>
          <label className="photo-drop">
            {photoPreview ? (
              <img className="photo-preview" src={photoPreview} alt="Device preview" />
            ) : (
              "Tap to take or choose a photo"
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhotoChange}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <div className="field">
          <label>Voice note (name, device, fee)</label>
          <div className="record-row">
            {!recording ? (
              <button type="button" className="btn" onClick={startRecording}>
                ● Record
              </button>
            ) : (
              <button type="button" className="btn secondary" onClick={stopRecording}>
                <span className="record-dot" style={{ display: "inline-block", marginRight: 6 }} />
                Stop
              </button>
            )}
            {audioUrl && <audio controls src={audioUrl} />}
          </div>
        </div>

        <button type="button" className="btn" onClick={runExtraction} disabled={extracting}>
          {extracting ? "Listening & reading…" : "Extract job details"}
        </button>

        {extractError && <p className="status-line error">{extractError}</p>}

        <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--line)" }} />

        <form onSubmit={submitJob}>
          <div className="field">
            <label>Customer name</label>
            <input
              type="text"
              value={fields.customerName}
              onChange={(e) => updateField("customerName", e.target.value)}
              required
            />
            <div className="confidence-row">
              <ConfidenceBadge score={confidence.customerName} />
            </div>
          </div>

          <div className="field">
            <label>Device model</label>
            <input
              type="text"
              value={fields.deviceModel}
              onChange={(e) => updateField("deviceModel", e.target.value)}
              required
            />
            <div className="confidence-row">
              <ConfidenceBadge score={confidence.deviceModel} />
            </div>
          </div>

          <div className="field">
            <label>Fee (ZAR)</label>
            <input
              type="number"
              value={fields.fee}
              onChange={(e) => updateField("fee", e.target.value)}
            />
            <div className="confidence-row">
              <ConfidenceBadge score={confidence.fee} />
            </div>
          </div>

          <div className="field">
            <label>Fault description</label>
            <textarea
              value={fields.faultDescription}
              onChange={(e) => updateField("faultDescription", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Customer WhatsApp number (typed by owner — not extracted)</label>
            <input
              type="text"
              placeholder="e.g. 082 123 4567"
              value={fields.customerPhone}
              onChange={(e) => updateField("customerPhone", e.target.value)}
            />
          </div>

          {hasLowConfidence && (
            <p className="status-line error">
              One or more fields were low-confidence — please check them before saving.
            </p>
          )}

          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save job to board"}
          </button>
        </form>
      </div>
    </div>
  );
}

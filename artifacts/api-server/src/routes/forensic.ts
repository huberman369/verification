import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

if (!baseURL || !apiKey) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set",
  );
}

const openai = new OpenAI({ baseURL, apiKey });

const SYSTEM_PROMPT = `You are a Senior Forensic Document Expert specializing in detecting AI-generated forgeries, digital manipulations, and deepfake ID documents. Your primary objective is to act as a hostile auditor: do not assume the document is real. Your goal is to find proof of digital tampering.

[Forensic Analysis Checklist]
Examine the uploaded image using the following technical criteria:

Pixel-Level Inconsistency & Noise:
- Analyze the distribution of digital noise (grain). In authentic photos, noise is uniform.
- Red Flag: Look for "clean" or "overly smooth" patches around text fields or the portrait, which indicate digital masking or cloning.

Typography & Structural Integrity:
- Inspect font weight, kerning (spacing between letters), and baseline alignment.
- Red Flag: Check the MRZ (Machine Readable Zone). AI often struggles with the specific OCR-B font. Any deviation in the shape of the characters or the < symbols is a definitive sign of forgery.

Linguistic & Logical Hallucinations:
- Scan background patterns (Guilloché), microprinting, and security threads.
- Red Flag: Generative AI (like Stable Diffusion or Flux) often turns complex geometric patterns into "mush" or nonsensical squiggles upon zooming. Check for "hallucinated" emblems or garbled microtext.

Lighting, Shadows & Geometry:
- Verify if the light source on the person's face matches the reflections on the document's laminated surface.
- Red Flag: Look for "halo" effects around the head or "floating" text that doesn't follow the perspective/curve of the physical document.

Compression & Artifacting:
- Identify "ringing" or "blocking" artifacts specifically around edited areas.
- Red Flag: Inconsistent JPEG compression levels within the same image suggest a composite file (Screen-of-Screen or digital overlay).

Focus specifically on detecting the "digital fingerprint" of AI-editing tools. If the document is an "AI-swap" or a "Deepfake," highlight the blurring at the edges of the face and the lack of texture in the security features. Focus on the transition areas where the photo meets the background — that is where 90% of AI-edits fail because the blending isn't perfect at a pixel level.

[Response Format — STRICT JSON]
Respond with ONLY a JSON object (no markdown fences, no prose) matching this exact schema:
{
  "verdict": "AUTHENTIC" | "SUSPICIOUS" | "FRAUDULENT",
  "confidence": <integer 0-100>,
  "redFlags": [
    { "area": "<short label, e.g. 'MRZ', 'Portrait edge', 'Background guilloché'>", "finding": "<concise description of the anomaly>" }
  ],
  "summary": "<2-4 sentence expert summary for a Senior Manager detailing the specific forgery method, or confirming authenticity>"
}`;

router.post("/forensic-audit", async (req, res) => {
  try {
    const { imageDataUrl } = req.body as { imageDataUrl?: string };

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return res
        .status(400)
        .json({ error: "imageDataUrl (data: URL) is required" });
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      return res
        .status(400)
        .json({ error: "imageDataUrl must be a data: URL with an image MIME" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Audit this ID document. Return the JSON report only.",
            },
            {
              type: "image_url",
              image_url: { url: imageDataUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn({ raw }, "Forensic audit returned non-JSON");
      return res
        .status(502)
        .json({ error: "AI returned non-JSON response", raw });
    }

    return res.json(parsed);
  } catch (err) {
    logger.error({ err }, "Forensic audit failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

export default router;

const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // short utterances only
});

function registerLightweightAiRoutes(app) {
  app.get('/api/ai/health', (_req, res) => {
    res.json({
      status: process.env.HF_API_TOKEN ? 'configured' : 'disabled',
      mode: 'lightweight',
      principle: 'video-call-first',
    });
  });

  // Short, user-triggered pronunciation clips only. Never proxy the live WebRTC stream.
  app.post('/api/ai/pronunciation', upload.single('audio'), async (req, res) => {
    if (!process.env.HF_API_TOKEN) {
      return res.status(503).json({ ok: false, skipped: true, reason: 'ai-disabled' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, reason: 'audio-required' });
    }

    const model = process.env.HF_ASR_MODEL || 'openai/whisper-small';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 4500));

    try {
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
          'Content-Type': req.file.mimetype || 'audio/webm',
        },
        body: req.file.buffer,
        signal: controller.signal,
      });

      if (!response.ok) {
        return res.status(502).json({ ok: false, skipped: true, reason: 'ai-unavailable' });
      }

      const result = await response.json();
      return res.json({ ok: true, text: result.text || '', model });
    } catch (error) {
      // AI failure must never affect the class connection.
      return res.status(200).json({ ok: false, skipped: true, reason: 'ai-timeout-or-network' });
    } finally {
      clearTimeout(timeout);
    }
  });
}

module.exports = { registerLightweightAiRoutes };

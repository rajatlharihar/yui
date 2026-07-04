// Standard Web Response API

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function openaiTTS(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { buffer: null, error: 'OPENAI_API_KEY is missing' };

  const voice = process.env.OPENAI_TTS_VOICE || 'sage';

  // gpt-4o-mini-tts accepts voice instructions — this is what gives Yui
  // her gentle Japanese-hostess delivery
  let response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: voice,
      instructions: 'You are Yui, the gracious hostess of a fine Japanese restaurant. Speak warmly and softly with a gentle, natural Japanese accent and an unhurried pace. Pronounce Japanese words (yokoso, omakase, hai) natively and with care.',
    }),
  });

  // Fall back to the plain tts-1 model if the instructed model is unavailable
  if (!response.ok) {
    response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: 'nova' }),
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { buffer: null, error: { source: 'openai', detail: error } };
  }
  return { buffer: await response.arrayBuffer(), error: null };
}

async function elevenTTS(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voiceId) {
    return { buffer: null, error: 'ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is missing' };
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId.trim()}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { buffer: null, error: { source: 'elevenlabs', detail: error } };
  }
  return { buffer: await response.arrayBuffer(), error: null };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get('text');

    if (!text) {
      return Response.json({ error: 'Text parameter is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const provider = (process.env.TTS_PROVIDER || 'openai').toLowerCase().trim();

    let result;
    if (provider === 'elevenlabs') {
      result = await elevenTTS(text);
      // ElevenLabs can refuse (e.g. free plan + library voice) — the voice
      // must never go silent, so fall back to OpenAI TTS automatically
      if (!result.buffer) {
        console.warn('ElevenLabs TTS failed, falling back to OpenAI:', JSON.stringify(result.error));
        result = await openaiTTS(text);
      }
    } else {
      result = await openaiTTS(text);
    }

    if (!result.buffer) {
      return Response.json({ error: 'TTS failed', detail: result.error }, { status: 502, headers: CORS_HEADERS });
    }

    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        ...CORS_HEADERS
      },
    });

  } catch (error) {
    console.error('TTS API error:', error);
    return Response.json({ error: 'Internal server error during speech generation', message: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return Response.json({}, { headers: CORS_HEADERS });
}

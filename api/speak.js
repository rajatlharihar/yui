// Standard Web Response API

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get('text');

    if (!text) {
      return Response.json({ error: 'Text parameter is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const rawProvider = process.env.TTS_PROVIDER || 'openai';
    const provider = rawProvider.toLowerCase().trim();
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (provider === 'openai') {
      if (!openaiApiKey) {
        return Response.json({ error: 'OPENAI_API_KEY is missing' }, { status: 500, headers: CORS_HEADERS });
      }

      const voice = process.env.OPENAI_TTS_VOICE || 'nova';

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return Response.json({ error: 'OpenAI TTS failed', detail: error }, { status: response.status, headers: CORS_HEADERS });
      }

      const audioBuffer = await response.arrayBuffer();

      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          ...CORS_HEADERS
        },
      });
    }

    if (provider === 'elevenlabs') {
      const elevenApiKey = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;

      if (!elevenApiKey || !voiceId) {
        return Response.json({ error: 'ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is missing' }, { status: 500, headers: CORS_HEADERS });
      }

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId.trim()}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey.trim(),
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
        return Response.json({ error: 'ElevenLabs TTS failed', detail: error }, { status: response.status, headers: CORS_HEADERS });
      }

      const audioBuffer = await response.arrayBuffer();

      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          ...CORS_HEADERS
        },
      });
    }

    return Response.json({ 
      error: 'Invalid TTS provider configuration', 
      configured_provider: rawProvider,
      expected: 'openai or elevenlabs' 
    }, { status: 400, headers: CORS_HEADERS });

  } catch (error) {
    console.error('TTS API error:', error);
    return Response.json({ error: 'Internal server error during speech generation', message: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return Response.json({}, { headers: CORS_HEADERS });
}

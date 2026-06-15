// Standard Web Response API

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio');

    if (!audioFile) {
      return Response.json(
        { error: 'No audio file provided' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is missing');
    }

    // --- CALL OPENAI WHISPER API ---
    const whisperFormData = new FormData();
    whisperFormData.append('file', audioFile, 'audio.webm'); // Whisper likes extensions
    whisperFormData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: whisperFormData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Whisper API error:', error);
      return Response.json(
        { error: 'Transcription failed at provider' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const data = await response.json();

    return Response.json(
      { text: data.text },
      { headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error('Transcription API error:', error);
    return Response.json(
      { error: 'Could not transcribe audio' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return Response.json({}, { headers: CORS_HEADERS });
}

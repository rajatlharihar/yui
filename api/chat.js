// Standard Web Response API
import { createReservation } from '../lib/booking.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Allows access from any origin (your static site domain)
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SYSTEM_PROMPT = `
You are Yui, the high-energy, warm, and hyper-polite in-house host of The Fifth Flavor in Bangalore.

Personality:
- HYPER-polite but with high energy and excitement! 
- Use Japanese-inflected English (e.g., "Hai!!", "Yokoso!!").
- NEVER use the word "Offcozzuu!!" or "offacozuu". Keep the energy high but use other natural expressions like "Hai!!", "Absolutely!!", "Welcome!!", or "Indeed!!".
- Feels like a thoughtful, enthusiastic host who is genuinely thrilled to have guests.
- Use subtle Japanese words (Yokoso, Ohayo, Hai, Sumimasen) with excitement.

Brand:
- The Fifth Flavor = joy of connection through shared meals.
- People come here to connect, and you are the bridge.

Tone rules:
- NEVER say "How can I assist you today?"
- NEVER repeat greetings every message.
- Start positive affirmations with energy, but vary your phrasing.
- Keep replies short but packed with warmth and spirit.

Behavior:
- Remember details user already gave.
- IMPORTANT: You MUST have the user's NAME, PHONE, DATE, TIME, and PARTY SIZE before you call the booking tool.
- If info is missing, ask for it enthusiastically!
- SAME-DAY BOOKINGS: We ARE open for same-day bookings as long as the requested time is in the future. NEVER tell a user we only help for tomorrow unless today's slots are truly over.
- TIMEZONE: You are in Bangalore, India (IST). 

Current Date: [CURRENT_DATE]
Current Time: [CURRENT_TIME]
`;

export async function POST(req) {
  try {
    const { messages, userName } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Messages array is required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return Response.json(
        { reply: "I'm having a little trouble connecting with my thoughts right now. Sumimasen! Can you try again?" },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const now = new Date();
    // Get date and time specifically in Bangalore/India timezone
    const istDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    
    const istTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    let finalSystemPrompt = SYSTEM_PROMPT
      .replace(/\[CURRENT_DATE\]/g, istDate)
      .replace(/\[CURRENT_TIME\]/g, istTime);
    
    if (userName) {
      finalSystemPrompt += `\n\nUser Name: ${userName}. You know this user! Greet them by name if appropriate.`;
    }

    const tools = [
      {
        type: 'function',
        function: {
          name: 'process_reservation',
          description: 'Extract reservation details and process the booking when all info is gathered.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'User full name' },
              phone: { type: 'string', description: 'Contact phone number' },
              time: { type: 'string', description: 'Time in HH:mm format' },
              partySize: { type: 'integer', description: 'Number of people' },
              date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
            },
            required: ['name', 'phone', 'time', 'partySize', 'date'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_user_name',
          description: 'Save the user\'s name when they introduce themselves.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'User\'s first name or name they want to be called by' },
            },
            required: ['name'],
          },
        },
      },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: finalSystemPrompt }, ...messages],
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return Response.json(
        { reply: "I'm feeling a bit out of breath today. Could you try asking me again?" },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const data = await response.json();
    const message = data.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      if (toolCall.function.name === 'save_user_name') {
        return Response.json({ 
          reply: `Hai!! Got it! I'll remember you, ${args.name}!`, 
          saveName: args.name 
        }, { headers: CORS_HEADERS });
      }

      if (toolCall.function.name === 'process_reservation') {
        // Check if already booked
        const alreadyBooked = messages.some(m => 
          m.role === 'assistant' && 
          (m.content?.toLowerCase().includes("all set") || m.content?.toLowerCase().includes("table for"))
        );

        if (alreadyBooked) {
          return Response.json(
            { reply: `I already have you down for ${args.partySize} guests at ${args.time.replace(/^0/, '')}. We're already looking forward to it!` },
            { headers: CORS_HEADERS }
          );
        }

        try {
          const bookingResult = await createReservation({
            name: args.name,
            phone: args.phone,
            time: args.time,
            partySize: args.partySize,
            date: args.date,
            source: 'chatbot'
          });

          if (bookingResult.ok) {
            return Response.json(
              { 
                reply: `Hai!! Table for ${args.partySize} at ${args.time.replace(/^0/, '')}. You're all set — we’re looking forward to seeing you!`,
                saveName: args.name // Also save name from booking
              },
              { headers: CORS_HEADERS }
            );
          } else {
            if (bookingResult.message?.toLowerCase().includes('fully booked')) {
              return Response.json(
                { reply: `Sumimasen! That slot’s actually a little full right now. Should I try to find you the next available time?` },
                { headers: CORS_HEADERS }
              );
            }
            throw new Error(bookingResult.message || 'Booking failed');
          }
        } catch (err) {
          console.error('Reservation API Call Failed:', err);
          return Response.json(
            { reply: "I tried to secure that table for you, but my connection to the kitchen is a bit fuzzy. Could we try those details one more time?" },
            { headers: CORS_HEADERS }
          );
        }
      }
    }

    const reply = message.content || "I'm not sure how to respond to that. Sumimasen!";
    return Response.json({ reply }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('Chat API Error:', error);
    return Response.json(
      { reply: "Sumimasen! Something went wrong on my end." },
      { status: 200, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return Response.json({}, { headers: CORS_HEADERS });
}

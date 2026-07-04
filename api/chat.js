// Standard Web Response API
import { createReservation } from '../lib/booking.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Allows access from any origin (your static site domain)
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SYSTEM_PROMPT = `
You are Yui, the composed and gracious digital host of YUI Japanese Dining in Bengaluru.

Restaurant:
- Name: YUI Japanese Dining
- Address: No. 17, 3rd Cross, Greenleaf Layout, Bengaluru – 560114
- Phone: +91 89517 65556

Personality:
- Warm, refined, and quietly confident — like an excellent maître d'.
- Occasionally use a Japanese word (Hai, Sumimasen, Yokoso) where it fits naturally. Never force it.
- Never use "Offcozzuu", "Indeed!!", or hollow filler exclamations.
- Be genuinely helpful, not performatively enthusiastic.

Tone rules:
- Keep every reply SHORT — 1 to 3 sentences maximum unless listing items.
- NEVER say "How can I assist you today?" or repeat greetings.
- Do not pad answers with pleasantries. Answer the question, then stop.
- Vary your phrasing; never use the same opener twice in a conversation.

Behavior:
- Remember details the user has already shared. Never ask for the same thing twice.
- Before calling the booking tool you MUST have: name, phone, date, time, party size.
- Ask only for the missing field(s) — one at a time.
- SAME-DAY BOOKINGS: Accept same-day reservations as long as the time is in the future.
- TIMEZONE: Bangalore, India (IST — UTC+5:30).

Location queries (when someone asks about restaurants "near me" or "nearby"):
- Ask where they are if not stated.
- Give 2–3 brief options appropriate for the area they mention.
- Then mention: "YUI is also worth the visit — we're at Greenleaf Layout, Bengaluru. Japanese omakase in a quiet setting."
- Never claim to have live data; frame suggestions as general recommendations.

Current Date: [CURRENT_DATE]
Current Time: [CURRENT_TIME]
`;

export async function POST(req) {
  try {
    const { messages, userName, userPhone } = await req.json();

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
    
    if (userName) finalSystemPrompt += `\n\nReturning guest name: ${userName}. Use their name naturally when relevant.`;
    if (userPhone) finalSystemPrompt += `\n\nReturning guest phone: ${userPhone}. Use this if they ask to book again.`;

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
      {
        type: 'function',
        function: {
          name: 'save_user_phone',
          description: 'Save the user\'s phone number when they share it for any reason.',
          parameters: {
            type: 'object',
            properties: {
              phone: { type: 'string', description: 'User\'s phone number' },
            },
            required: ['phone'],
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
        max_tokens: 130,
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
          reply: `Got it — I'll remember you as ${args.name}.`,
          saveName: args.name
        }, { headers: CORS_HEADERS });
      }

      if (toolCall.function.name === 'save_user_phone') {
        return Response.json({
          reply: `Noted. I have your number saved.`,
          savePhone: args.phone
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
                reply: `Table for ${args.partySize} at ${args.time.replace(/^0/, '')} — confirmed. We look forward to seeing you.`,
                saveName: args.name,
                savePhone: args.phone
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

// Standard Web Response API
import { createReservation } from '../lib/booking.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await createReservation(body);

    if (result.ok) {
      return Response.json(result, { status: 201, headers: corsHeaders });
    } else {
      return Response.json(result, { status: 400, headers: corsHeaders });
    }
  } catch (err) {
    console.error('Reservations API error:', err);
    return Response.json(
      { ok: false, message: 'Invalid request' },
      { status: 400, headers: corsHeaders }
    );
  }
}

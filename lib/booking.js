import { supabase } from './supabase.js';

/**
 * Shared logic for creating a reservation.
 * Used by both the direct API and the Chatbot tool.
 */
export async function createReservation({ name, phone, date, time, partySize, occasion, note, source }) {
  try {
    // 0. Validation
    if (!name || !phone || !date || !time || !partySize) {
      return { ok: false, message: 'Missing required booking information' };
    }

    // 1. Table type mapping
    let table_type;
    if (partySize <= 2) {
      table_type = 'two_top';
    } else if (partySize <= 6) {
      table_type = 'four_five';
    } else {
      table_type = 'private_room';
    }

    // 2. Standardize Time
    const timeParts = time.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const dbTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    // 3. Check Availability
    const { data: inventory, error: inventoryError } = await supabase
      .from('table_inventory')
      .select('quantity')
      .eq('table_type', table_type)
      .single();

    if (inventoryError) throw new Error('Error checking table inventory');

    const { data: existing, error: countError } = await supabase
      .from('reservations')
      .select('party_size')
      .eq('date', date)
      .eq('time', dbTime)
      .eq('table_type', table_type)
      .in('status', ['pending', 'confirmed', 'seated']);

    if (countError) throw new Error('Error checking existing bookings');

    const currentBookings = (existing || []).length;
    const maxBookings = inventory.quantity;

    if (currentBookings >= maxBookings) {
      return { ok: false, message: 'Selected time is fully booked' };
    }

    // 4. Insert into Supabase
    const { error } = await supabase.from('reservations').insert({
      name: name.trim(),
      phone: phone.trim(),
      date,
      time: dbTime,
      party_size: Number(partySize),
      table_type,
      status: 'pending',
      source: source || 'website',
      occasion: occasion || null,
      note: note || null,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      throw new Error('Failed to save reservation');
    }

    return { ok: true, message: 'Reservation received' };
  } catch (err) {
    console.error('Booking Logic Error:', err);
    return { ok: false, message: err.message };
  }
}

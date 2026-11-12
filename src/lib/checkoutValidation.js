/* SHONOWEAR — checkout field validation (shared by the form and the server; never trust the client copy) */

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** @returns {{ ok: boolean, errors: Record<string,string>, data?: object }} */
export function validateCustomer(input) {
  const i = input && typeof input === 'object' ? input : {};
  const d = {
    name:    clean(i.name, 80),
    phone:   String(i.phone ?? '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''),
    email:   clean(i.email, 120).toLowerCase(),
    line1:   clean(i.line1, 120),
    line2:   clean(i.line2, 120),
    city:    clean(i.city, 60),
    state:   clean(i.state, 60),
    pincode: String(i.pincode ?? '').trim(),
  };
  const errors = {};
  if (d.name.length < 2) errors.name = 'Enter your full name.';
  if (!/^[6-9]\d{9}$/.test(d.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Enter a valid email address.';
  if (d.line1.length < 5) errors.line1 = 'Enter your house/flat and street.';
  if (d.city.length < 2) errors.city = 'Enter your city.';
  if (!STATES.includes(d.state)) errors.state = 'Choose your state.';
  if (!/^[1-9]\d{5}$/.test(d.pincode)) errors.pincode = 'Enter a valid 6-digit pincode.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, errors: {}, data: d };
}

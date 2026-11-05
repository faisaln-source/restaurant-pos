#!/usr/bin/env node
/**
 * Restaurant POS — License Key Generator CLI
 *
 * Usage:
 *   node dist/cli.js \
 *     --restaurant "Spice Garden" \
 *     --email owner@spice.com \
 *     --expiry 2027-11-05 \    (optional — defaults to 1 year from today)
 *     --devices 3 \
 *     --features dine-in,takeaway,kds,reports
 *
 * Set the LICENSE_SECRET environment variable before running.
 */

import { generateLicense, LicenseFeature } from './index';

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

/** Returns a date string exactly N years from today (YYYY-MM-DD). */
function yearsFromToday(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

function usage() {
  console.log(`
Restaurant POS License Key Generator
─────────────────────────────────────
Usage:
  LICENSE_SECRET=<secret> node dist/cli.js \\
    --restaurant "Restaurant Name" \\
    --email contact@email.com \\
    --expiry 2027-11-05 \\        (optional, default: 1 year from today)
    --devices 1 \\                 (default: 1)
    --features dine-in,takeaway,kds,reports

Available features: dine-in, takeaway, delivery, kds, reports, multi-terminal

NOTE: Every license expires. There is no lifetime option.
      Renew by generating a new key with a new expiry date.
`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) usage();

const secret = process.env.LICENSE_SECRET;
if (!secret) {
  console.error('❌  Error: LICENSE_SECRET environment variable is not set');
  console.error('   export LICENSE_SECRET="your-long-secret-here"');
  process.exit(1);
}

const restaurantName = getArg('--restaurant');
const email          = getArg('--email');
const devicesRaw     = getArg('--devices') ?? '1';
const featuresRaw    = getArg('--features') ?? 'dine-in,takeaway,kds,reports';

// Default: 1 year from today. User may override with --expiry YYYY-MM-DD.
const expiryArg = getArg('--expiry') ?? yearsFromToday(1);

if (!restaurantName) { console.error('❌  Missing --restaurant'); usage(); }
if (!email)          { console.error('❌  Missing --email');      usage(); }

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryArg) || isNaN(new Date(expiryArg).getTime())) {
  console.error(`❌  Invalid --expiry date "${expiryArg}". Use YYYY-MM-DD format.`);
  process.exit(1);
}

// Warn if expiry is in the past
if (new Date(expiryArg) < new Date()) {
  console.error(`❌  Expiry date ${expiryArg} is in the past.`);
  process.exit(1);
}

const devices = parseInt(devicesRaw, 10);
if (isNaN(devices) || devices < 1) {
  console.error('❌  --devices must be a positive integer');
  process.exit(1);
}

const features = featuresRaw.split(',').map(f => f.trim()) as LicenseFeature[];
const issuedAt = new Date().toISOString().split('T')[0];

try {
  const { key, payload } = generateLicense(
    {
      restaurantName: restaurantName!,
      email: email!,
      issuedAt,
      expiresAt: expiryArg,   // always set — no lifetime
      maxDevices: devices,
      features,
    },
    secret,
  );

  const daysValid = Math.ceil(
    (new Date(expiryArg).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  console.log('\n✅  License Generated Successfully');
  console.log('══════════════════════════════════════════════════');
  console.log(`Restaurant : ${payload.restaurantName}`);
  console.log(`Email      : ${payload.email}`);
  console.log(`License ID : ${payload.licenseId}`);
  console.log(`Issued     : ${payload.issuedAt}`);
  console.log(`Expires    : ${payload.expiresAt!} (${daysValid} days)`);
  console.log(`Devices    : ${payload.maxDevices}`);
  console.log(`Features   : ${payload.features.join(', ')}`);
  console.log('──────────────────────────────────────────────────');
  console.log(`\nLicense Key:\n\n  ${key}\n`);
  console.log('Send the License Key above to the customer.');
  console.log('══════════════════════════════════════════════════\n');
} catch (err) {
  console.error('❌  Error generating license:', (err as Error).message);
  process.exit(1);
}


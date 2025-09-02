const crypto = require('crypto');
const cfg = require('../config');

function hmacSignUserLink(userId, expSecondsFromNow) {
  if (!cfg.addonSigning.secret) return null;
  const exp = Math.floor(Date.now() / 1000) + (expSecondsFromNow || cfg.addonSigning.ttlSeconds);
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', cfg.addonSigning.secret).update(payload).digest('hex');
  return { sig, exp };
}
function hmacVerifyUserLink(userId, sig, exp) {
  if (!cfg.addonSigning.secret) return true; // signing disabled
  if (!sig || !exp) return false;
  const payload = `${userId}.${exp}`;
  const expected = crypto.createHmac('sha256', cfg.addonSigning.secret).update(payload).digest('hex');
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return false;
  const now = Math.floor(Date.now() / 1000);
  return now <= parseInt(exp, 10);
}

module.exports = { hmacSignUserLink, hmacVerifyUserLink };

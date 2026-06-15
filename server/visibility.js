// Pure startup-visibility rules (no DB dependency) so they can be unit-tested
// without building the native sqlite binding (audit: split pure tests from DB).

// A startup is "listed" (publicly discoverable) once it has a pitch video and is
// not hidden by an admin. Non-owners/non-admins must not see unlisted startups.
function isListed(startup) {
  return !!(startup && startup.video_url && !startup.hidden);
}

function canViewStartup(startup, user) {
  if (!startup) return false;
  if (isListed(startup)) return true;
  return !!(user && (user.role === 'admin' || startup.founder_id === user.id));
}

module.exports = { isListed, canViewStartup };

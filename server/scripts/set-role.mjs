/**
 * set-role.mjs — operator command to set an account's role from the VPS shell
 * (bootstraps the first admin before Google/GitHub sign-in is configured).
 *
 * Usage (on the VPS):
 *   sudo -u blogspro-api node --disable-warning=ExperimentalWarning \
 *     /opt/blogspro-api/scripts/set-role.mjs you@example.com admin
 */
import { openDatabase } from '../src/db.js';
import { ROLES } from '../src/users.js';

const [email, role] = process.argv.slice(2);
if (!email || !ROLES.has(role)) {
  process.stderr.write(`Usage: set-role.mjs <email> <${[...ROLES].join('|')}>\n`);
  process.exit(2);
}

const db = openDatabase(process.env.DB_PATH || '/var/lib/blogspro-api/blogspro.db');
const result = db.prepare('UPDATE users SET role = ?, requested_role = NULL, updated_at = ? WHERE email = ?')
  .run(role, new Date().toISOString(), email.trim());
db.close();

if (result.changes === 0) {
  process.stderr.write(`No account for ${email}. Register it at https://blogspro.in/register.html first.\n`);
  process.exit(1);
}
process.stdout.write(`${email} is now ${role}.\n`);

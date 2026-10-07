import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'glurps-v2-'));
process.env.DATABASE_PATH = join(directory, 'nested', 'test.db');
try {
  const { sqlite } = await import('../dist/database/database.js');
  assert.equal(sqlite.pragma('journal_mode', { simple: true }), 'wal');
  const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  for (const table of ['events', 'event_applications', 'event_participants', 'verified_players', 'welcome_configs', 'button_roles']) {
    assert(tables.has(table), `Missing ${table}`);
  }
  const fields = new Set(sqlite.prepare('PRAGMA table_info(events)').all().map(row => row.name));
  for (const field of ['verify_required', 'google_forms_enabled', 'google_form_url']) assert(fields.has(field));
  const { loadCommands, publicCommands } = await import('../dist/handlers/CommandHandler.js');
  const commands = await loadCommands();
  assert.equal(commands.size, 24);
  for (const name of ['verify', 'unverify', 'event', 'events', 'participants', 'ticket', 'ticketstaff', 'ticketpanel', 'moderation', 'adminmod', 'channel', 'purge', 'server', 'status', 'help', 'ping', 'automod', 'levels', 'cases', 'applications', 'verify-panel']) {
    assert(commands.has(name), `Missing /${name}`);
    const command = commands.get(name);
    const definition = command.data.toJSON();
    assert.equal(definition.default_member_permissions, publicCommands.has(name)?null:PermissionFlagsBits.Administrator.toString(), `/${name} is visible by default to non-admins`);
    assert.equal(definition.dm_permission, false);
    if(!publicCommands.has(name)) for (const permissions of [null, new PermissionsBitField(), new PermissionsBitField(PermissionFlagsBits.ManageGuild)]) {
      let response;
      await command.execute({ inGuild: () => true, memberPermissions: permissions, reply: async payload => { response = payload; } });
      assert.equal(response?.flags, 64);
      assert.match(response?.content ?? '', /Administrator/);
    }
    let dmResponse;
    await command.execute({ inGuild: () => false, reply: async payload => { dmResponse = payload; } });
    assert.match(dmResponse?.content ?? '', /Administrator/);
  }
  sqlite.close();
  console.log('Replacement database and 24-command registry check passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

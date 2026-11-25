import { test } from 'node:test';
import assert from 'node:assert';
import { validateSafeSelectQuery as v } from './aiChatService';

test('SELECT ปกติผ่าน และเติม LIMIT', () => {
  assert.equal(v('```sql\nSELECT * FROM rooms;\n```'), 'SELECT * FROM rooms LIMIT 50');
  assert.equal(v('SELECT id FROM rooms LIMIT 5'), 'SELECT id FROM rooms LIMIT 5');
});

test('บล็อกคำสั่งอันตราย', () => {
  for (const q of [
    'DELETE FROM rooms',
    'SELECT 1; DROP TABLE rooms',
    'SELECT * FROM rooms UNION SELECT * FROM teachers',
    'SELECT SLEEP(10)',
    'SELECT * FROM rooms INTO OUTFILE "/tmp/x"',
    'SELECT * FROM rooms -- x',
  ]) assert.throws(() => v(q), q);
});

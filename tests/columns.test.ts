// Tests for the "which columns do I see" logic. Run with:  npm test
import assert from 'node:assert/strict';
import { isColumnOn, PROFESSOR_COLUMNS, personColumnId, setColumn, UNIVERSITY_COLUMNS } from '../src/lib/columns.ts';

// no choices: every column follows its default
assert.equal(isColumnOn(undefined, 'fee', false), false);
assert.equal(isColumnOn([], 'program', true), true);
assert.equal(isColumnOn(undefined, personColumnId('u_1'), true), true);

// switching a column on / off
let c = setColumn(undefined, 'fee', false, true);
assert.deepEqual(c, ['+fee']);
assert.equal(isColumnOn(c, 'fee', false), true);
c = setColumn(c, 'program', true, false);
assert.deepEqual(c, ['+fee', '-program']);
assert.equal(isColumnOn(c, 'program', true), false);
assert.equal(isColumnOn(c, 'deadline', true), true, 'untouched columns keep their default');

// going back to the default removes the choice, so the list stays small
c = setColumn(c, 'fee', false, false);
assert.deepEqual(c, ['-program']);
c = setColumn(c, 'program', true, true);
assert.deepEqual(c, []);

// switching the same column twice never piles up entries
let d: string[] | undefined;
for (let i = 0; i < 5; i++) d = setColumn(d, 'fee', false, i % 2 === 0);
assert.deepEqual(d, ['+fee']);

// a person's column
const p = personColumnId('u_abc123');
assert.equal(p, 'person:u_abc123');
c = setColumn(undefined, p, true, false);
assert.deepEqual(c, ['-person:u_abc123']);
assert.equal(isColumnOn(c, p, true), false);
assert.equal(isColumnOn(c, personColumnId('u_new'), true), true, 'a person who joins later is shown');

// one person's choices never touch another list's choices
const universities = setColumn(undefined, 'fee', false, true);
const professors = setColumn(undefined, 'email', false, true);
assert.notDeepEqual(universities, professors);

// every id the app can save passes the server's rule
const CHOICE = /^[+-][a-z_]+(:[A-Za-z0-9_]+)?$/;
for (const def of [...UNIVERSITY_COLUMNS, ...PROFESSOR_COLUMNS]) {
  assert.ok(CHOICE.test(`+${def.id}`) && CHOICE.test(`-${def.id}`), def.id);
}
assert.ok(CHOICE.test('+person:u_abc123def456'));

// the application fee can be chosen on the Universities list, and is off by default
assert.equal(UNIVERSITY_COLUMNS.find((x) => x.id === 'fee')?.default, false);
// the original columns are still shown by default, so nobody's view changes by surprise
assert.deepEqual(UNIVERSITY_COLUMNS.filter((x) => x.default).map((x) => x.id), ['program', 'deadline', 'priority']);
assert.deepEqual(PROFESSOR_COLUMNS.filter((x) => x.default).map((x) => x.id), ['university', 'deadline']);

console.log('ALL COLUMN CHOICE CHECKS PASSED');

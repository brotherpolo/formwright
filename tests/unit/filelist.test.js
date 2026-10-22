import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asFiles, filesText, fileNames, fileLines, fileKind, filesDiff, diffText, sizeText } from '../../src/filelist.js';
import { findPending, fillUploaded } from '../../src/offlinequeue.js';
import { foldKeys, ownAttachments } from '../../src/foldlogic.js';
import { fieldItem, fieldKind } from '../../src/pdfdoc.js';

const a = { name: 'Permit.pdf', size: 389120, type: 'application/pdf', path: 'uploads/f/u/1-a-Permit.pdf', url: 'https://x/p' };
const b = { name: 'Roof.jpg', size: 2400000, type: 'image/jpeg', path: 'uploads/f/u/2-b-Roof.jpg', url: 'https://x/r' };
const w = { name: 'Notes.docx', size: 900, type: '', path: 'uploads/f/u/3-c-Notes.docx', url: '', pending: 'up-1' };

test('asFiles: a list, an old single file, or nothing', () => {
  assert.deepEqual(asFiles([a, null, 'x', b]), [a, b]);
  assert.deepEqual(asFiles(a), [a]);
  assert.deepEqual(asFiles(null), []);
  assert.deepEqual(asFiles(''), []);
  assert.deepEqual(asFiles({}), []);
});

test('text for lists, PDFs and Word', () => {
  assert.equal(filesText([a, b]), '2 files');
  assert.equal(filesText([a]), '1 file');
  assert.equal(filesText([]), '');
  assert.deepEqual(fileNames([a, w]), ['Permit.pdf', 'Notes.docx']);
  assert.equal(fileLines([a, b]), 'Permit.pdf · 380 KB\nRoof.jpg · 2.3 MB');
  assert.equal(sizeText(0), '');
});

test('fileKind picks the tile', () => {
  assert.equal(fileKind(a).kind, 'pdf');
  assert.equal(fileKind(b).kind, 'img');
  assert.equal(fileKind({ name: 'takeoff.XLSX' }).kind, 'xls');
  assert.deepEqual(fileKind({ name: 'list.csv' }), { kind: 'xls', tag: 'CSV' });
  assert.equal(fileKind(w).kind, 'doc');
  assert.equal(fileKind({ name: 'deck.pptx' }).kind, 'ppt');
  assert.equal(fileKind({ name: 'site.zip' }).kind, 'zip');
  assert.equal(fileKind({ name: 'IMG_0001.HEIC' }).kind, 'img');
  assert.deepEqual(fileKind({ name: 'plan.dwg' }), { kind: 'file', tag: 'DWG' });
  assert.deepEqual(fileKind({ name: 'README' }), { kind: 'file', tag: 'FILE' });
});

test('filesDiff: added and removed, and an upload finishing is not a change', () => {
  assert.deepEqual(filesDiff([a], [a, b]), { added: ['Roof.jpg'], removed: [] });
  assert.deepEqual(filesDiff([a, b], [b]), { added: [], removed: ['Permit.pdf'] });
  assert.deepEqual(filesDiff([w], [{ ...w, url: 'https://x/n', pending: undefined }]), { added: [], removed: [] });
  assert.equal(diffText(filesDiff([b], [a])), 'Added Permit.pdf · Removed Roof.jpg');
  assert.equal(diffText(filesDiff(null, [a])), 'Added Permit.pdf');
  assert.equal(diffText(filesDiff([a], [a])), '');
});

test('waiting uploads inside an Attachments list', () => {
  const recs = [{ id: 'r1', values: { att: [a, w] } }, { id: 'r2', values: { one: { ...w, pending: 'up-2' } } }];
  assert.deepEqual(findPending(recs, 'up-1'), [{ recordId: 'r1', fieldId: 'att' }]);
  assert.deepEqual(findPending(recs, 'up-2'), [{ recordId: 'r2', fieldId: 'one' }]);
  const filled = fillUploaded([a, w], 'up-1', 'https://x/n');
  assert.equal(filled[1].url, 'https://x/n');
  assert.equal('pending' in filled[1], false);
  assert.equal(filled[0], a, 'others untouched');
  assert.equal(fillUploaded({ ...w }, 'up-1', 'u').url, 'u');
  assert.equal(fillUploaded(a, 'up-1', 'u'), a);
  // two waiting in one list, filled one after the other
  const two = [w, { ...w, name: 'B', pending: 'up-9' }];
  const both = fillUploaded(fillUploaded(two, 'up-1', 'u1'), 'up-9', 'u9');
  assert.deepEqual(both.map((x) => x.url), ['u1', 'u9']);
});

test('an Attachments field outside any section is its own section', () => {
  const fields = [{ id: 'att0', type: 'attachments' }, { id: 'h1', type: 'heading' }, { id: 'att1', type: 'attachments' }, { id: 't', type: 'text' }];
  assert.deepEqual(ownAttachments(fields).map((f) => f.id), ['att0']);
  assert.deepEqual(foldKeys({ fields }, ['g1'], []), ['h:h1', 'a:att0', 'g:g1']);
});

test('PDFs list each file on its own line', () => {
  assert.equal(fieldKind('attachments'), 'long');
  const it = fieldItem({ type: 'attachments', label: 'Files', width: 'half' }, [a, b], fileLines([a, b]));
  assert.equal(it.kind, 'long');
  assert.equal(it.width, 'full');
  assert.equal(it.text, 'Permit.pdf · 380 KB\nRoof.jpg · 2.3 MB');
  assert.equal(fieldItem({ type: 'attachments', label: 'Files' }, [], '').text, '');
});

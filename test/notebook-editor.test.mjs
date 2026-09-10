import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './helpers/load-typescript.mjs';
const { parseNotebook, serializeNotebook, makeBlock, changeBlockKind, toggleNotebookCheck, splitNotebookBlock, mergeNotebookBackward, notebookShortcut, NotebookHistory } = loadTypescript('src/lib/notebook-model.ts');

test('opening and saving a legacy document preserves exact Markdown, blanks and unsupported structures', () => {
  const samples = [
    '', '\n\n', '# Title\n\nFirst paragraph with **bold**, _italic_, [link](https://example.test).\n\n',
    '##   Heading\n*  one\n  - nested\n  + [X]  done\n7) Item\n>quote\n> quoted\n***\n',
    '| Column | Value |\n| --- | --- |\n| Real | 23 |\n\n![Alt](image.png)\n#### Fourth heading\n<div>Raw HTML</div>',
    '```typescript\nconst n = 1;\n\nconsole.log(n);\n```\n\nNext',
    '~~~\n~~~', '```\n\n```', '```\n```', '````js\n```\n````',
    '```unfinished\n- preserve this exactly',
    '# Heading\r\n\r\nparagraph\r\n',
  ];
  for (const source of samples) assert.equal(serializeNotebook(parseNotebook(source)), source);
});

test('new content typed into a formerly empty fenced block gets a separate closing fence', () => {
  const [block] = parseNotebook('```js\n```');
  assert.equal(serializeNotebook([{ ...block, text: 'const x = 2;' }]), '```js\nconst x = 2;\n```');
});

test('Enter splits around the selected text and returns headings to normal writing', () => {
  const original = parseNotebook('## Start middle end\nnext');
  const split = splitNotebookBlock(original, 0, 6, 12, 10);
  assert.equal(serializeNotebook(split.blocks), '## Start \n end\nnext');
  assert.deepEqual(split.focus, { id: 10, offset: 0 });
  assert.equal(split.blocks[1].kind, 'text');
  assert.equal(serializeNotebook(original), '## Start middle end\nnext');
});

test('blank lines are retained, including repeated Enter at the end of the page', () => {
  let blocks = parseNotebook('Thought');
  blocks = splitNotebookBlock(blocks, 0, 7, 7, 1).blocks;
  blocks = splitNotebookBlock(blocks, 1, 0, 0, 2).blocks;
  assert.equal(serializeNotebook(blocks), 'Thought\n\n');
  const joined = mergeNotebookBackward(blocks, 2);
  assert.equal(serializeNotebook(joined.blocks), 'Thought\n');
});

test('lists continue their semantics and an empty item exits without adding a phantom item', () => {
  for (const source of ['* item', '4) item', '- [x] item', '> item']) {
    const original = parseNotebook(source), split = splitNotebookBlock(original, 0, 4, 4, 1);
    assert.equal(split.blocks[1].kind, original[0].kind);
    assert.equal(split.blocks[1].checked, false);
    if (source.startsWith('4')) assert.equal(split.blocks[1].prefix, '5) ');
    const exit = splitNotebookBlock(split.blocks, 1, 0, 0, 2);
    assert.equal(exit.blocks.length, 2);
    assert.equal(exit.blocks[1].kind, 'text');
    assert.equal(exit.blocks[1].prefix, '');
  }
});

test('Backspace removes formatting first, then merges paragraphs with the correct caret', () => {
  const original = parseNotebook('Previous\n## heading');
  const plain = mergeNotebookBackward(original, 1);
  assert.equal(serializeNotebook(plain.blocks), 'Previous\nheading');
  const merged = mergeNotebookBackward(plain.blocks, 1);
  assert.equal(serializeNotebook(merged.blocks), 'Previousheading');
  assert.deepEqual(merged.focus, { id: 0, offset: 8 });
  const divider = mergeNotebookBackward(parseNotebook('Before\n---\nAfter'), 2);
  assert.equal(serializeNotebook(divider.blocks), 'Before\nAfter');
});

test('leaving a code block keeps all code intact, even when the caret is in the middle', () => {
  const blocks = parseNotebook('```js\nfirst\nsecond\n```');
  const result = splitNotebookBlock(blocks, 0, 2, 2, 1);
  assert.equal(serializeNotebook(result.blocks), '```js\nfirst\nsecond\n```\n');
  assert.equal(result.blocks[1].kind, 'text');
});

test('changing block types preserves content and checklist marks remain in sync', () => {
  const [source] = parseNotebook('  * [X]  Existing **text**');
  assert.equal(serializeNotebook([toggleNotebookCheck(source, false)]), '  * [ ]  Existing **text**');
  assert.equal(serializeNotebook([changeBlockKind(source, 'check')]), '- [x] Existing **text**');
  assert.equal(serializeNotebook([changeBlockKind(source, 'heading3')]), '### Existing **text**');
  assert.equal(notebookShortcut('[] '), 'check');
  assert.equal(notebookShortcut('## '), 'heading2');
  assert.equal(notebookShortcut('An ordinary thought'), null);
});

test('undo spans typing, split and formatting, redo restores them, and edits after undo drop the redo branch', () => {
  const history = new NotebookHistory();
  const initial = { blocks: [makeBlock(0)], focus: { id: 0, offset: 0 } };
  history.record(initial, 'typing:0', 1000);
  const firstLetter = { blocks: [makeBlock(0, 'text', 'H')], focus: { id: 0, offset: 1 } };
  history.record(firstLetter, 'typing:0', 1200);
  const thought = { blocks: [makeBlock(0, 'text', 'Hello')], focus: { id: 0, offset: 5 } };
  history.record(thought, '', 1300);
  const split = splitNotebookBlock(thought.blocks, 0, 5, 5, 1);
  assert.equal(serializeNotebook(history.undo(split).blocks), 'Hello');
  assert.equal(serializeNotebook(history.undo(thought).blocks), '');
  assert.equal(serializeNotebook(history.redo(initial).blocks), 'Hello');
  assert.equal(serializeNotebook(history.redo(thought).blocks), 'Hello\n');
  history.undo(split);
  history.record(thought, '', 1500);
  assert.equal(history.canRedo, false);
});

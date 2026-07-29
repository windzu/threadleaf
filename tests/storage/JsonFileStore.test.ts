import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JsonFileStore } from '../../src/storage/JsonFileStore';
import { MemoryJsonFileAdapter } from '../helpers/MemoryJsonFileAdapter';

describe('JsonFileStore', () => {
  it('creates through a temporary file and atomically processes updates', async () => {
    const adapter = new MemoryJsonFileAdapter();
    const store = new JsonFileStore(adapter, '.threadleaf/state.json');

    await store.save({ value: 1 });

    assert.equal(adapter.renameCallCount, 1);
    assert.equal(adapter.processCallCount, 0);
    assert.deepEqual(adapter.readJson('.threadleaf/state.json'), { value: 1 });
    assert.equal(
      [...adapter.files.keys()].some(path => path.includes('.tmp-')),
      false,
    );

    await store.save({ value: 2 });

    assert.equal(adapter.renameCallCount, 1);
    assert.equal(adapter.processCallCount, 1);
    assert.deepEqual(adapter.readJson('.threadleaf/state.json'), { value: 2 });
  });

  it('preserves the previous document after a failed update and recovers its queue', async () => {
    const adapter = new MemoryJsonFileAdapter();
    const store = new JsonFileStore(adapter, '.threadleaf/state.json');
    await store.save({ value: 'stable' });

    adapter.failNextProcess = true;
    await assert.rejects(
      store.save({ value: 'broken' }),
      /Injected process failure/,
    );
    assert.deepEqual(
      adapter.readJson('.threadleaf/state.json'),
      { value: 'stable' },
    );

    await store.save({ value: 'recovered' });
    assert.deepEqual(
      adapter.readJson('.threadleaf/state.json'),
      { value: 'recovered' },
    );
  });

  it('cleans a partial temporary file when initial creation fails', async () => {
    const adapter = new MemoryJsonFileAdapter();
    const store = new JsonFileStore(adapter, '.threadleaf/state.json');
    adapter.failNextWrite = true;

    await assert.rejects(
      store.save({ value: 'partial' }),
      /Injected write failure/,
    );

    assert.equal(await adapter.exists('.threadleaf/state.json'), false);
    assert.equal(
      [...adapter.files.keys()].some(path => path.includes('.tmp-')),
      false,
    );
  });
});

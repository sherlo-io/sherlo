import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStagedUploadUrls: vi.fn(),
  putBuffer: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock('../../../seams/serverCalls', () => ({
  serverCalls: () => ({ getStagedUploadUrls: mocks.getStagedUploadUrls }),
}));
vi.mock('../uploadStagedArtifacts', () => ({ putBuffer: mocks.putBuffer }));
vi.mock('../../../helpers/logWarning', () => ({ default: mocks.logWarning }));

import { stageTheModuleMap } from '../stageTheModuleMap';

const MODULE_MAP = { raw: Buffer.from('{"files":{}}') } as never;
const PARAMS = { platform: 'ios', ticket: 'tok', teamId: 'team', projectIndex: 3 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStagedUploadUrls.mockResolvedValue({
    stagedPresignedUploadUrls: { ios: { manifest: { url: 'https://put', s3Key: 'map-key' } } },
  });
  mocks.putBuffer.mockResolvedValue(undefined);
});

describe('staging a module map for the service to count stories from', () => {
  it('uploads the module map to the manifest slot and answers its key', async () => {
    const key = await stageTheModuleMap({ ...PARAMS, moduleMap: MODULE_MAP });

    expect(key).toBe('map-key');
    expect(mocks.putBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'ios', uploadUrl: 'https://put' })
    );
  });

  it('answers nothing and asks for no slot when there is no module map', async () => {
    expect(await stageTheModuleMap({ ...PARAMS, moduleMap: null })).toBeUndefined();
    expect(mocks.getStagedUploadUrls).not.toHaveBeenCalled();
  });

  it('answers nothing when the service offers no manifest slot', async () => {
    mocks.getStagedUploadUrls.mockResolvedValue({ stagedPresignedUploadUrls: { ios: {} } });

    expect(await stageTheModuleMap({ ...PARAMS, moduleMap: MODULE_MAP })).toBeUndefined();
    expect(mocks.putBuffer).not.toHaveBeenCalled();
  });

  it('warns and answers nothing when the upload fails, never throwing', async () => {
    mocks.putBuffer.mockRejectedValue(new Error('S3 down'));

    expect(await stageTheModuleMap({ ...PARAMS, moduleMap: MODULE_MAP })).toBeUndefined();
    expect(mocks.logWarning).toHaveBeenCalledWith({
      message: expect.stringContaining('S3 down'),
    });
  });
});

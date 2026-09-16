import { BadRequestException } from '@nestjs/common';
import { Campus } from '@prisma/client';
import { AssetTransfersService } from './asset-transfers.service';

describe('AssetTransfersService request invariants', () => {
  const service = new AssetTransfersService({} as any, {} as any, {} as any);

  it('accepts explicit source and destination campuses', () => {
    expect((service as any).campuses({ sourceCampus: Campus.MC1, destinationCampus: Campus.MC2 })).toEqual({ sourceCampus: Campus.MC1, destinationCampus: Campus.MC2 });
  });

  it('does not infer source campus and rejects same-campus transfers', () => {
    expect(() => (service as any).campuses({ destinationCampus: Campus.MC2 })).toThrow(BadRequestException);
    expect(() => (service as any).campuses({ sourceCampus: Campus.MC1, destinationCampus: Campus.MC1 })).toThrow(BadRequestException);
  });
});

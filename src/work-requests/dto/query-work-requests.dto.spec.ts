import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryWorkRequestsDto } from './query-work-requests.dto';

describe('QueryWorkRequestsDto', () => {
  it.each(['ONLINE', 'WALK_IN'])('accepts the existing WorkRequestSource value %s', async source => {
    const errors = await validate(plainToInstance(QueryWorkRequestsDto, { source }));
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid source value', async () => {
    const errors = await validate(plainToInstance(QueryWorkRequestsDto, { source: 'INVALID' }));
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'source', constraints: expect.objectContaining({ isEnum: expect.any(String) }) }),
    ]));
  });
});

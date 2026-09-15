import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StockMovementsController } from './stock-movements.controller';

describe('StockMovementsController authorization', () => {
  const service: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const controller = new StockMovementsController(service);

  beforeEach(() => jest.resetAllMocks());

  it('requires JWT authentication for stock movement reads', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, StockMovementsController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('requires role authorization for writes and uses token userId as performer', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        StockMovementsController.prototype.create,
      ) || [];
    expect(guards).toContain(RolesGuard);

    controller.create(
      { user: { userId: 'token-user', id: 'client-controlled-id' } },
      { inventoryItemId: 'item-1' } as any,
    );
    expect(service.create).toHaveBeenCalledWith(
      'token-user',
      expect.anything(),
    );
  });
});

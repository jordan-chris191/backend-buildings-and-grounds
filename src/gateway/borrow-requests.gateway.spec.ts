import { BorrowRequestsGateway } from './borrow-requests.gateway';

describe('BorrowRequestsGateway authentication', () => {
  const jwt: any = { verifyAsync: jest.fn() };
  const prisma: any = { user: { findUnique: jest.fn() } };
  const gateway = new BorrowRequestsGateway(jwt, prisma);
  const client = (token?: string) => ({ id: `socket-${token ?? 'none'}`, handshake: { auth: token ? { token } : {} }, data: {}, join: jest.fn(), emit: jest.fn(), disconnect: jest.fn() }) as any;
  beforeEach(() => { jest.resetAllMocks(); (gateway as any).connectedClients.clear(); });

  it('derives identity from a verified token, never handshake userId', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-a', role: 'CAMPUS_STAFF', ver: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true, authVersion: 0, role: { isActive: true } });
    const socket = client('valid'); socket.handshake.auth.userId = 'user-b';
    await gateway.handleConnection(socket);
    expect(socket.data.userId).toBe('user-a');
    expect(socket.join).toHaveBeenCalledWith('user:user-a');
  });

  it.each([undefined, 'invalid'])('rejects missing or invalid JWT without emitting a reserved event', async token => {
    if (token) jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
    const socket = client(token);
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('emits a targeted notification only to the authenticated user room', async () => {
    const to = jest.fn(() => ({ emit: jest.fn() }));
    (gateway as any).server = { to };
    (gateway as any).connectedClients.set('user-a', new Set(['a']));
    gateway.notifyNewNotification('user-a', { id: 'n', type: 'WORK_REQUEST_ASSIGNED', title: 't', message: 'm', referenceNo: 'WR-1', workRequestId: 'wr', createdAt: new Date(), isRead: false });
    expect(to).toHaveBeenCalledWith('user:user-a');
    expect(to).not.toHaveBeenCalledWith('user:user-b');
  });

  it('broadcasts identifier-only Work Request invalidation events', () => {
    const emit = jest.fn();
    (gateway as any).server = { emit };

    gateway.emitWorkRequestUpdated('wr-1', 'schedule-1');

    expect(emit).toHaveBeenCalledWith('work_request_updated', {
      workRequestId: 'wr-1',
      maintenanceScheduleId: 'schedule-1',
    });
  });

  it('disconnects every live socket for a revoked user', () => {
    const disconnect = jest.fn();
    (gateway as any).server = { sockets: { sockets: new Map([['a', { disconnect }]]) } };
    (gateway as any).connectedClients.set('user-a', new Set(['a']));
    gateway.disconnectUser('user-a');
    expect(disconnect).toHaveBeenCalledWith(true);
    expect((gateway as any).connectedClients.has('user-a')).toBe(false);
  });
});

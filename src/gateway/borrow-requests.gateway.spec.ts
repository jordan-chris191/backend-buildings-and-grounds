import { BorrowRequestsGateway } from './borrow-requests.gateway';

describe('BorrowRequestsGateway authentication', () => {
  const jwt: any = { verifyAsync: jest.fn() };
  const prisma: any = { user: { findUnique: jest.fn() } };
  const gateway = new BorrowRequestsGateway(jwt, prisma);
  const client = (token?: string) => ({ id: `socket-${token ?? 'none'}`, handshake: { auth: token ? { token } : {} }, data: {}, join: jest.fn(), emit: jest.fn(), disconnect: jest.fn() }) as any;
  beforeEach(() => { jest.resetAllMocks(); (gateway as any).connectedClients.clear(); });

  it('derives identity from a verified token, never handshake userId', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-a', role: 'Campus Staff' });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a', isActive: true });
    const socket = client('valid'); socket.handshake.auth.userId = 'user-b';
    await gateway.handleConnection(socket);
    expect(socket.data.userId).toBe('user-a');
    expect(socket.join).toHaveBeenCalledWith('user:user-a');
  });

  it.each([undefined, 'invalid'])('rejects missing or invalid JWT', async token => {
    if (token) jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
    const socket = client(token);
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits a targeted notification only to the authenticated user room', async () => {
    const to = jest.fn(() => ({ emit: jest.fn() }));
    (gateway as any).server = { to };
    (gateway as any).connectedClients.set('user-a', new Set(['a']));
    gateway.notifyNewNotification('user-a', { id: 'n', type: 'WORK_REQUEST_ASSIGNED', title: 't', message: 'm', referenceNo: 'WR-1', workRequestId: 'wr', createdAt: new Date(), isRead: false });
    expect(to).toHaveBeenCalledWith('user:user-a');
    expect(to).not.toHaveBeenCalledWith('user:user-b');
  });
});

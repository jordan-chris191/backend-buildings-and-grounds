import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    login: jest.fn(), refresh: jest.fn(), logout: jest.fn(),
    requestPasswordReset: jest.fn(), resetPassword: jest.fn(), getProfile: jest.fn(),
    createUser: jest.fn(), findUsers: jest.fn(), changeRole: jest.fn(),
    changeOffice: jest.fn(), deactivateUser: jest.fn(), reactivateUser: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [AuthService],
    }).overrideProvider(AuthService)
      .useValue(authService)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

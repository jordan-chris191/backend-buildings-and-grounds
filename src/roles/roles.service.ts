import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BorrowRequestsGateway } from '../gateway/borrow-requests.gateway';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BorrowRequestsGateway,
  ) {}

  async create(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: dto });
  }

  async findAll() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.findOne(id);
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const role = await this.prisma.role.update({
      where: { id },
      data: { isActive: false },
    });
    const users = await this.prisma.user.findMany({ where: { roleId: id, isActive: true }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { roleId: id, isActive: true }, data: { authVersion: { increment: 1 } } }),
      this.prisma.refreshToken.updateMany({ where: { user: { roleId: id }, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    users.forEach(({ id: userId }) => this.gateway.disconnectUser(userId));
    return role;
  }
}

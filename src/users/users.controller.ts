/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Session,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  ParseIntPipe,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from './dto';
import { AuthGuard, AdminGuard } from './guards';
import { CurrentUser } from './decorators';
import type { SessionUser } from './decorators';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Đăng ký tài khoản mới
   * POST /api/users/register
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    const user = await this.usersService.register(registerDto);
    return {
      message: 'Đăng ký thành công',
      user,
    };
  }

  /**
   * Đăng nhập
   * POST /api/users/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Session() session: Record<string, any>,
  ) {
    const user = await this.usersService.login(loginDto);

    // Lưu user ID vào session
    session.userId = user.id;
    session.username = user.username;
    session.role = user.role;

    const { password, ...userWithoutPassword } = user;

    return {
      message: 'Đăng nhập thành công',
      user: userWithoutPassword,
    };
  }

  /**
   * Đăng xuất
   * POST /api/users/logout
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Session() session: Record<string, any>) {
    return new Promise((resolve, reject) => {
      session.destroy((err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({ message: 'Đăng xuất thành công' });
        }
      });
    });
  }

  /**
   * Lấy thông tin profile của user đang đăng nhập
   * GET /api/users/profile
   */
  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() currentUser: SessionUser) {
    const user = await this.usersService.findById(currentUser.userId);
    return {
      user,
    };
  }

  /**
   * Cập nhật profile
   * PUT /api/users/profile
   */
  @Put('profile')
  @UseGuards(AuthGuard)
  async updateProfile(
    @Body(ValidationPipe) updateProfileDto: UpdateProfileDto,
    @CurrentUser() currentUser: SessionUser,
  ) {
    const user = await this.usersService.updateProfile(
      currentUser.userId,
      updateProfileDto,
    );

    return {
      message: 'Cập nhật thông tin thành công',
      user,
    };
  }

  /**
   * Đổi mật khẩu
   * POST /api/users/change-password
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async changePassword(
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto,
    @CurrentUser() currentUser: SessionUser,
  ) {
    await this.usersService.changePassword(
      currentUser.userId,
      changePasswordDto,
    );

    return {
      message: 'Đổi mật khẩu thành công',
    };
  }

  /**
   * Lấy danh sách users (Admin only)
   * GET /api/users?page=1&limit=10
   */
  @Get()
  @UseGuards(AdminGuard)
  async findAll(
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ) {
    return await this.usersService.findAll(page, limit);
  }

  /**
   * Lấy thông tin user theo ID (Admin only)
   * GET /api/users/:id
   */
  @Get(':id')
  @UseGuards(AdminGuard)
  async findById(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);
    return { user };
  }

  /**
   * Vô hiệu hóa/kích hoạt tài khoản (Admin only)
   * PUT /api/users/:id/toggle-active
   */
  @Put(':id/toggle-active')
  @UseGuards(AdminGuard)
  async toggleActiveStatus(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.toggleActiveStatus(id);
    return {
      message: `Tài khoản đã được ${user.isActive ? 'kích hoạt' : 'vô hiệu hóa'}`,
      user,
    };
  }
}

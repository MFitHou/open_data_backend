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
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from './dto';

// Interface tạm để thay thế User entity - EXPORTED
export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  fullName: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  // private readonly saltRounds = 10;

  // Dữ liệu cứng - hardcoded users
  private readonly hardcodedUsers: User[] = [
    {
      id: 1,
      username: 'admin',
      password: 'admin123', 
      email: 'admin@opendatafithou.org',
      fullName: 'Administrator',
      role: 'admin',
      isActive: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
  ];

  constructor(
    // @InjectRepository(User)
    // private readonly userRepository: Repository<User>,
  ) {
    this.logger.warn('UsersService đang chạy ở chế độ HARDCODED - Không kết nối database');
  }

  /**
   * Đăng ký tài khoản mới
   * HARDCODED: Chức năng tạm thời bị vô hiệu hóa
   */
  async register(registerDto: RegisterDto): Promise<Omit<User, 'password'>> {
    this.logger.warn('Register endpoint đã bị tắt (hardcoded mode)');
    throw new BadRequestException('Chức năng đăng ký tạm thời không khả dụng');
  }

  /**
   * Đăng nhập
   * HARDCODED: Chỉ kiểm tra với dữ liệu cứng
   */
  async login(loginDto: LoginDto): Promise<User> {
    const { username, password } = loginDto;

    // Tìm user trong danh sách hardcoded
    const user = this.hardcodedUsers.find(u => u.username === username);

    if (!user) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    // Kiểm tra tài khoản có active không
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    // So sánh password (không mã hóa trong hardcoded mode)
    if (password !== user.password) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    this.logger.log(`User logged in successfully (HARDCODED): ${username}`);
    return user;
  }

  /**
   * Lấy thông tin user theo ID
   * HARDCODED: Tìm trong danh sách cứng
   */
  async findById(id: number): Promise<User> {
    const user = this.hardcodedUsers.find(u => u.id === id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  /**
   * Lấy thông tin user theo username
   * HARDCODED: Tìm trong danh sách cứng
   */
  async findByUsername(username: string): Promise<User> {
    const user = this.hardcodedUsers.find(u => u.username === username);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  /**
   * Cập nhật thông tin profile
   * HARDCODED: Chức năng tạm thời bị vô hiệu hóa
   */
  async updateProfile(
    userId: number,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    this.logger.warn('UpdateProfile endpoint đã bị tắt (hardcoded mode)');
    throw new BadRequestException('Chức năng cập nhật profile tạm thời không khả dụng');
  }

  /**
   * Đổi mật khẩu
   * HARDCODED: Chức năng tạm thời bị vô hiệu hóa
   */
  async changePassword(
    userId: number,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    this.logger.warn('ChangePassword endpoint đã bị tắt (hardcoded mode)');
    throw new BadRequestException('Chức năng đổi mật khẩu tạm thời không khả dụng');
  }

  /**
   * Lấy danh sách tất cả users (cho admin)
   * HARDCODED: Trả về danh sách cứng
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    // Trả về danh sách users (không bao gồm password)
    const usersWithoutPassword = this.hardcodedUsers.map(({ password, ...user }) => user);
    
    return { 
      data: usersWithoutPassword as any,
      total: this.hardcodedUsers.length, 
      page, 
      limit 
    };
  }

  /**
   * Vô hiệu hóa/kích hoạt tài khoản (cho admin)
   * HARDCODED: Chức năng tạm thời bị vô hiệu hóa
   */
  async toggleActiveStatus(userId: number): Promise<User> {
    this.logger.warn('ToggleActiveStatus endpoint đã bị tắt (hardcoded mode)');
    throw new BadRequestException('Chức năng toggle active tạm thời không khả dụng');
  }
}

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

import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { CHAT_TOOL_METADATA } from '../common/decorators/chat-tools.decorator';
import { FunctionDeclaration } from '@google/generative-ai';

@Injectable()
export class ChatToolsRegistry implements OnModuleInit {
  // Danh sách schema để gửi cho Google
  public toolsSchema: FunctionDeclaration[] = [];

  // Map để lưu tham chiếu thực thi: 'tool_name' => { instance, methodName }
  private toolsMap = new Map<string, { instance: any; methodName: string }>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    this.discoverTools();
  }

  private discoverTools() {
    // 1. Lấy tất cả các controllers và providers trong ứng dụng
    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();

    [...providers, ...controllers].forEach((wrapper) => {
      const { instance } = wrapper;

      // Bỏ qua nếu instance không tồn tại (hoặc chưa khởi tạo)
      if (!instance || typeof instance !== 'object') return;

      // 2. Quét tất cả các method trong instance đó
      const methodNames = this.metadataScanner.getAllMethodNames(
        Object.getPrototypeOf(instance),
      );

      methodNames.forEach((methodName) => {
        const methodRef = instance[methodName];

        // 3. Kiểm tra xem method có được gắn @ChatTool không
        const metadata = this.reflector.get(CHAT_TOOL_METADATA, methodRef);

        if (metadata) {
          // Lưu schema
          this.toolsSchema.push(metadata);

          // Lưu tham chiếu để gọi sau này
          this.toolsMap.set(metadata.name, {
            instance,
            methodName,
          });

          console.log(
            `[Chat Tools Registry] Registered tool: ${metadata.name}`,
          );
        }
      });
    });
  }

  // Hàm thực thi tool từ bất kỳ đâu
  async executeTool(toolName: string, args: any) {
    const tool = this.toolsMap.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    // Gọi hàm thực tế từ Service gốc
    return await tool.instance[tool.methodName](args);
  }
}

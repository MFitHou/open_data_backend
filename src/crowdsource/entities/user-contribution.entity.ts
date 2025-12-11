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
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ContributionVote } from './contribution-vote.entity';

/**
 * Entity lưu trữ các đề xuất cập nhật POI từ người dùng
 */
@Entity('user_contributions')
@Index(['targetPoiId', 'proposalHash', 'status'])
export class UserContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  @Index()
  userId: number; // ID của user tạo contribution

  @Column({ name: 'target_poi_id', type: 'varchar', length: 255 })
  @Index()
  targetPoiId: string; // URI của POI gốc (ex:school_001)

  @Column({ name: 'report_uri', type: 'varchar', length: 500 })
  reportUri: string; // URI của báo cáo trong Fuseki (ext:report_uuid)

  @Column({ name: 'proposal_hash', type: 'varchar', length: 32 })
  @Index()
  proposalHash: string; // MD5 hash để phát hiện duplicate

  @Column({ name: 'proposed_data', type: 'json' })
  proposedData: Record<string, any>; // Dữ liệu đề xuất (telephone, wifi, opening_hours, etc.)

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  @Index()
  status: string;

  @Column({ name: 'upvotes', type: 'int', default: 1 })
  upvotes: number; // Số vote ủng hộ

  @Column({ name: 'downvotes', type: 'int', default: 0 })
  downvotes: number; // Số vote phản đối

  @Column({ name: 'auto_merged', type: 'boolean', default: false })
  autoMerged: boolean; // Tự động merge khi đạt threshold

  @Column({ name: 'trust_threshold', type: 'int', default: 5 })
  trustThreshold: number; // Ngưỡng cần đạt để auto-merge

  @OneToMany(() => ContributionVote, (vote) => vote.contribution, {
    cascade: true,
  })
  votes: ContributionVote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date;
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure';
@Injectable()
export class ConfigurationRepository {
  constructor(readonly db: DatabaseService) {}
  async targetsExist(ids: string[]) {
    return (await this.db.target.count({ where: { id: { in: ids } } })) === new Set(ids).size;
  }
  async audit(
    actor: string,
    action: string,
    resource: string,
    details: Record<string, string | number | boolean> = {},
  ): Promise<void> {
    await this.db.audit.create({ data: { actor, action, resource, details } });
  }
}

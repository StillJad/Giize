import { eq } from "drizzle-orm";
import type { Guild, GuildMember, GuildTextBasedChannel } from "discord.js";
import { config } from "../../config/config.js";
import { db } from "../../database/database.js";
import { welcomeConfigs } from "../../database/schema.js";
import { welcomeRenderer } from "./WelcomeRenderer.js";

export type WelcomeConfig = {
  guildId: string;
  enabled: boolean;
  channelId: string;
  title: string;
  description: string;
  roleId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
};

type SaveConfigInput = {
  guildId: string;
  channelId: string;
  title: string;
  description: string;
  roleId?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  color?: string | null;
};

export class WelcomeService {
  async saveConfig(input: SaveConfigInput) {
    const now = Date.now();
    const existingConfig = await this.getConfig(input.guildId);
    const values = {
      guildId: input.guildId,
      enabled: 1,
      channelId: input.channelId,
      title: input.title,
      description: input.description,
      roleId: input.roleId ?? null,
      imageUrl: this.optionalUrl(input.imageUrl),
      thumbnailUrl: this.optionalUrl(input.thumbnailUrl),
      color: this.optionalColor(input.color),
      createdAt: existingConfig?.createdAt ?? now,
      updatedAt: now,
    };

    await db
      .insert(welcomeConfigs)
      .values(values)
      .onConflictDoUpdate({
        target: welcomeConfigs.guildId,
        set: values,
      });
  }

  async disable(guildId: string) {
    const existingConfig = await this.getConfig(guildId);

    if (!existingConfig) {
      const now = Date.now();

      await db.insert(welcomeConfigs).values({
        guildId,
        enabled: 0,
        channelId: config.welcomeChannelId,
        title: "Welcome {username} to Giize Events!",
        description: "Welcome {mention} to Giize Events!",
        roleId: null,
        imageUrl: null,
        thumbnailUrl: null,
        color: null,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await db
      .update(welcomeConfigs)
      .set({ enabled: 0, updatedAt: Date.now() })
      .where(eq(welcomeConfigs.guildId, guildId));
  }

  async enable(guildId: string) {
    const existingConfig = await this.getConfig(guildId);

    if (!existingConfig) {
      const now = Date.now();

      await db.insert(welcomeConfigs).values({
        guildId,
        enabled: 1,
        channelId: config.welcomeChannelId,
        title: "Welcome {username} to Giize Events!",
        description: "Welcome {mention} to Giize Events!",
        roleId: null,
        imageUrl: null,
        thumbnailUrl: null,
        color: null,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await db
      .update(welcomeConfigs)
      .set({ enabled: 1, updatedAt: Date.now() })
      .where(eq(welcomeConfigs.guildId, guildId));
  }

  async getConfig(guildId: string) {
    const [config] = await db
      .select()
      .from(welcomeConfigs)
      .where(eq(welcomeConfigs.guildId, guildId))
      .limit(1);

    if (!config) {
      return undefined;
    }

    return {
      ...config,
      enabled: config.enabled === 1,
    } satisfies WelcomeConfig;
  }

  async sendWelcome(member: GuildMember) {
    const savedConfig = await this.getConfig(member.guild.id);

    if (savedConfig && !savedConfig.enabled) {
      return;
    }

    if (config.welcomeRoleId) {
      await member.roles.add(config.welcomeRoleId, "Welcome role").catch(() => {});
    }

    const channel = member.guild.channels.cache.get(config.welcomeChannelId);

    if (!channel?.isTextBased() || !("send" in channel)) {
      return;
    }

    await (channel as GuildTextBasedChannel).send({
      embeds: [welcomeRenderer.render(member)],
    });
  }

  async preview(guild: Guild, member: GuildMember) {
    const savedConfig = await this.getConfig(guild.id);

    return savedConfig && !savedConfig.enabled ? undefined : welcomeRenderer.render(member);
  }

  private optionalUrl(value?: string | null) {
    if (!value) return null;

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }

  private optionalColor(value?: string | null) {
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  }
}

export const welcomeService = new WelcomeService();
